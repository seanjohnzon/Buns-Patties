// Checkout, for the app and the website alike. The server builds and prices the
// order (_shared/build-order.ts — the phone never sends a price), then hands it
// to Square as an itemised order on a Square-hosted payment page. The customer
// pays there (card, Apple Pay, Google Pay) and comes back to their order screen.
// Money goes straight into the owner's Square account; Square tells us by
// webhook (square-webhook) and the sweep (reconcile-orders) catches anything missed.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL,
//          SQUARE_ENV, and either the owner's connection (square-oauth) or, in
//          sandbox, SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID.
import { buildOrder } from '../_shared/build-order.ts';
import { admin, caller, cors, json } from '../_shared/http.ts';
import { acceptSquareTotal, e164, squareAuth, squareFetch, squareOrder } from '../_shared/square.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const user = await caller(req);
  if (!user) return json({ error: 'Sign in first.' }, 401);

  const sb = admin();
  const body = await req.json().catch(() => ({}));
  const built = await buildOrder(sb, user.id, body);
  if ('error' in built) return json({ error: built.error }, built.status);

  // Nothing to pay (the free drink on its own): straight onto the kitchen board.
  // Safe because the total was worked out here from verified rewards.
  if (built.total === 0) {
    await sb.from('orders').update({ status: 'received' }).eq('id', built.orderId).eq('status', 'pending_payment');
    return json({ orderId: built.orderId, free: true });
  }

  const cancel = (why: string, status = 502) =>
    sb.from('orders').update({ status: 'cancelled' }).eq('id', built.orderId).eq('status', 'pending_payment')
      .then(() => json({ error: why }, status));

  const sq = await squareAuth(sb);
  if (!sq) return cancel('Card payments are not connected yet. Please pay at the window.', 409);

  const site = Deno.env.get('PUBLIC_SITE_URL') ?? '';
  let link: any;
  try {
    link = await squareFetch(sq.base, sq.token, '/v2/online-checkout/payment-links', {
      body: {
        idempotency_key: built.orderId,
        order: squareOrder({ orderId: built.orderId, lines: built.lines, tip: built.tip, pickupName: built.pickupName, pickupAt: built.pickupAt }, sq.locationId),
        checkout_options: { redirect_url: `${site}/order/${built.orderId}?paid=1`, allow_tipping: false, ask_for_shipping_address: false },
        pre_populated_data: { buyer_phone_number: e164(built.phone) },
        payment_note: `App order for ${built.pickupName ?? 'pickup'} (${built.orderId.slice(0, 8)})`,
      },
    });
  } catch (e) {
    return cancel(`Could not start the payment: ${(e as Error).message}`);
  }

  // Square adds the tax itself; take its figures (they are what the card is
  // charged) as long as they agree with ours to the cent or two.
  const sqOrder = link?.related_resources?.orders?.[0];
  const sqTotal = sqOrder?.total_money?.amount;
  if (typeof sqTotal === 'number' && !acceptSquareTotal(built.total, sqTotal)) {
    return cancel(`Totals disagree (ours ${built.total}, Square ${sqTotal / 100}). Nothing was charged.`, 500);
  }

  const { error } = await sb.from('orders').update({
    square_order_id: link.payment_link.order_id,
    square_payment_link_id: link.payment_link.id,
    checkout_url: link.payment_link.url,
    ...(typeof sqTotal === 'number' ? {
      total: sqTotal / 100,
      tax: (sqOrder.total_tax_money?.amount ?? Math.round(built.tax * 100)) / 100,
    } : {}),
  }).eq('id', built.orderId);
  if (error) return cancel(`Could not save the payment link: ${error.message}`, 500);

  return json({ orderId: built.orderId, checkoutUrl: link.payment_link.url });
});

// Square -> order status. The hinge the whole business hangs on: if this fails
// quietly, a customer is charged and the kitchen never hears about it.
//
//   1. NEVER return 2xx unless the work actually succeeded. Square retries
//      anything else, which heals most outages by itself.
//   2. Everything must be safe to run twice, because retries mean it will be.
//   3. One Square app serves every restaurant, so events for other merchants
//      (and card payments taken on the truck's own reader) are ignored.
//
// Subscribe (Square Developer Console -> Webhooks) to: payment.created,
// payment.updated, refund.created, refund.updated.
// Secrets: SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_URL (exactly as entered
//          in the console), SQUARE_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { admin, notify } from '../_shared/http.ts';
import { ORDER_SOURCE, fullyRefunded, squareAuth, squareFetch, verifySquareSignature } from '../_shared/square.ts';

Deno.serve(async (req) => {
  const raw = await req.text();
  const ok = await verifySquareSignature(
    raw, req.headers.get('x-square-hmacsha256-signature'),
    Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? '', Deno.env.get('SQUARE_WEBHOOK_URL') ?? '',
  );
  // A bad signature is not retryable — 400 so Square gives up on it.
  if (!ok) return new Response('bad signature', { status: 400 });

  const event = JSON.parse(raw);
  const sb = admin();

  // Not this restaurant's Square account: acknowledge and do nothing.
  const { data: conn } = await sb.from('square_connection').select('merchant_id').eq('id', 1).maybeSingle();
  const mine = Deno.env.get('SQUARE_MERCHANT_ID') || conn?.merchant_id;
  if (mine && event.merchant_id && event.merchant_id !== mine) return new Response('not ours');

  try {
    // Recorded first; the key is Square's event id, so a retry of something
    // already finished is recognised instead of redone.
    const { data: seen } = await sb.from('webhook_events').select('handled_at').eq('id', event.event_id).maybeSingle();
    if (seen?.handled_at) return new Response('already handled');
    await sb.from('webhook_events').upsert({ id: event.event_id, type: event.type, received_at: new Date().toISOString() });

    if (event.type === 'payment.created' || event.type === 'payment.updated') {
      const p = event.data?.object?.payment;
      if (p?.status === 'COMPLETED' && p.order_id) {
        const order = await findOrder(sb, p.order_id);
        if (order) {
          // Mark it paid at Square first, on its own: if opening the order then
          // fails, the kitchen board's "paid, not on the board" list shows it.
          await sb.from('orders').update({ square_payment_id: p.id, square_paid_at: new Date().toISOString() })
            .eq('id', order.id).is('square_paid_at', null);
          const { data: opened, error } = await sb.from('orders').update({ status: 'received' })
            .eq('id', order.id).eq('status', 'pending_payment').select('id').maybeSingle();
          if (error) throw new Error(`order update failed: ${error.message}`);
          if (opened) await notify(sb, order.user_id, 'Order received', 'We’re on it. We’ll ping you when it’s ready.');
        }
      }
    }

    if (event.type === 'refund.created' || event.type === 'refund.updated') {
      const r = event.data?.object?.refund;
      if (r?.status === 'COMPLETED') {
        const order = r.order_id ? await findOrder(sb, r.order_id) : null;
        if (order && order.status !== 'cancelled') {
          // Refunds can come in pieces; cancel only once the whole payment is back.
          // Cancelling hands back its stamps and offers (on_order_paid trigger).
          const sq = await squareAuth(sb);
          const payment = sq && r.payment_id ? (await squareFetch(sq.base, sq.token, `/v2/payments/${r.payment_id}`)).payment : null;
          if (fullyRefunded(payment)) {
            const { error } = await sb.from('orders').update({ status: 'cancelled' }).eq('id', order.id).neq('status', 'cancelled');
            if (error) throw new Error(`refund update failed: ${error.message}`);
          }
        }
      }
    }

    await sb.from('webhook_events').update({ handled_at: new Date().toISOString() }).eq('id', event.event_id);
    return new Response('ok');
  } catch (e) {
    const message = (e as Error).message;
    await sb.from('webhook_events').update({ error: message }).eq('id', event.event_id);
    return new Response(`failed: ${message}`, { status: 500 });
  }
});

/**
 * Our order for a Square order id. Normally stored at checkout; if not (a
 * payment that raced the save, or a sandbox quirk), Square's order carries our
 * id as reference_id — but only app orders, never the truck's own reader.
 */
// deno-lint-ignore no-explicit-any
async function findOrder(sb: any, squareOrderId: string) {
  const { data } = await sb.from('orders').select('id, user_id, status').eq('square_order_id', squareOrderId).maybeSingle();
  if (data) return data;
  const sq = await squareAuth(sb);
  if (!sq) return null;
  const o = (await squareFetch(sq.base, sq.token, `/v2/orders/${squareOrderId}`)).order;
  if (!o?.reference_id || o.source?.name !== ORDER_SOURCE) return null;
  const { data: byRef } = await sb.from('orders').update({ square_order_id: squareOrderId })
    .eq('id', o.reference_id).is('square_order_id', null).select('id, user_id, status').maybeSingle();
  if (byRef) return byRef;
  const { data: again } = await sb.from('orders').select('id, user_id, status').eq('id', o.reference_id).maybeSingle();
  return again ?? null;
}

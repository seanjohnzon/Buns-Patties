// The safety net. Webhooks are a push, and any push can be missed — a deploy at
// the wrong moment, an outage, a misconfigured endpoint. Every five minutes this
// asks Square the other way round, and makes our database agree:
//
//   - an app order still waiting on payment whose Square order is paid → open it
//     (the trigger adds the stamp);
//   - one abandoned for over an hour → close its payment link first (so it can
//     never be paid later), then cancel it (the trigger hands back rewards);
//   - money Square took for an app order we have no row for → flagged.
//
// Square is the source of truth for money. We are the source of truth for food.
// Run it on a schedule — see supabase/cron.sql.
// Secrets: RECONCILE_SECRET, SQUARE_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { admin, json } from '../_shared/http.ts';
import { ORDER_SOURCE, orderIsPaid, squareAuth, squareFetch } from '../_shared/square.ts';

const ABANDONED_MIN = 60;

Deno.serve(async (req) => {
  if (req.headers.get('x-reconcile-secret') !== Deno.env.get('RECONCILE_SECRET')) {
    return new Response('no', { status: 401 });
  }
  const sb = admin();
  const sq = await squareAuth(sb);
  if (!sq) return json({ skipped: 'Square not connected' });

  const fixed: string[] = [], closed: string[] = [], orphans: string[] = [];
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  // Younger than two minutes and the customer may still be on the payment page.
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: pending, error } = await sb.from('orders')
    .select('id, square_order_id, square_payment_link_id, created_at')
    .eq('status', 'pending_payment').not('square_order_id', 'is', null)
    .lt('created_at', cutoff).gte('created_at', dayAgo);
  if (error) return json({ error: error.message }, 500);

  for (const o of pending ?? []) {
    let order: any;
    try { order = (await squareFetch(sq.base, sq.token, `/v2/orders/${o.square_order_id}`)).order; }
    catch { continue; }   // try again next sweep

    if (orderIsPaid(order)) {
      const paymentId = order.tenders?.[0]?.payment_id ?? order.tenders?.[0]?.id ?? null;
      const { error: e } = await sb.from('orders').update({ status: 'received', square_payment_id: paymentId })
        .eq('id', o.id).eq('status', 'pending_payment');
      if (!e) fixed.push(o.id);
    } else if (Date.now() - new Date(o.created_at).getTime() > ABANDONED_MIN * 60 * 1000) {
      // Close the door before cancelling, or they could pay for a dead order.
      try {
        if (o.square_payment_link_id) {
          await squareFetch(sq.base, sq.token, `/v2/online-checkout/payment-links/${o.square_payment_link_id}`, { method: 'DELETE' });
        }
        await sb.from('orders').update({ status: 'cancelled' }).eq('id', o.id).eq('status', 'pending_payment');
        closed.push(o.id);
      } catch { /* link still open — leave the order, try again next sweep */ }
    }
  }

  // The other direction: app payments with no order row. Card payments taken at
  // the truck's own Square reader are not ours, so only orders whose source is
  // the app count.
  try {
    const pays = await squareFetch(sq.base, sq.token, `/v2/payments?begin_time=${encodeURIComponent(dayAgo)}&location_id=${sq.locationId}&limit=100`);
    const ids = [...new Set((pays.payments ?? []).filter((p: any) => p.status === 'COMPLETED' && p.order_id).map((p: any) => p.order_id as string))];
    if (ids.length) {
      const { data: ours } = await sb.from('orders').select('square_order_id').in('square_order_id', ids);
      const known = new Set((ours ?? []).map((r: any) => r.square_order_id));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length) {
        const got = await squareFetch(sq.base, sq.token, '/v2/orders/batch-retrieve', { body: { location_id: sq.locationId, order_ids: unknown.slice(0, 100) } });
        for (const ord of got.orders ?? []) if (ord.source?.name === ORDER_SOURCE) orphans.push(ord.id);
      }
    }
  } catch { /* the next sweep will look again */ }

  if (fixed.length || orphans.length) {
    await sb.from('webhook_events').upsert({
      id: `reconcile-${Date.now()}`, type: 'reconcile',
      received_at: new Date().toISOString(), handled_at: new Date().toISOString(),
      error: orphans.length ? `app payments with no order: ${orphans.join(', ')}` : null,
    });
  }
  return json({ checked: pending?.length ?? 0, fixed, closed, orphans });
});

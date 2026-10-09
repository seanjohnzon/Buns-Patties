// The safety net. Webhooks are a push, and any push can be missed — a deploy at
// the wrong moment, an outage, a misconfigured endpoint. Every five minutes this
// asks Square the other way round, and makes our database agree:
//
//   - an app order still waiting on payment whose Square order is paid → open it
//     (the trigger adds the stamp);
//   - one abandoned for over an hour → close its payment page first (so it can
//     never be paid later), then cancel it (the trigger hands back its rewards);
//   - a checkout that never got as far as Square → cancel it;
//   - money Square took for an app order we have no row for → flagged.
//
// Square is the source of truth for money. We are the source of truth for food.
// Run it on a schedule — see supabase/cron.sql.
// Secrets: SQUARE_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. The secret the
// cron job sends is made and kept in the database (cron.sql), so there is
// nothing to copy across; RECONCILE_SECRET is only for running this by hand.
import { admin, json } from '../_shared/http.ts';
import { ORDER_SOURCE, SquareError, orderIsPaid, squareAuth, squareFetch } from '../_shared/square.ts';

const ABANDONED_MIN = 60;
const LOOKBACK_DAYS = 3;

/**
 * Only the cron job may run the sweep. If RECONCILE_SECRET is set on the
 * function, that is the secret. Otherwise the database is asked whether the
 * one it was sent matches the one in its Vault. No secret sent, no sweep.
 */
// deno-lint-ignore no-explicit-any
async function allowed(sb: any, sent: string | null) {
  if (!sent) return false;
  const fixedSecret = Deno.env.get('RECONCILE_SECRET');
  if (fixedSecret) return sent === fixedSecret;
  const { data, error } = await sb.rpc('reconcile_secret_ok', { p_secret: sent });
  return !error && data === true;
}

Deno.serve(async (req) => {
  const sb = admin();
  if (!(await allowed(sb, req.headers.get('x-reconcile-secret')))) {
    return new Response('no', { status: 401 });
  }
  const fixed: string[] = [], closed: string[] = [], orphans: string[] = [], failed: string[] = [];
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
  const minutesOld = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

  const cancelRow = async (id: string) => {
    const { error } = await sb.from('orders').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending_payment');
    if (error) failed.push(`${id}: ${error.message}`); else closed.push(id);
  };

  // Younger than two minutes and the customer may still be on the payment page.
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: pending, error } = await sb.from('orders')
    .select('id, square_order_id, square_payment_link_id, created_at')
    .eq('status', 'pending_payment').lt('created_at', cutoff).gte('created_at', since);
  if (error) return json({ error: error.message }, 500);

  // Checkouts that never reached Square (the function died half way).
  for (const o of (pending ?? []).filter((x) => !x.square_order_id)) {
    if (minutesOld(o.created_at) > 10) await cancelRow(o.id);
  }

  const sq = await squareAuth(sb);
  if (!sq) return json({ skipped: 'Square not connected', closed, failed });

  for (const o of (pending ?? []).filter((x) => x.square_order_id)) {
    let order: any;
    try { order = (await squareFetch(sq.base, sq.token, `/v2/orders/${o.square_order_id}`)).order; }
    catch { continue; }   // try again next sweep

    if (orderIsPaid(order)) {
      const paymentId = order.tenders?.[0]?.payment_id ?? order.tenders?.[0]?.id ?? null;
      await sb.from('orders').update({ square_payment_id: paymentId, square_paid_at: new Date().toISOString() })
        .eq('id', o.id).is('square_paid_at', null);
      const { error: e } = await sb.from('orders').update({ status: 'received' }).eq('id', o.id).eq('status', 'pending_payment');
      if (e) failed.push(`${o.id}: ${e.message}`); else fixed.push(o.id);
    } else if (order?.state === 'CANCELED') {
      await cancelRow(o.id);                 // Square already closed it
    } else if (minutesOld(o.created_at) > ABANDONED_MIN) {
      // Close the door before cancelling, or they could pay for a dead order.
      // A link that is already gone (404) counts as closed.
      try {
        if (o.square_payment_link_id) {
          await squareFetch(sq.base, sq.token, `/v2/online-checkout/payment-links/${o.square_payment_link_id}`, { method: 'DELETE' });
        }
        await cancelRow(o.id);
      } catch (e) {
        if (e instanceof SquareError && e.status === 404) await cancelRow(o.id);
        // otherwise the link may still be open — leave the order, try next sweep
      }
    }
  }

  // The other direction: app payments with no order row. Card payments taken at
  // the truck's own Square reader are not ours, so only orders whose source is
  // the app count.
  try {
    const pays = await squareFetch(sq.base, sq.token, `/v2/payments?begin_time=${encodeURIComponent(since)}&location_id=${sq.locationId}&limit=100`);
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

  if (fixed.length || orphans.length || failed.length) {
    await sb.from('webhook_events').upsert({
      id: `reconcile-${Date.now()}`, type: 'reconcile',
      received_at: new Date().toISOString(), handled_at: new Date().toISOString(),
      error: [orphans.length ? `app payments with no order: ${orphans.join(', ')}` : '', failed.join('; ')].filter(Boolean).join(' | ') || null,
    });
  }
  return json({ checked: pending?.length ?? 0, fixed, closed, orphans, failed });
});

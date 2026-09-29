// Square -> order status. The hinge the whole business hangs on: if this fails
// quietly, a customer is charged and the kitchen never hears about it.
//
//   1. NEVER return 2xx unless the work actually succeeded. Square retries
//      anything else, which heals most outages by itself.
//   2. Everything must be safe to run twice, because retries mean it will be.
//
// Subscribe (Square Developer Console -> Webhooks) to: payment.created,
// payment.updated, refund.created, refund.updated.
// Secrets: SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_URL (exactly as entered
//          in the console), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { admin, notify } from '../_shared/http.ts';
import { verifySquareSignature } from '../_shared/square.ts';

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

  try {
    // Recorded first; the key is Square's event id, so a retry of something
    // already finished is recognised instead of redone.
    const { data: seen } = await sb.from('webhook_events').select('handled_at').eq('id', event.event_id).maybeSingle();
    if (seen?.handled_at) return new Response('already handled');
    await sb.from('webhook_events').upsert({ id: event.event_id, type: event.type, received_at: new Date().toISOString() });

    if (event.type === 'payment.created' || event.type === 'payment.updated') {
      const p = event.data?.object?.payment;
      if (p?.status === 'COMPLETED' && p.order_id) {
        const { data: order, error } = await sb.from('orders')
          .update({ status: 'received', square_payment_id: p.id })
          .eq('square_order_id', p.order_id)
          .eq('status', 'pending_payment')          // first time only; retries no-op
          .select('id, user_id').maybeSingle();
        if (error) throw new Error(`order update failed: ${error.message}`);
        if (order) {
          await notify(sb, order.user_id, 'Order received', 'We’re on it. We’ll ping you when it’s ready.');
        } else {
          // Not ours (a card taken at the truck on the Square reader), or
          // already handled. Only worth a note if it is an app order we lost.
          const { data: known } = await sb.from('orders').select('id').eq('square_order_id', p.order_id).maybeSingle();
          if (!known && p.note?.startsWith?.('App order')) {
            await sb.from('webhook_events').update({ error: `paid app order with no row: ${p.order_id}` }).eq('id', event.event_id);
          }
        }
      }
    }

    if (event.type === 'refund.created' || event.type === 'refund.updated') {
      const r = event.data?.object?.refund;
      if (r?.status === 'COMPLETED' && r.payment_id) {
        const { data: o } = await sb.from('orders').select('id, total').eq('square_payment_id', r.payment_id).maybeSingle();
        // A full refund cancels the order, which hands back stamps and offers
        // (on_order_paid trigger). A partial refund leaves the order standing.
        if (o && Math.round(Number(o.total) * 100) <= (r.amount_money?.amount ?? 0)) {
          const { error } = await sb.from('orders').update({ status: 'cancelled' }).eq('id', o.id).neq('status', 'cancelled');
          if (error) throw new Error(`refund update failed: ${error.message}`);
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

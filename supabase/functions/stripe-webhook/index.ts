// Stripe -> order status. This is the hinge the whole business hangs on: if it
// fails quietly, a customer is charged and the kitchen never hears about it.
//
// Two rules here:
//   1. NEVER return 2xx unless the work actually succeeded. A 2xx tells Stripe
//      "delivered, stop", and it will not try again. Returning 500 makes Stripe
//      retry with backoff for up to three days, which fixes most outages by itself.
//   2. Everything must be safe to run twice, because retries mean it will be.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' });

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  if (!sig) return new Response('no signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch (e) {
    // A bad signature is not retryable — 400 so Stripe gives up on it.
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Record the event first. The primary key is Stripe's event id, so a retry
    // of something we already finished is recognised instead of redone.
    const { data: seen } = await sb.from('webhook_events').select('handled_at').eq('id', event.id).maybeSingle();
    if (seen?.handled_at) return new Response('already handled');

    await sb.from('webhook_events').upsert({ id: event.id, type: event.type, received_at: new Date().toISOString() });

    // Web checkout finishes as a session; attach the payment intent so the rest
    // of the system (and the reconciliation sweep) sees one kind of order.
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const orderId = s.metadata?.order_id;
      if (orderId && s.payment_status === 'paid') {
        const { error } = await sb.from('orders')
          .update({ status: 'received', stripe_payment_intent: s.payment_intent as string })
          .eq('id', orderId).eq('status', 'pending_payment');
        if (error) throw new Error(`checkout update failed: ${error.message}`);
        const { data: o } = await sb.from('orders').select('user_id').eq('id', orderId).maybeSingle();
        if (o) { try { await notify(sb, o.user_id, 'Order received', 'We’re on it. We’ll ping you when it’s ready.'); } catch (_) {} }
      }
    }

    if (event.type === 'checkout.session.expired') {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.order_id) {
        await sb.from('orders').update({ status: 'cancelled' })
          .eq('id', s.metadata.order_id).eq('status', 'pending_payment');
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { data: order, error } = await sb
        .from('orders')
        .update({ status: 'received' })
        .eq('stripe_payment_intent', pi.id)
        .eq('status', 'pending_payment')   // only the first time; retries no-op
        .select()
        .maybeSingle();

      if (error) throw new Error(`order update failed: ${error.message}`);

      if (!order) {
        // Either already handled, or we have money with no matching order.
        const { data: existing } = await sb.from('orders').select('id,status').eq('stripe_payment_intent', pi.id).maybeSingle();
        if (!existing) {
          // The web path attaches the intent on checkout.session.completed, so a
          // race here is normal — only shout if nothing claims it at all.
          // Paid, but nothing to cook. Flag it loudly rather than dropping it —
          // reconcile-orders and the staff screen both look for this.
          await sb.from('webhook_events').update({
            error: `paid but no order row for ${pi.id} (${pi.amount} ${pi.currency})`,
          }).eq('id', event.id);
          throw new Error(`no order for payment intent ${pi.id}`);
        }
      } else {
        // Best effort — a failed push must never undo a confirmed order.
        try { await notify(sb, order.user_id, 'Order received', 'We’re on it. We’ll ping you when it’s ready.'); }
        catch (_) { /* ignore */ }
      }
    }

    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { error } = await sb.from('orders')
        .update({ status: 'cancelled' })
        .eq('stripe_payment_intent', pi.id)
        .eq('status', 'pending_payment');
      if (error) throw new Error(`cancel failed: ${error.message}`);
    }

    if (event.type === 'charge.refunded') {
      const ch = event.data.object as Stripe.Charge;
      if (ch.payment_intent) {
        const { error } = await sb.from('orders')
          .update({ status: 'cancelled' })
          .eq('stripe_payment_intent', ch.payment_intent as string);
        if (error) throw new Error(`refund update failed: ${error.message}`);
      }
    }

    await sb.from('webhook_events').update({ handled_at: new Date().toISOString() }).eq('id', event.id);
    return new Response('ok');

  } catch (e) {
    const message = (e as Error).message;
    await sb.from('webhook_events').update({ error: message }).eq('id', event.id);
    // 500 on purpose: Stripe retries, and most transient failures heal themselves.
    return new Response(`failed: ${message}`, { status: 500 });
  }
});

async function notify(sb: any, userId: string, title: string, body: string) {
  const { data } = await sb.from('profiles').select('expo_push_token').eq('id', userId).maybeSingle();
  if (!data?.expo_push_token) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: data.expo_push_token, title, body }),
  });
}

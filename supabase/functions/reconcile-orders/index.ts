// The safety net. Webhooks are a push, and any push can be missed — a deploy at
// the wrong moment, an outage, a misconfigured endpoint. This asks Stripe the
// other way round: "which payments succeeded?", then makes our database agree.
//
// Stripe is the source of truth for money. We are the source of truth for food.
// This is the bit that keeps the two in step without anyone watching.
//
// Run it on a schedule (every 5 minutes) — see supabase/cron.sql.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RECONCILE_SECRET
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' });

Deno.serve(async (req) => {
  // Not a public endpoint.
  if (req.headers.get('x-reconcile-secret') !== Deno.env.get('RECONCILE_SECRET')) {
    return new Response('no', { status: 401 });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // one day back is plenty
  const fixed: string[] = [];
  const orphans: string[] = [];

  // Anything still waiting on payment that is older than two minutes. Younger
  // than that and the customer may simply still be on the payment sheet.
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: pending, error } = await sb
    .from('orders')
    .select('id, stripe_payment_intent, stripe_checkout_session, created_at')
    .eq('status', 'pending_payment')
    .lt('created_at', cutoff)
    .gte('created_at', new Date(since * 1000).toISOString());

  if (error) return json({ error: error.message }, 500);

  for (const order of pending ?? []) {
    // Web orders start with only a checkout session; ask Stripe what became of it.
    if (!order.stripe_payment_intent && order.stripe_checkout_session) {
      try {
        const s = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session);
        if (s.payment_status === 'paid') {
          const { error: e3 } = await sb.from('orders')
            .update({ status: 'received', stripe_payment_intent: s.payment_intent as string })
            .eq('id', order.id).eq('status', 'pending_payment');
          if (!e3) fixed.push(order.id);
        } else if (s.status === 'expired') {
          await sb.from('orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending_payment');
        }
      } catch { /* ignore, try again next sweep */ }
      continue;
    }
    if (!order.stripe_payment_intent) continue;
    let pi: Stripe.PaymentIntent;
    try { pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent); }
    catch { continue; }

    if (pi.status === 'succeeded') {
      // Money taken, order never opened. Open it — the trigger adds the stamp.
      const { error: e2 } = await sb.from('orders')
        .update({ status: 'received' })
        .eq('id', order.id)
        .eq('status', 'pending_payment');
      if (!e2) fixed.push(order.id);
    } else if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
      // Abandoned at the payment sheet — clear it off the pending list.
      await sb.from('orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending_payment');
    }
  }

  // The other direction: money Stripe took that has no order at all. Should be
  // impossible (the order row is written before the payment intent exists), but
  // if it ever happens somebody has paid for nothing and must be found.
  const charges = await stripe.paymentIntents.list({ created: { gte: since }, limit: 100 });
  for (const pi of charges.data) {
    if (pi.status !== 'succeeded') continue;
    const { data: match } = await sb.from('orders').select('id').eq('stripe_payment_intent', pi.id).maybeSingle();
    if (!match) orphans.push(pi.id);
  }

  if (fixed.length || orphans.length) {
    await sb.from('webhook_events').upsert({
      id: `reconcile-${Date.now()}`,
      type: 'reconcile',
      received_at: new Date().toISOString(),
      handled_at: new Date().toISOString(),
      error: orphans.length ? `payments with no order: ${orphans.join(', ')}` : null,
    });
  }

  return json({ checked: pending?.length ?? 0, fixed, orphans });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}

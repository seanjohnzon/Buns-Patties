// Native checkout: builds the order, then hands back a PaymentIntent for the
// Stripe payment sheet. All the order rules live in ../_shared/build-order.ts,
// shared with the web checkout so the two can never drift apart.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildOrder } from '../_shared/build-order.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' });

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  ).auth.getUser();
  if (!user) return json({ error: 'unauthenticated' }, 401);

  const built = await buildOrder(sb, user.id, await req.json());
  if ('error' in built) return json({ error: built.error }, built.status);

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: built.customerId }, { apiVersion: '2024-12-18.acacia' },
  );
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(built.total * 100), currency: 'usd', customer: built.customerId,
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: built.orderId, user_id: user.id },
  });
  await sb.from('orders').update({ stripe_payment_intent: pi.id }).eq('id', built.orderId);

  return json({
    orderId: built.orderId,
    paymentIntentClientSecret: pi.client_secret,
    customerId: built.customerId,
    ephemeralKey: ephemeralKey.secret,
    totals: { subtotal: built.subtotal, tax: built.tax, tip: built.tip, total: built.total },
  });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}

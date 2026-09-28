// Web checkout. Same order-building and entitlement rules as the native path —
// the only difference is that Stripe hosts the payment page and we redirect to
// it, which is what lets the web version take money with no app store involved.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SITE_URL
import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildOrder } from '../_shared/build-order.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  ).auth.getUser();
  if (!user) return json({ error: 'unauthenticated' }, 401);

  const body = await req.json();
  const built = await buildOrder(sb, user.id, body);
  if ('error' in built) return json({ error: built.error }, built.status);

  const site = Deno.env.get('PUBLIC_SITE_URL') ?? '';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: built.customerId,
    // One line so the customer sees the real total; the itemisation is in the app.
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(built.total * 100),
        product_data: { name: `Buns & Patties — order for ${built.pickupName ?? 'pickup'}` },
      },
    }],
    payment_intent_data: { metadata: { order_id: built.orderId, user_id: user.id } },
    metadata: { order_id: built.orderId, user_id: user.id },
    success_url: `${site}/order/${built.orderId}?paid=1`,
    cancel_url: `${site}/cart?cancelled=1`,
  });

  await sb.from('orders').update({ stripe_checkout_session: session.id }).eq('id', built.orderId);
  return json({ orderId: built.orderId, checkoutUrl: session.url });
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

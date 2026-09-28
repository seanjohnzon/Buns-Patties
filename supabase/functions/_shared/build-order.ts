// Building an order, in one place, used by both the native and the web checkout.
//
// THE RULE: the client never sets a price. It says what it wants and which
// entitlement it is claiming; this file looks up every price itself and decides
// whether that entitlement is real. A line is free only because we proved it is
// owed, never because the phone said so.
//
// Two payment paths must never drift apart on these rules, which is why they
// both come through here.

const TAX_RATE = 0.0;   // match lib/pricing.ts

export type BuiltOrder = {
  orderId: string;
  subtotal: number; tax: number; tip: number; total: number;
  customerId: string;
  pickupName: string | null;
};

export type BuildFailure = { error: string; status: number };

export async function buildOrder(sb: any, userId: string, body: any): Promise<BuiltOrder | BuildFailure> {
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) return { error: 'empty order', status: 400 };

  const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (!profile) return { error: 'no profile', status: 400 };

  const { data: items } = await sb.from('menu_items')
    .select('id, price, modifier_groups, available, sold_out_until')
    .in('id', lines.map((l: any) => l.menuItemId));

  // Entitlements, read fresh from the database — never from the request.
  const { data: claims } = await sb.from('campaign_claims')
    .select('campaign_id, used_at').eq('user_id', userId).is('used_at', null);
  const { data: campaigns } = await sb.from('campaigns').select('id, reward_item_id, active, ends_at');
  const { data: rewards } = await sb.from('rewards').select('*');

  let subtotal = 0;
  let pointsToSpend = 0;
  const usedCampaigns = new Set<string>();
  const usedRewards = new Set<string>();
  const priced: any[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const l of lines) {
    const it = items?.find((i: any) => i.id === l.menuItemId);
    if (!it) return { error: `unknown item ${l.menuItemId}`, status: 400 };
    if (!it.available) return { error: `${l.menuItemId} is not available`, status: 400 };
    if (it.sold_out_until && it.sold_out_until >= today) {
      return { error: `${l.menuItemId} is sold out`, status: 409 };
    }

    const qty = Math.max(1, Math.min(20, Math.floor(Number(l.qty) || 1)));
    const opts = (it.modifier_groups as any[]).flatMap((g) => g.options);
    const mods: string[] = Array.isArray(l.mods) ? l.mods : [];
    const modDelta = mods.reduce((s, name) => s + (opts.find((o: any) => o.name === name)?.priceDelta ?? 0), 0);
    let unit = Number(it.price) + modDelta;

    if (l.campaign) {
      const claimed = claims?.some((c: any) => c.campaign_id === l.campaign);
      if (!claimed) return { error: 'that offer has not been unlocked', status: 403 };
      if (usedCampaigns.has(l.campaign)) return { error: 'that offer is already in this order', status: 403 };
      const camp = campaigns?.find((c: any) => c.id === l.campaign);
      if (!camp || !camp.active) return { error: 'that offer is not running', status: 403 };
      if (camp.ends_at && new Date(camp.ends_at) <= new Date()) return { error: 'that offer has ended', status: 403 };
      if (camp.reward_item_id !== l.menuItemId) return { error: 'that offer is not for this item', status: 403 };
      if (qty !== 1) return { error: 'one per offer', status: 403 };
      usedCampaigns.add(l.campaign);
      unit = 0;

    } else if (l.reward) {
      const reward = rewards?.find((r: any) => r.id === l.reward);
      if (!reward) return { error: 'unknown reward', status: 403 };
      if (reward.menu_item_id !== l.menuItemId) return { error: 'reward does not match that item', status: 403 };
      if (usedRewards.has(reward.id)) return { error: 'reward already used in this order', status: 403 };
      if (qty !== 1) return { error: 'one of each reward per order', status: 403 };
      pointsToSpend += reward.points_cost;
      if (pointsToSpend > profile.points) return { error: 'not enough earned yet', status: 403 };
      usedRewards.add(reward.id);
      unit = 0;
    }

    subtotal += unit * qty;
    priced.push({
      menu_item_id: it.id,
      name: String(l.name ?? it.id).slice(0, 80),
      qty, unit_price: unit, mods,
      note: l.note ? String(l.note).slice(0, 200) : null,
    });
  }

  subtotal = round2(subtotal);
  const tax = round2(subtotal * TAX_RATE);
  const tip = Math.max(0, round2(Number(body.tip) || 0));
  const total = round2(subtotal + tax + tip);
  if (total < 0) return { error: 'bad total', status: 400 };

  // Stripe customer, so saved cards and receipts follow the person.
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const res = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ 'metadata[user_id]': userId, ...(profile.phone ? { phone: profile.phone } : {}) }),
    });
    const c = await res.json();
    customerId = c.id;
    await sb.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);
  }

  const pickupName = (body.pickupName ?? '').toString().slice(0, 40) || null;

  const { data: order, error } = await sb.from('orders').insert({
    user_id: userId, subtotal, tax, tip,
    discount: 0,                    // rewards are already priced at zero above
    total,
    redeem_points: pointsToSpend,
    pickup_at: body.pickupAt ?? null,
    pickup_name: pickupName,
  }).select().single();
  if (error) return { error: error.message, status: 500 };

  await sb.from('order_lines').insert(priced.map((l) => ({ ...l, order_id: order.id })));

  // Spend the claims, conditional on still being unspent, so a retried request
  // cannot hand the same offer out twice.
  for (const campaignId of usedCampaigns) {
    await sb.from('campaign_claims')
      .update({ used_order_id: order.id, used_at: new Date().toISOString() })
      .eq('campaign_id', campaignId).eq('user_id', userId).is('used_at', null);
  }

  return { orderId: order.id, subtotal, tax, tip, total, customerId, pickupName };
}

export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

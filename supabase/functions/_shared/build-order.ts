// Building an order, in one place, used by both the native and the web checkout.
//
// THE RULE: the client never sets a price. It says what it wants and which
// entitlement it is claiming; this file looks up every price itself and decides
// whether that entitlement is real. A line is free only because we proved it is
// owed, never because the phone said so.
//
// Two payment paths must never drift apart on these rules, which is why they
// both come through here.

import { checkMods } from './validate-mods.ts';

const TAX_RATE = 0.0825;   // Houston: 6.25% state + 2% local. Match lib/pricing.ts.

export type BuiltOrder = {
  orderId: string;
  subtotal: number; tax: number; tip: number; total: number;
  pickupName: string | null;
  pickupAt: string | null;
  phone: string | null;
  /** Priced by the server, ready for the payment provider. */
  lines: { name: string; qty: number; unitPrice: number; mods: string[]; note: string | null; free: boolean }[];
};

export type BuildFailure = { error: string; status: number };

export async function buildOrder(sb: any, userId: string, body: any): Promise<BuiltOrder | BuildFailure> {
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) return { error: 'empty order', status: 400 };

  const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (!profile) return { error: 'no profile', status: 400 };

  // A shut truck takes no money. Checked here, not just on the phone, so an app
  // left open since lunchtime cannot put an order through at midnight.
  const { data: truck } = await sb.from('truck_status').select('is_open, payments_enabled').eq('id', 1).maybeSingle();
  if (!truck?.is_open) return { error: 'The truck is closed right now.', status: 409 };

  const { data: items } = await sb.from('menu_items')
    .select('id, name, price, modifier_groups, available, sold_out_until')
    .in('id', lines.map((l: any) => l.menuItemId));

  // Entitlements, read fresh from the database — never from the request.
  const { data: claims } = await sb.from('campaign_claims')
    .select('campaign_id, used_at').eq('user_id', userId).is('used_at', null);
  const { data: campaigns } = await sb.from('campaigns').select('id, kind, reward_item_ids, reward_cover, tiers, active, ends_at');
  const { data: stampRows } = await sb.from('campaign_stamps').select('campaign_id, stamps').eq('user_id', userId);

  let subtotal = 0;
  let saved = 0;
  const usedCampaigns = new Set<string>();          // one-off offers spent by this order
  const stampSpend: Record<string, number> = {};    // stamp cards spent by this order
  const priced: any[] = [];
  // The truck's day in Houston, same as lib/availability.ts truckDay().
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  for (const l of lines) {
    const it = items?.find((i: any) => i.id === l.menuItemId);
    if (!it) return { error: `unknown item ${l.menuItemId}`, status: 400 };
    if (!it.available) return { error: `${l.menuItemId} is not available`, status: 400 };
    if (it.sold_out_until && it.sold_out_until >= today) {
      return { error: `${l.menuItemId} is sold out`, status: 409 };
    }

    const qty = Math.max(1, Math.min(20, Math.floor(Number(l.qty) || 1)));
    const groups = it.modifier_groups as any[];
    const mods: string[] = (Array.isArray(l.mods) ? l.mods : []).slice(0, 40).map(String);
    // The same option rules the app follows, checked again here: an order the
    // kitchen cannot make never reaches the board.
    const checked = checkMods(groups, mods);
    if (!checked.ok) return { error: `${it.id}: ${checked.error}`, status: 400 };
    const picked = checked.picked;
    const listUnit = Number(it.price) + picked.reduce((s, p) => s + p.delta, 0);
    let unit = listUnit;
    let campaignId: string | null = null;

    if (l.campaign) {
      const camp = campaigns?.find((c: any) => c.id === l.campaign);
      if (!camp || !camp.active) return { error: 'that offer is not running', status: 403 };
      if (camp.ends_at && new Date(camp.ends_at) <= new Date()) return { error: 'that offer has ended', status: 403 };
      if (qty !== 1) return { error: 'one per offer', status: 403 };
      if (usedCampaigns.has(camp.id) || stampSpend[camp.id]) return { error: 'that offer is already in this order', status: 403 };
      let cover: Record<string, number> = {};

      if (camp.kind === 'stamps') {
        const tier = (camp.tiers ?? []).find((t: any) => t.stamps === Number(l.tier));
        if (!tier) return { error: 'that reward is not on the card', status: 403 };
        if (!tier.itemIds.includes(l.menuItemId)) return { error: 'that reward is not for this item', status: 403 };
        const have = stampRows?.find((s: any) => s.campaign_id === camp.id)?.stamps ?? 0;
        if (have < tier.stamps) return { error: 'not enough stamps yet', status: 403 };
        stampSpend[camp.id] = tier.stamps;
        cover = tier.cover ?? {};
      } else {
        const claimed = claims?.some((c: any) => c.campaign_id === camp.id);
        if (!claimed) return { error: 'that offer has not been unlocked', status: 403 };
        if (!(camp.reward_item_ids ?? []).includes(l.menuItemId)) return { error: 'that offer is not for this item', status: 403 };
        usedCampaigns.add(camp.id);
        cover = camp.reward_cover ?? {};
      }

      // The item is on the house; each option group is free up to its cover.
      // Same rule as rewardUnitPrice in lib/pricing.ts.
      const byGroup: Record<string, number> = {};
      for (const p of picked) byGroup[p.group] = (byGroup[p.group] ?? 0) + p.delta;
      unit = round2(Object.entries(byGroup).reduce((s, [g, sum]) => s + Math.max(0, sum - (Number(cover[g]) || 0)), 0));
      saved += listUnit - unit;
      campaignId = camp.id;
    }

    subtotal += unit * qty;
    priced.push({
      menu_item_id: it.id,
      // The name comes from the menu, never from the phone: the kitchen and the
      // owner's Square must say what was actually priced.
      name: (String(it.name ?? it.id) + (campaignId ? ' (on us)' : '')).slice(0, 80),
      qty, unit_price: unit, mods,
      note: l.note ? String(l.note).slice(0, 200) : null,
      campaign_id: campaignId,
      list_price: round2(listUnit),
    });
  }

  subtotal = round2(subtotal);
  const tax = round2(subtotal * TAX_RATE);
  const tip = Math.max(0, round2(Number(body.tip) || 0));
  const total = round2(subtotal + tax + tip);
  if (total < 0) return { error: 'bad total', status: 400 };
  // Until card payments are connected, only $0 orders (the free drink) go through.
  if (total > 0 && !truck?.payments_enabled) {
    return { error: 'Card payments are not switched on yet. Please pay at the window.', status: 409 };
  }

  const pickupName = (body.pickupName ?? '').toString().slice(0, 40) || null;

  const { data: order, error } = await sb.from('orders').insert({
    user_id: userId, subtotal, tax, tip,
    discount: round2(saved),        // what the rewards were worth; already out of subtotal
    total,
    stamp_spend: stampSpend,
    pickup_at: body.pickupAt ?? null,
    pickup_name: pickupName,
  }).select().single();
  if (error) return { error: error.message, status: 500 };

  await sb.from('order_lines').insert(priced.map((l) => ({ ...l, order_id: order.id })));

  // Take the stamps now, conditionally, so two checkouts cannot spend the same
  // ones. If the order dies, the database trigger gives them back.
  const spent: Record<string, number> = {};
  for (const [campaignId, n] of Object.entries(stampSpend)) {
    const { data: ok } = await sb.rpc('spend_stamps', { p_user: userId, p_campaign: campaignId, p_n: n });
    if (ok) { spent[campaignId] = n; continue; }
    // Cancelling hands back whatever this order had already taken.
    await sb.from('orders').update({ status: 'cancelled', stamp_spend: spent }).eq('id', order.id);
    return { error: 'not enough stamps yet', status: 403 };
  }

  // Spend the claims, conditional on still being unspent, so a retried request
  // cannot hand the same offer out twice.
  // Two checkouts at once: only one gets the row back; the other is cancelled
  // (which also hands back anything it had already spent).
  for (const campaignId of usedCampaigns) {
    const { data: took } = await sb.from('campaign_claims')
      .update({ used_order_id: order.id, used_at: new Date().toISOString() })
      .eq('campaign_id', campaignId).eq('user_id', userId).is('used_at', null)
      .select('campaign_id');
    if (!took?.length) {
      await sb.from('orders').update({ status: 'cancelled', stamp_spend: spent }).eq('id', order.id);
      return { error: 'that offer has already been used', status: 403 };
    }
  }

  return {
    orderId: order.id, subtotal, tax, tip, total, pickupName,
    pickupAt: body.pickupAt ?? null,
    phone: profile.phone ?? null,
    lines: priced.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unit_price, mods: l.mods, note: l.note, free: !!l.campaign_id })),
  };
}

export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

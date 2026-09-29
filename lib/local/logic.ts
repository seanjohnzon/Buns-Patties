// The rules a test order follows, and the owner's numbers worked out from the
// test orders. These mirror the server (supabase/functions/_shared/build-order.ts,
// the on_order_paid trigger, and the owner_* reporting functions), so what a
// tester sees in B&P Test is what the live app will do. Pure.
import type { Campaign } from '../campaigns';
import type { LoyaltyRaw, MixRow, TodayRaw } from '../reporting';
import type { LocalOrder, LocalState, LocalStore } from './store';

export type TestLine = {
  menuItemId: string; name: string; qty: number;
  /** What each one costs on this order, and what it would have cost without a reward. */
  price: number; listPrice: number;
  mods: string[]; note?: string;
  claim?: { campaign: string; tier?: number };
};

export type TestOrderInput = {
  lines: TestLine[];
  subtotal: number; tax: number; tip: number; total: number; saved: number;
  pickupName: string; pickupAt: string | null;
};

/**
 * Places a test order: spends stamps for a stamp-card reward, uses up a one-off
 * offer, adds a stamp to every live card whose minimum the food clears, and puts
 * the order on the kitchen board. Throws (and changes nothing) if a reward is not
 * really owed.
 */
export function placeTestOrder(store: LocalStore, input: TestOrderInput, now: Date, id: string): LocalOrder {
  const campaigns = store.read('campaigns');
  let stamps = { ...store.read('stamps') };
  let claims = [...store.read('claims')];

  for (const l of input.lines) {
    if (!l.claim) continue;
    const c = campaigns.find((x) => x.id === l.claim!.campaign);
    if (!c || !c.active) throw new Error('that offer is not running');
    if (c.kind === 'stamps') {
      const tier = c.tiers.find((t) => t.stamps === l.claim!.tier);
      if (!tier) throw new Error('that reward is not on the card');
      if ((stamps[c.id] ?? 0) < tier.stamps) throw new Error('not enough stamps yet');
      stamps[c.id] = (stamps[c.id] ?? 0) - tier.stamps;
    } else {
      const i = claims.findIndex((x) => x.campaignId === c.id && !x.usedAt);
      if (i < 0) throw new Error('that offer has not been unlocked');
      claims[i] = { ...claims[i], usedAt: now.toISOString() };
    }
  }

  let earned = 0;
  for (const c of campaigns) {
    if (c.kind === 'stamps' && c.active && input.subtotal > 0 && input.subtotal >= (c.minOrder ?? 0)) {
      stamps[c.id] = (stamps[c.id] ?? 0) + 1;
      earned += 1;
    }
  }

  const order: LocalOrder = {
    id, userId: 'test', status: 'received',
    subtotal: input.subtotal, tax: input.tax, tip: input.tip, discount: input.saved, total: input.total,
    stampsEarned: earned, pickupAt: input.pickupAt, pickupName: input.pickupName || null,
    createdAt: now.toISOString(), checkoutUrl: null,
    lines: input.lines.map((l) => ({
      name: l.name, qty: l.qty, price: l.price, mods: l.mods, note: l.note ?? null,
      free: !!l.claim, menuItemId: l.menuItemId, listPrice: l.listPrice, campaignId: l.claim?.campaign ?? null,
    })),
  };

  store.write('stamps', stamps);
  store.write('claims', claims);
  store.write('orders', [order, ...store.read('orders')]);
  return order;
}

const counts = (o: LocalOrder) => o.status !== 'cancelled' && o.status !== 'pending_payment';
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Same figures as owner_today: food takings (not tips), today vs the same slice last week. */
export function ownerToday(orders: LocalOrder[], now: Date): TodayRaw {
  const today = startOfDay(now).getTime();
  const weekAgo = today - 7 * 864e5;
  const soFar = now.getTime() - today;
  const inToday = orders.filter((o) => counts(o) && new Date(o.createdAt).getTime() >= today);
  const lastWeek = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return counts(o) && t >= weekAgo && t < weekAgo + soFar;
  });
  const sum = (xs: LocalOrder[], f: (o: LocalOrder) => number) => Math.round(xs.reduce((s, o) => s + f(o), 0) * 100) / 100;
  return {
    netToday: sum(inToday, (o) => o.subtotal), tipsToday: sum(inToday, (o) => o.tip),
    ordersToday: inToday.length, discountToday: sum(inToday, (o) => o.discount),
    netLastWeek: sum(lastWeek, (o) => o.subtotal), ordersLastWeek: lastWeek.length,
  };
}

/** Same as owner_product_mix: what sold over the last N days, most first. */
export function productMix(orders: LocalOrder[], now: Date, days = 7): MixRow[] {
  const since = now.getTime() - days * 864e5;
  const rows = new Map<string, MixRow>();
  for (const o of orders) {
    if (!counts(o) || new Date(o.createdAt).getTime() < since) continue;
    for (const l of o.lines) {
      const id = l.menuItemId ?? l.name;
      const r = rows.get(id) ?? { menuItemId: id, name: l.name.replace(/ \(on us\)$/, ''), qty: 0, revenue: 0 };
      r.qty += l.qty;
      r.revenue = Math.round((r.revenue + l.price * l.qty) * 100) / 100;
      rows.set(id, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/** Same as owner_loyalty, for one test phone: free items this week and their worth. */
export function loyalty(orders: LocalOrder[], now: Date): LoyaltyRaw {
  const since = now.getTime() - 7 * 864e5;
  let given = 0, value = 0;
  for (const o of orders) {
    if (!counts(o) || new Date(o.createdAt).getTime() < since) continue;
    for (const l of o.lines) if (l.campaignId) { given += l.qty; value += (l.listPrice ?? 0) * l.qty; }
  }
  return { members: 1, newThisWeek: 0, givenThisWeek: given, givenValueThisWeek: Math.round(value * 100) / 100 };
}

/** Same as owner_campaigns: how many unlocked, how many used, what it cost. */
export function campaignStats(state: Pick<LocalState, 'campaigns' | 'claims' | 'orders'>) {
  return state.campaigns.map((c: Campaign) => {
    const lines = state.orders.filter(counts).flatMap((o) => o.lines).filter((l) => l.campaignId === c.id);
    return {
      id: c.id, kind: c.kind, title: c.title, active: c.active, endsAt: c.endsAt, maxClaims: c.maxClaims,
      claimsCount: state.claims.filter((x) => x.campaignId === c.id).length,
      usedCount: lines.reduce((s, l) => s + l.qty, 0),
      cost: Math.round(lines.reduce((s, l) => s + (l.listPrice ?? 0) * l.qty, 0) * 100) / 100,
    };
  });
}

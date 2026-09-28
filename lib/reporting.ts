// Owner reporting maths. Pure and dependency-free so the numbers are testable —
// the database does the aggregating, this turns the raw figures into what the
// owner actually reads.
import { POINTS } from './points.ts';
import { round2 } from './pricing.ts';

export type TodayRaw = {
  netToday: number;
  tipsToday: number;
  ordersToday: number;
  discountToday: number;
  netLastWeek: number;
  ordersLastWeek: number;
};

export type RewardsRaw = {
  pointsOutstanding: number;
  members: number;
  newThisWeek: number;
  redeemedThisWeek: number;
};

export type MixRow = { menuItemId: string; name: string; qty: number; revenue: number };

/** Money per order. Zero orders is 0, never a divide-by-zero. */
export function averageTicket(net: number, orders: number) {
  return orders > 0 ? round2(net / orders) : 0;
}

/**
 * Change against the same slice of the day last week, as a percentage.
 * Returns null when last week was zero — "up 100%" from nothing is noise,
 * and the screen should say "no comparison" instead of showing a number.
 */
export function changeVsLastWeek(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Outstanding points expressed as the dollars they can be redeemed for. */
export function rewardsLiability(pointsOutstanding: number) {
  return round2(Math.max(0, pointsOutstanding) / POINTS.redeemRate);
}

/** Share of total quantity, for the bar next to each item in the mix. */
export function mixShare(rows: MixRow[]): (MixRow & { share: number })[] {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? r.qty / total : 0 }));
}

export function summariseToday(raw: TodayRaw) {
  return {
    net: round2(raw.netToday),
    tips: round2(raw.tipsToday),
    orders: raw.ordersToday,
    discount: round2(raw.discountToday),
    avgTicket: averageTicket(raw.netToday, raw.ordersToday),
    netChange: changeVsLastWeek(raw.netToday, raw.netLastWeek),
    ordersChange: changeVsLastWeek(raw.ordersToday, raw.ordersLastWeek),
  };
}

// Pure pricing maths. No React, no zustand, no Expo — so the test runner can import it
// directly and the numbers stay provable. The checkout edge function re-computes the same
// figures server-side from DB prices; if you change a rule here, change it there too
// (supabase/functions/_shared/build-order.ts).
import type { CartLine, MenuItem, ModifierOption } from './types';

/**
 * Houston sales tax: 6.25% Texas state + 2% local. Prepared food is taxable.
 * Menu prices are pre-tax, as they are in every US restaurant — tax is added
 * to the total at checkout, not baked into the board price.
 */
export const TAX_RATE = 0.0825;

const deltas = (chosen: ModifierOption[]) => chosen.reduce((s, o) => s + o.priceDelta, 0);

/** Which group an option belongs to on this item. */
export function groupOf(item: Pick<MenuItem, 'modifierGroups'>, optionId: string) {
  return item.modifierGroups.find((g) => g.options.some((o) => o.id === optionId))?.id ?? '';
}

/**
 * A reward item: the item itself is on the house, and each group's extras are
 * covered up to `cover[group]` dollars. The free burger covers a double patty
 * ($2) but a triple pays the difference, and paid toppings are always paid.
 */
export function rewardUnitPrice(item: Pick<MenuItem, 'modifierGroups'>, chosen: ModifierOption[], cover: Record<string, number> = {}) {
  const byGroup = new Map<string, number>();
  for (const o of chosen) {
    const g = groupOf(item, o.id);
    byGroup.set(g, (byGroup.get(g) ?? 0) + o.priceDelta);
  }
  let charged = 0;
  for (const [g, sum] of byGroup) charged += Math.max(0, sum - (cover[g] ?? 0));
  return round2(charged);
}

/** One cart line: (base price + every chosen modifier delta) x quantity. Reward lines pay only the extras. */
export const lineTotal = (l: CartLine) =>
  l.claim
    ? rewardUnitPrice(l.item, l.chosen, l.claim.cover) * l.qty
    : (l.item.price + deltas(l.chosen)) * l.qty;

/** What the line would have cost without the reward. */
export const listTotal = (l: CartLine) => (l.item.price + deltas(l.chosen)) * l.qty;

export type Totals = {
  subtotal: number;
  /** What the rewards in this basket are worth. Already out of the subtotal. */
  saved: number;
  tax: number;
  tip: number;
  total: number;
  count: number;
};

export function cartTotals(lines: CartLine[], tip: number): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const saved = round2(lines.reduce((s, l) => s + listTotal(l), 0) - subtotal);
  const tax = round2(subtotal * TAX_RATE);
  const safeTip = Math.max(0, tip);
  const total = round2(subtotal + tax + safeTip);
  return { subtotal, saved, tax, tip: safeTip, total, count: lines.reduce((s, l) => s + l.qty, 0) };
}

/** Money is compared and stored to the cent; floats drift without this. */
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

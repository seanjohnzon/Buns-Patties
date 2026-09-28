// Pure pricing maths. No React, no zustand, no Expo — so the test runner can import it
// directly and the numbers stay provable. The Stripe edge function re-computes the same
// figures server-side from DB prices; if you change a rule here, change it there too.
import { POINTS } from './points.ts';
import type { CartLine } from './types';

/**
 * Houston sales tax: 6.25% Texas state + 2% local. Prepared food is taxable.
 * Menu prices are pre-tax, as they are in every US restaurant — tax is added
 * to the total at checkout, not baked into the board price.
 */
export const TAX_RATE = 0.0825;

/** One cart line: (base price + every chosen modifier delta) x quantity. */
export const lineTotal = (l: CartLine) =>
  (l.item.price + l.chosen.reduce((s, o) => s + o.priceDelta, 0)) * l.qty;

export type Totals = {
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  count: number;
};

export function cartTotals(lines: CartLine[], tip: number, redeemPoints: number): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  // Points convert to whole dollars, and can never take the bill below zero.
  const discount = Math.min(subtotal, Math.floor(Math.max(0, redeemPoints) / POINTS.redeemRate));
  const tax = round2((subtotal - discount) * TAX_RATE);
  const safeTip = Math.max(0, tip);
  const total = round2(subtotal - discount + tax + safeTip);
  return { subtotal, discount, tax, tip: safeTip, total, count: lines.reduce((s, l) => s + l.qty, 0) };
}

/** Money is compared and stored to the cent; floats drift without this. */
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

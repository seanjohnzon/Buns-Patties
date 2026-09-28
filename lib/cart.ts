import { create } from 'zustand';
import type { CartLine, Claim, MenuItem, ModifierOption } from './types';

// Pricing maths lives in ./pricing so it can be unit-tested without React or zustand.
export { lineTotal, listTotal, cartTotals, rewardUnitPrice, TAX_RATE } from './pricing';

type CartState = {
  lines: CartLine[];
  tip: number;
  pickupAt: string | null;
  add: (item: MenuItem, chosen: ModifierOption[], qty?: number, note?: string, claim?: Claim) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setTip: (tip: number) => void;
  setPickupAt: (iso: string | null) => void;
};

export const useCart = create<CartState>((set) => ({
  lines: [],
  tip: 0,
  pickupAt: null,
  add: (item, chosen, qty = 1, note, claim) =>
    set((s) => {
      const key = item.id + ':' + chosen.map((o) => o.id).sort().join(',') + (note ? ':' + note : '')
        + (claim ? ':' + claim.campaign : '');
      // A free line is never merged into a paid one, and never multiplied: one
      // reward per campaign per order. A second one replaces the first.
      if (claim) {
        const others = s.lines.filter((l) => l.claim?.campaign !== claim.campaign);
        return { lines: [...others, { key, item, qty: 1, chosen, note, claim }] };
      }
      const existing = s.lines.find((l) => l.key === key);
      if (existing) {
        return { lines: s.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) };
      }
      return { lines: [...s.lines, { key, item, qty, chosen, note, claim }] };
    }),
  setQty: (key, qty) =>
    set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty } : l)) })),
  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
  clear: () => set({ lines: [], tip: 0, pickupAt: null }),
  setTip: (tip) => set({ tip }),
  setPickupAt: (pickupAt) => set({ pickupAt }),
}));

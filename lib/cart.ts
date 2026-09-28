import { create } from 'zustand';
import type { CartLine, MenuItem, ModifierOption } from './types';

// Pricing maths lives in ./pricing so it can be unit-tested without React or zustand.
export { lineTotal, cartTotals, TAX_RATE } from './pricing';

type CartState = {
  lines: CartLine[];
  tip: number;
  redeemPoints: number;
  pickupAt: string | null;
  add: (item: MenuItem, chosen: ModifierOption[], qty?: number, note?: string, claim?: { campaign?: string; reward?: string }) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setTip: (tip: number) => void;
  setRedeemPoints: (pts: number) => void;
  setPickupAt: (iso: string | null) => void;
};

export const useCart = create<CartState>((set) => ({
  lines: [],
  tip: 0,
  redeemPoints: 0,
  pickupAt: null,
  add: (item, chosen, qty = 1, note, claim) =>
    set((s) => {
      const key = item.id + ':' + chosen.map((o) => o.id).sort().join(',') + (note ? ':' + note : '')
        + (claim ? ':' + (claim.campaign ?? claim.reward) : '');
      // A free line is never merged into a paid one, and never multiplied.
      if (claim && s.lines.some((l) => l.claim && (l.claim.campaign ?? l.claim.reward) === (claim.campaign ?? claim.reward))) {
        return s;
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
  clear: () => set({ lines: [], tip: 0, redeemPoints: 0, pickupAt: null }),
  setTip: (tip) => set({ tip }),
  setRedeemPoints: (redeemPoints) => set({ redeemPoints }),
  setPickupAt: (pickupAt) => set({ pickupAt }),
}));

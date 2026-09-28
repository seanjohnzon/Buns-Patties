// Rewards, deliberately quiet.
//
// Two separate things:
//
//   1. THE WELCOME OFFER — a free drink, printed on the QR sticker on the truck.
//      It is not free: the customer has to follow the Instagram page or leave a
//      Google review to unlock it. One or the other, once per account, ever.
//      This is what turns a sticker into an install and a follower.
//
//   2. EARNING — happens by spending in the app, and nothing else. No codes to
//      show, no scanning at the window. Roughly 5% comes back as free food.
//
// The customer is never shown the arithmetic. They see how far they are from the
// next free thing, in money they understand. The ratio is ours, not theirs — it
// is a thing we can tune, not a promise printed on the side of the truck.

/** What a dollar of spend is worth back, as free food. Internal only. */
export const REWARD_RATE = 0.05;   // spend $100, get $5 of food

export const POINTS = {
  /** 1 point = 1 cent of reward value. $1 spent = 5 points = 5c back. */
  perDollar: Math.round(REWARD_RATE * 100),
  /** 100 points = $1 of food. Never shown to a customer. */
  redeemRate: 100,
};

export function pointsForOrder(subtotalDollars: number) {
  return Math.floor(subtotalDollars * POINTS.perDollar);
}

/** Points expressed as the dollars of food they buy. Used by the owner screen. */
export function dollarsForPoints(points: number) {
  return Math.floor(points / POINTS.redeemRate);
}

/** What a reward worth $value costs in points. */
export function pointsForValue(dollars: number) {
  return Math.round(dollars * POINTS.redeemRate);
}

/**
 * How much more they need to SPEND to reach a reward — the only progress figure
 * a customer ever sees. Returns 0 once they have earned it.
 */
export function spendToGo(balance: number, rewardCost: number) {
  const short = Math.max(0, rewardCost - balance);
  return Math.ceil(short / POINTS.perDollar);
}

/** 0..1, for the progress bar. */
export function progressTo(balance: number, rewardCost: number) {
  if (rewardCost <= 0) return 1;
  return Math.min(1, Math.max(0, balance / rewardCost));
}

// ---------- the welcome offer ----------

export type UnlockAction = {
  id: 'follow_instagram' | 'google_review';
  title: string;
  blurb: string;
  /** Nothing can verify these, so each is claimable once per account, ever. */
  verification: 'trust';
};

export const UNLOCK_ACTIONS: UnlockAction[] = [
  {
    id: 'follow_instagram',
    title: 'Follow us on Instagram',
    blurb: '@buns.patties — see where the truck is parked',
    verification: 'trust',
  },
  {
    id: 'google_review',
    title: 'Leave a Google review',
    blurb: 'Tell people what you thought',
    verification: 'trust',
  },
];

/** The drink they get for doing one of the above. */
export const WELCOME_OFFER = {
  menuItemId: 'can_drink',
  title: 'Free drink',
  blurb: 'On us, for your first order',
};

/** One action is enough. We deliberately do not ask for both. */
export function welcomeOfferUnlocked(done: string[]) {
  return UNLOCK_ACTIONS.some((a) => done.includes(a.id));
}

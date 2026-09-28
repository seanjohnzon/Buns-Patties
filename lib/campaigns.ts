// Campaigns: everything the truck gives away. There are no points. There are two
// shapes, and the owner builds both from his phone:
//
//   ACTION — do one thing (follow us, tag us, open a link), get one free item.
//     The free drink on the sticker is the first of these. One per account, and
//     an account is a phone number that had to receive a text.
//
//   STAMPS — every order over a minimum is a stamp. At 5 stamps take free fries,
//     or keep going; at 10 take a free burger. Taking a reward spends the stamps.
//
// None of the actions can be verified — no platform will tell an app who
// followed, liked or tagged. So the safety is in the shape of the offer: one per
// account, a hard cap on total claims, and an end date. That makes the worst
// case a number you can read before you start it.

export type ActionKind = 'follow_instagram' | 'follow_tiktok' | 'tag_us' | 'visit_link';

export type CampaignAction = { id: string; label: string; url: string };

/** A reward on a stamp card. `cover` is how much of each option group is free. */
export type StampTier = {
  stamps: number;
  label: string;            // "Free fries"
  itemIds: string[];        // pick one of these
  cover?: Record<string, number>;
};

export type Campaign = {
  id: string;
  kind: 'action' | 'stamps';
  title: string;
  blurb: string | null;
  /** Small print, e.g. "Orders of $15 or more count." */
  finePrint: string | null;
  // action
  actions: CampaignAction[];
  rewardItemIds: string[];
  cover: Record<string, number>;
  // stamps
  minOrder: number | null;
  tiers: StampTier[];
  // limits
  maxClaims: number | null;
  claimsCount: number;
  endsAt: string | null;
  active: boolean;
};

export type CampaignClaim = { campaignId: string; unlockedBy: string | null; usedAt: string | null };

/** The ready-made actions the owner picks from. The URL is the only thing he types. */
export const ACTION_PRESETS: { kind: ActionKind; label: string; hint: string }[] = [
  { kind: 'follow_instagram', label: 'Follow us on Instagram', hint: 'https://www.instagram.com/…' },
  { kind: 'follow_tiktok', label: 'Follow us on TikTok', hint: 'https://www.tiktok.com/@…' },
  { kind: 'tag_us', label: 'Post a photo and tag us', hint: 'https://www.instagram.com/…' },
  { kind: 'visit_link', label: 'Check this out', hint: 'https://…' },
];

/** The most this campaign can ever cost, in money. The number to look at first. */
export function worstCase(maxClaims: number | null, itemPrice: number) {
  if (maxClaims === null) return null;   // uncapped: unknowable, and a bad idea
  return Math.round(maxClaims * itemPrice * 100) / 100;
}

export function remainingClaims(c: Pick<Campaign, 'maxClaims' | 'claimsCount'>) {
  if (c.maxClaims === null) return null;
  return Math.max(0, c.maxClaims - c.claimsCount);
}

export function hasEnded(c: Pick<Campaign, 'endsAt'>, now = new Date()) {
  return !!c.endsAt && new Date(c.endsAt) <= now;
}

/** Is this offer open to anybody right now? */
export function isLive(c: Campaign, now = new Date()) {
  if (!c.active) return false;
  if (hasEnded(c, now)) return false;
  if (c.kind === 'stamps') return c.tiers.length > 0;
  const left = remainingClaims(c);
  return left === null || left > 0;
}

/** Can THIS person still take it? One per account, ever. */
export function canClaim(c: Campaign, claim: CampaignClaim | undefined, now = new Date()) {
  if (claim) return false;
  return isLive(c, now);
}

/** They unlocked it and have not spent it yet. */
export function isUnspent(claim: CampaignClaim | undefined) {
  return !!claim && !claim.usedAt;
}

/** An action only counts if it is one this campaign actually asks for. */
export function actionIsOffered(c: Campaign, actionId: string) {
  return c.actions.some((a) => a.id === actionId);
}

/**
 * An action button is only safe to show when there is somewhere to send them.
 * A missing link is how you end up giving a drink away for a tap on nothing.
 */
export function actionIsUsable(a: CampaignAction) {
  return typeof a.url === 'string' && /^https?:\/\/\S+$/.test(a.url.trim());
}

// ---------- stamp cards ----------

/** Does an order of this size (food, before tax) earn a stamp? */
export function earnsStamp(c: Pick<Campaign, 'minOrder'>, subtotal: number) {
  return subtotal >= (c.minOrder ?? 0) && subtotal > 0;
}

/** The biggest reward on the card, which is how many boxes the card draws. */
export function cardSize(c: Pick<Campaign, 'tiers'>) {
  return c.tiers.reduce((m, t) => Math.max(m, t.stamps), 0);
}

/** Rewards they can take right now. */
export function readyTiers(c: Pick<Campaign, 'tiers'>, stamps: number) {
  return c.tiers.filter((t) => stamps >= t.stamps).sort((a, b) => a.stamps - b.stamps);
}

/** The next reward they have not reached, and how many orders away it is. */
export function nextTier(c: Pick<Campaign, 'tiers'>, stamps: number) {
  const t = [...c.tiers].sort((a, b) => a.stamps - b.stamps).find((x) => x.stamps > stamps);
  return t ? { tier: t, ordersToGo: t.stamps - stamps } : null;
}

/** Stamps left after taking a reward. Never below zero. */
export function afterRedeem(stamps: number, tier: Pick<StampTier, 'stamps'>) {
  return Math.max(0, stamps - tier.stamps);
}

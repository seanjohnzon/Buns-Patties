// Campaigns: everything the truck gives away, including the free drink.
//
// None of the actions can be verified — no platform will tell an app who
// followed, liked, shared or reviewed. So the safety is not in checking, it is
// in the shape of the offer: one per account (and an account needs a real phone
// that received a text), a hard cap on total claims, and an end date. That makes
// the worst case a number you can read before you start it.

export type CampaignAction = { id: string; label: string; url: string };

export type Campaign = {
  id: string;
  title: string;
  blurb: string | null;
  actions: CampaignAction[];
  rewardItemId: string | null;
  maxClaims: number | null;
  claimsCount: number;
  endsAt: string | null;
  active: boolean;
};

export type CampaignClaim = { campaignId: string; unlockedBy: string | null; usedAt: string | null };

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

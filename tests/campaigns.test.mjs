// Campaigns are the only way anything is given away, so these rules are what
// stand between the truck and a glitch that hands out free food.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worstCase, remainingClaims, hasEnded, isLive, canClaim, isUnspent,
  actionIsOffered, actionIsUsable, earnsStamp, cardSize, readyTiers, nextTier, afterRedeem,
} from '../lib/campaigns.ts';

const base = {
  id: 'welcome_drink', kind: 'action', title: 'Free drink', blurb: null, finePrint: null,
  actions: [
    { id: 'follow_instagram', label: 'Follow us', url: 'https://www.instagram.com/buns.patties' },
    { id: 'follow_tiktok', label: 'Follow us on TikTok', url: '' },
  ],
  rewardItemIds: ['can_drink'], cover: {}, minOrder: null, tiers: [],
  maxClaims: 1000, claimsCount: 0, endsAt: null, active: true,
};

const card = {
  ...base, id: 'stamp_card', kind: 'stamps', actions: [], rewardItemIds: [], minOrder: 15, maxClaims: null,
  tiers: [
    { stamps: 5, label: 'Free fries', itemIds: ['seasoned_fries'], cover: {} },
    { stamps: 10, label: 'Free burger', itemIds: ['og', 'wake_n_smash', 'lone_star_heat', 'bbq_bacon'], cover: { patty: 2 } },
  ],
};

test('the worst case is knowable before you start', () => {
  assert.equal(worstCase(1000, 2), 2000);      // 1000 drinks at $2
  assert.equal(worstCase(50, 9), 450);
});

test('an uncapped campaign has no knowable worst case', () => {
  assert.equal(worstCase(null, 2), null, 'uncapped means you cannot say what it costs');
});

test('a campaign stops itself when the cap is reached', () => {
  assert.equal(isLive({ ...base, claimsCount: 999 }), true);
  assert.equal(isLive({ ...base, claimsCount: 1000 }), false, 'cap reached must close it');
  assert.equal(remainingClaims({ maxClaims: 1000, claimsCount: 1000 }), 0);
  assert.equal(remainingClaims({ maxClaims: 1000, claimsCount: 5000 }), 0, 'never negative');
});

test('a campaign stops itself at its end date', () => {
  const ended = { ...base, endsAt: '2020-01-01T00:00:00Z' };
  assert.equal(hasEnded(ended), true);
  assert.equal(isLive(ended), false);
  const future = { ...base, endsAt: '2999-01-01T00:00:00Z' };
  assert.equal(isLive(future), true);
});

test('switching it off closes it immediately', () => {
  assert.equal(isLive({ ...base, active: false }), false);
});

test('one claim per person, ever', () => {
  const claim = { campaignId: 'welcome_drink', unlockedBy: 'follow_instagram', usedAt: null };
  assert.equal(canClaim(base, undefined), true);
  assert.equal(canClaim(base, claim), false, 'already claimed means never again');
  // Even after they have spent it.
  assert.equal(canClaim(base, { ...claim, usedAt: '2026-01-01T00:00:00Z' }), false);
});

test('an unspent claim is the thing that can go in a basket', () => {
  assert.equal(isUnspent(undefined), false);
  assert.equal(isUnspent({ campaignId: 'x', unlockedBy: 'a', usedAt: null }), true);
  assert.equal(isUnspent({ campaignId: 'x', unlockedBy: 'a', usedAt: '2026-01-01' }), false);
});

test('an action nobody offered cannot unlock anything', () => {
  assert.equal(actionIsOffered(base, 'follow_instagram'), true);
  assert.equal(actionIsOffered(base, 'tiktok_dance'), false);
  assert.equal(actionIsOffered(base, ''), false);
});

// The glitch the owner is actually worried about.
test('an action with no link is not usable, so it cannot be tapped for a free drink', () => {
  const [ig, review] = base.actions;
  assert.equal(actionIsUsable(ig), true);
  assert.equal(actionIsUsable(review), false, 'the review link is not set yet');
  for (const bad of ['', '   ', 'not a url', 'javascript:alert(1)', 'instagram.com']) {
    assert.equal(actionIsUsable({ id: 'x', label: 'x', url: bad }), false, `"${bad}" must not be usable`);
  }
});

// ---- the stamp card ----
test('an order earns a stamp only at $15 or more, before tax', () => {
  assert.equal(earnsStamp(card, 15), true);
  assert.equal(earnsStamp(card, 14.99), false);
  assert.equal(earnsStamp(card, 0), false, 'the free drink alone is not a stamp');
});

test('the card is as long as its biggest reward', () => {
  assert.equal(cardSize(card), 10);
});

test('fries at 5, burger at 10, and both once you have 10', () => {
  assert.deepEqual(readyTiers(card, 4).map((t) => t.stamps), []);
  assert.deepEqual(readyTiers(card, 5).map((t) => t.stamps), [5]);
  assert.deepEqual(readyTiers(card, 10).map((t) => t.stamps), [5, 10]);
});

test('the next reward is counted in orders, never in points', () => {
  assert.deepEqual(nextTier(card, 3), { tier: card.tiers[0], ordersToGo: 2 });
  assert.deepEqual(nextTier(card, 6), { tier: card.tiers[1], ordersToGo: 4 });
  assert.equal(nextTier(card, 10), null);
});

test('taking fries at 5 spends 5; saving up for the burger spends 10', () => {
  assert.equal(afterRedeem(5, card.tiers[0]), 0);
  assert.equal(afterRedeem(7, card.tiers[0]), 2);
  assert.equal(afterRedeem(10, card.tiers[1]), 0);
  assert.equal(afterRedeem(3, card.tiers[1]), 0, 'never below zero');
});

test('the free burger is any burger but Build Your Own', () => {
  const burger = card.tiers.find((t) => t.stamps === 10);
  assert.ok(!burger.itemIds.includes('build_your_own'));
  assert.equal(burger.cover.patty, 2, 'double patty on us, triple pays the difference');
});

test('a stamp card is live without a claim cap', () => {
  assert.equal(isLive(card), true);
  assert.equal(isLive({ ...card, tiers: [] }), false, 'a card with nothing on it is not shown');
});

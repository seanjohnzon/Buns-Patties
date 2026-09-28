// Campaigns are the only way anything is given away, so these rules are what
// stand between the truck and a glitch that hands out free food.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worstCase, remainingClaims, hasEnded, isLive, canClaim, isUnspent,
  actionIsOffered, actionIsUsable,
} from '../lib/campaigns.ts';

const base = {
  id: 'welcome_drink', title: 'Free drink', blurb: null,
  actions: [
    { id: 'follow_instagram', label: 'Follow us', url: 'https://www.instagram.com/buns.patties' },
    { id: 'google_review', label: 'Review us', url: '' },
  ],
  rewardItemId: 'can_drink', maxClaims: 1000, claimsCount: 0, endsAt: null, active: true,
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

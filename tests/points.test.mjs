// The rewards rules. Two things matter here: the ratio must hold (5% back, no
// more), and the customer must never be shown the arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POINTS, REWARD_RATE, UNLOCK_ACTIONS, WELCOME_OFFER,
  pointsForOrder, dollarsForPoints, pointsForValue,
  spendToGo, progressTo, welcomeOfferUnlocked,
} from '../lib/points.ts';

test('spending $100 earns $5 of food', () => {
  // The owner's own words for the deal.
  const earned = pointsForOrder(100);
  assert.equal(dollarsForPoints(earned), 5);
  assert.equal(REWARD_RATE, 0.05);
});

test('the rate holds at every size of order', () => {
  for (const spend of [10, 25, 47.5, 180, 1000]) {
    const back = dollarsForPoints(pointsForOrder(spend));
    assert.ok(back <= spend * REWARD_RATE + 0.01, `$${spend} gave back too much`);
  }
});

test('partial dollars never round up into free food', () => {
  assert.equal(pointsForOrder(0), 0);
  assert.equal(pointsForOrder(0.19), 0);
  assert.ok(pointsForOrder(9.99) < pointsForOrder(10));
});

test('a reward costs what it is worth', () => {
  assert.equal(pointsForValue(5), 500);
  assert.equal(dollarsForPoints(pointsForValue(9)), 9);
});

test('progress is shown as money still to spend, never as points', () => {
  const fries = pointsForValue(5);          // $5 reward => $100 of spending
  assert.equal(spendToGo(0, fries), 100);
  assert.equal(spendToGo(pointsForOrder(60), fries), 40);
  assert.equal(spendToGo(fries, fries), 0, 'earned means nothing left to spend');
  assert.equal(spendToGo(fries + 999, fries), 0, 'never negative');
});

test('the progress bar stays between empty and full', () => {
  const r = pointsForValue(5);
  assert.equal(progressTo(0, r), 0);
  assert.equal(progressTo(r / 2, r), 0.5);
  assert.equal(progressTo(r * 10, r), 1);
  assert.equal(progressTo(-50, r), 0);
});

// ---------- the welcome offer ----------

test('one action unlocks the free drink, not both', () => {
  assert.equal(welcomeOfferUnlocked([]), false);
  assert.equal(welcomeOfferUnlocked(['follow_instagram']), true);
  assert.equal(welcomeOfferUnlocked(['google_review']), true);
  assert.equal(welcomeOfferUnlocked(['something_else']), false);
});

test('the drink is never given away for nothing', () => {
  assert.equal(welcomeOfferUnlocked([]), false, 'no action, no drink');
  assert.ok(WELCOME_OFFER.menuItemId, 'the offer must point at a real item');
});

test('both unlock actions are ones we cannot verify, so both are one-time', () => {
  // Neither Instagram nor Google will tell an app who followed or reviewed.
  assert.ok(UNLOCK_ACTIONS.length >= 2);
  for (const a of UNLOCK_ACTIONS) {
    assert.equal(a.verification, 'trust');
    assert.ok(a.title && a.blurb);
  }
});

test('the conversion ratio is not part of any customer-facing copy', () => {
  // If the ratio leaks into a label, it becomes a promise we cannot tune.
  const copy = [
    ...UNLOCK_ACTIONS.flatMap((a) => [a.title, a.blurb]),
    WELCOME_OFFER.title, WELCOME_OFFER.blurb,
  ].join(' ').toLowerCase();
  for (const leak of ['point', 'pts', '5%', 'per $1', 'per dollar']) {
    assert.ok(!copy.includes(leak), `customer copy mentions "${leak}"`);
  }
});

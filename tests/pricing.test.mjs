// Money maths. If any of these fail, customers are being charged the wrong amount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTotal, cartTotals, round2 } from '../lib/pricing.ts';
import { POINTS } from '../lib/points.ts';

const item = (price) => ({ id: 'x', categoryId: 'c', name: 'X', description: '', price, imageUrl: null, modifierGroups: [], available: true });
const mod = (priceDelta) => ({ id: 'm' + priceDelta, name: 'm', priceDelta });
const line = (price, mods = [], qty = 1) => ({ key: 'k' + Math.random(), item: item(price), qty, chosen: mods });

test('line total adds every modifier delta, then multiplies by quantity', () => {
  assert.equal(lineTotal(line(9)), 9);
  assert.equal(lineTotal(line(9, [mod(2)])), 11);                 // OG + double patty
  assert.equal(lineTotal(line(9, [mod(2), mod(1.5)])), 12.5);     // + beef bacon
  assert.equal(lineTotal(line(9, [mod(2), mod(1.5)], 2)), 25);    // x2
});

test('free modifiers cost nothing', () => {
  assert.equal(lineTotal(line(9, [mod(0), mod(0), mod(0)])), 9);
});

test('the real demo cart totals $24.50', () => {
  // OG double + beef bacon, Smash Fries single, 2x Can Drink
  const lines = [line(9, [mod(2), mod(1.5)]), line(8, [mod(0), mod(0)]), line(2, [mod(0)], 2)];
  const t = cartTotals(lines, 0, 0);
  assert.equal(t.subtotal, 24.5);
  assert.equal(t.total, 24.5);
  assert.equal(t.count, 4);
});

test('points come off the bill at the documented rate', () => {
  const lines = [line(20)];
  const t = cartTotals(lines, 0, 500);
  assert.equal(t.discount, 500 / POINTS.redeemRate);  // 500 pts = $5
  assert.equal(t.total, 15);
});

test('points can never take the bill below zero', () => {
  const t = cartTotals([line(3)], 0, 100000);
  assert.equal(t.discount, 3);
  assert.equal(t.total, 0);
  assert.ok(t.total >= 0);
});

test('tip is added after the discount, and is never negative', () => {
  const t = cartTotals([line(20)], 3, 500);
  assert.equal(t.total, 18);           // 20 - 5 + 3
  assert.equal(cartTotals([line(20)], -5, 0).tip, 0);
});

test('negative redeemPoints cannot inflate the bill', () => {
  const t = cartTotals([line(10)], 0, -500);
  assert.equal(t.discount, 0);
  assert.equal(t.total, 10);
});

test('an empty cart is $0 and not NaN', () => {
  const t = cartTotals([], 0, 0);
  assert.equal(t.subtotal, 0);
  assert.equal(t.total, 0);
  assert.equal(t.count, 0);
});

test('money never drifts into float dust', () => {
  const t = cartTotals([line(0.1), line(0.2)], 0, 0);
  assert.equal(t.subtotal, 0.3);        // not 0.30000000000000004
  assert.equal(round2(1.005), 1.01);
});

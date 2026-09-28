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

test('the real demo cart is $24.50 of food plus Houston tax', () => {
  // OG double + beef bacon, Smash Fries single, 2x Can Drink
  const lines = [line(9, [mod(2), mod(1.5)]), line(8, [mod(0), mod(0)]), line(2, [mod(0)], 2)];
  const t = cartTotals(lines, 0, 0);
  assert.equal(t.subtotal, 24.5, 'board prices are pre-tax');
  assert.equal(t.tax, 2.02, '8.25% on $24.50');
  assert.equal(t.total, 26.52);
  assert.equal(t.count, 4);
});

test('tax is added on top, never baked into the menu price', () => {
  // Every US restaurant prices this way. If we ever flip it, the board and the
  // app stop agreeing and every customer notices.
  const t = cartTotals([line(10)], 0, 0);
  assert.equal(t.subtotal, 10, 'the menu says ten dollars');
  assert.ok(t.total > t.subtotal, 'and the customer pays more than ten');
  assert.equal(t.total, 10.83);
});

test('tax is charged on what is actually paid for, not on freebies', () => {
  // A reward priced at zero must not be taxed.
  const t = cartTotals([line(10), line(0)], 0, 0);
  assert.equal(t.subtotal, 10);
  assert.equal(t.tax, 0.83);
});

test('points come off before tax is worked out', () => {
  // Tax is owed on what the customer actually pays, so the discount comes first.
  const t = cartTotals([line(20)], 0, 500);
  assert.equal(t.discount, 500 / POINTS.redeemRate);  // 500 pts = $5
  assert.equal(t.tax, 1.24, '8.25% of $15, not of $20');
  assert.equal(t.total, 16.24);
});

test('points can never take the bill below zero', () => {
  const t = cartTotals([line(3)], 0, 100000);
  assert.equal(t.discount, 3);
  assert.equal(t.tax, 0, 'nothing paid for, nothing to tax');
  assert.equal(t.total, 0);
  assert.ok(t.total >= 0);
});

test('tip is added last and is never taxed', () => {
  // Tipping is not a taxable sale. 20 - 5 = 15, +8.25% tax = 16.24, +3 tip.
  const t = cartTotals([line(20)], 3, 500);
  assert.equal(t.tax, 1.24);
  assert.equal(t.total, 19.24);
  assert.equal(cartTotals([line(20)], -5, 0).tip, 0);
});

test('negative redeemPoints cannot inflate the bill', () => {
  const t = cartTotals([line(10)], 0, -500);
  assert.equal(t.discount, 0);
  assert.equal(t.total, 10.83);
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

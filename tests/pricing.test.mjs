// Money maths. If any of these fail, customers are being charged the wrong amount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTotal, cartTotals, rewardUnitPrice, round2 } from '../lib/pricing.ts';

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
  const t = cartTotals(lines, 0);
  assert.equal(t.subtotal, 24.5, 'board prices are pre-tax');
  assert.equal(t.tax, 2.02, '8.25% on $24.50');
  assert.equal(t.total, 26.52);
  assert.equal(t.count, 4);
});

test('tax is added on top, never baked into the menu price', () => {
  // Every US restaurant prices this way. If we ever flip it, the board and the
  // app stop agreeing and every customer notices.
  const t = cartTotals([line(10)], 0);
  assert.equal(t.subtotal, 10, 'the menu says ten dollars');
  assert.ok(t.total > t.subtotal, 'and the customer pays more than ten');
  assert.equal(t.total, 10.83);
});

test('tax is charged on what is actually paid for, not on freebies', () => {
  // A reward priced at zero must not be taxed.
  const t = cartTotals([line(10), line(0)], 0);
  assert.equal(t.subtotal, 10);
  assert.equal(t.tax, 0.83);
});

test('tip is added last and is never taxed', () => {
  // Tipping is not a taxable sale. $20 + 8.25% tax = 21.65, + 3 tip.
  const t = cartTotals([line(20)], 3);
  assert.equal(t.tax, 1.65);
  assert.equal(t.total, 24.65);
  assert.equal(cartTotals([line(20)], -5).tip, 0);
});

test('an empty cart is $0 and not NaN', () => {
  const t = cartTotals([], 0);
  assert.equal(t.subtotal, 0);
  assert.equal(t.total, 0);
  assert.equal(t.count, 0);
});

test('money never drifts into float dust', () => {
  const t = cartTotals([line(0.1), line(0.2)], 0);
  assert.equal(t.subtotal, 0.3);        // not 0.30000000000000004
  assert.equal(round2(1.005), 1.01);
});

test('the free drink on its own totals exactly zero, so it skips the card step', () => {
  // A claimed freebie must come to $0.00 exactly — not a few cents of tax.
  const drink = { ...line(2, [{ id: 'd_coke', name: 'Coke', priceDelta: 0 }]), claim: { campaign: 'welcome_drink' } };
  drink.item.modifierGroups = [{ id: 'drink_pick', options: [{ id: 'd_coke', name: 'Coke', priceDelta: 0 }] }];
  const t = cartTotals([drink], 0);
  assert.equal(t.subtotal, 0);
  assert.equal(t.tax, 0);
  assert.equal(t.total, 0);
});


// ---- rewards: the item is on the house, real extras are not ----
const PATTY = { id: 'patty', options: [
  { id: 'p_single', name: 'Single patty', priceDelta: 0 },
  { id: 'p_double', name: 'Double patty', priceDelta: 2 },
  { id: 'p_triple', name: 'Triple patty', priceDelta: 4 },
] };
const ADD = { id: 'add_og', options: [
  { id: 't_lettuce', name: 'Lettuce', priceDelta: 0 },
  { id: 't_egg', name: 'Fried egg', priceDelta: 1.5 },
  { id: 't_bacon', name: 'Beef bacon', priceDelta: 1.5 },
] };
const og = { id: 'og', categoryId: 'burgers', name: 'The OG', description: '', price: 9, imageUrl: null, modifierGroups: [PATTY, ADD], available: true };
const opt = (g, id) => g.options.find((o) => o.id === id);
const FREE_BURGER = { patty: 2 };

test('the free burger is free, single or double', () => {
  assert.equal(rewardUnitPrice(og, [opt(PATTY, 'p_single')], FREE_BURGER), 0);
  assert.equal(rewardUnitPrice(og, [opt(PATTY, 'p_double')], FREE_BURGER), 0);
});

test('a triple on the free burger pays the difference, not the whole triple', () => {
  assert.equal(rewardUnitPrice(og, [opt(PATTY, 'p_triple')], FREE_BURGER), 2);
});

test('paid toppings on a free burger are always charged; free ones stay free', () => {
  assert.equal(rewardUnitPrice(og, [opt(PATTY, 'p_single'), opt(ADD, 't_egg'), opt(ADD, 't_lettuce')], FREE_BURGER), 1.5);
  assert.equal(rewardUnitPrice(og, [opt(PATTY, 'p_double'), opt(ADD, 't_egg'), opt(ADD, 't_bacon')], FREE_BURGER), 3);
});

test('a reward line is taxed only on the extras actually paid for', () => {
  const l = { key: 'r', item: og, qty: 1, chosen: [opt(PATTY, 'p_triple')], claim: { campaign: 'stamp_card', tier: 10, cover: FREE_BURGER } };
  const t = cartTotals([l], 0);
  assert.equal(t.subtotal, 2);
  assert.equal(t.saved, 11, 'a $13 triple, $2 paid');
  assert.equal(t.tax, 0.17);
});

test('seasoned fries sauces are 25 cents a cup, counted', () => {
  const cup = { id: 'fs_ketchup', name: 'Ketchup', priceDelta: 0.25 };
  const bbq = { id: 'fs_bbq', name: 'BBQ', priceDelta: 0.25 };
  assert.equal(lineTotal(line(5, [cup, cup, cup, bbq])), 6);
});

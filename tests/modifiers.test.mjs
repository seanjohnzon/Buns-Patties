// How options behave when tapped. These are the owner's menu rules; if one of
// these fails, the item screen lets someone order something the truck doesn't make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bump, groupMax, initialChoice, missing, tap, trimToLimits } from '../lib/modifiers.ts';

const seed = JSON.parse(readFileSync(new URL('../data/menu.seed.json', import.meta.url)));
const item = (id) => {
  const i = seed.items.find((x) => x.id === id);
  return { ...i, modifierGroups: i.modifierGroups.map((g) => seed.modifierGroups[g]) };
};
const g = (it, id) => it.modifierGroups.find((x) => x.id === id);
const o = (grp, id) => grp.options.find((x) => x.id === id);
const ids = (choice, gid) => (choice[gid] ?? []).map((x) => x.id);

test('a burger opens built: its sauce and cheese are already picked, and it is orderable as is', () => {
  const bbq = item('bbq_bacon');
  const c = initialChoice(bbq);
  assert.deepEqual(ids(c, 'sauce'), ['s_bbq']);
  assert.deepEqual(ids(c, 'cheese'), ['c_american']);
  assert.deepEqual(ids(c, 'patty'), ['p_single'], 'single patty, the board price');
  assert.deepEqual(missing(bbq, c), [], 'it can go straight in the order');
});

test('"No sauce" clears the sauce, and picking a sauce clears "No sauce"', () => {
  const og = item('og');
  const sauce = g(og, 'sauce');
  let c = initialChoice(og);
  assert.deepEqual(ids(c, 'sauce'), ['s_ketchup', 's_mustard']);
  c = tap(sauce, o(sauce, 's_none'), c);
  assert.deepEqual(ids(c, 'sauce'), ['s_none']);
  c = tap(sauce, o(sauce, 's_bbq'), c);
  assert.deepEqual(ids(c, 'sauce'), ['s_bbq']);
});

test('sauces stop at two; a third tap swaps out the oldest', () => {
  const sf = item('smash_fries');
  const sauce = g(sf, 'sauce');
  let c = initialChoice(sf);
  c = tap(sauce, o(sauce, 's_og'), c);
  c = tap(sauce, o(sauce, 's_bbq'), c);
  c = tap(sauce, o(sauce, 's_mayo'), c);
  assert.deepEqual(ids(c, 'sauce'), ['s_bbq', 's_mayo']);
});

test('no cheese is a choice, and cheese cannot be left blank', () => {
  const og = item('og');
  const cheese = g(og, 'cheese');
  let c = tap(cheese, o(cheese, 'c_none'), initialChoice(og));
  assert.deepEqual(ids(c, 'cheese'), ['c_none']);
  c = tap(cheese, o(cheese, 'c_none'), c);
  assert.deepEqual(ids(c, 'cheese'), ['c_none'], 'tapping the picked one again does not empty a required choice');
});

test('smash fries need a sauce before they can be ordered', () => {
  const sf = item('smash_fries');
  const c = initialChoice(sf);
  assert.ok(missing(sf, c).some((x) => x.id === 'sauce'));
});

test('wings: one flavor at 4 or 6, two at 8 or 10, trimmed when you go back down', () => {
  const w = item('wings');
  const count = g(w, 'wing_count');
  const flavor = g(w, 'wing_flavor');
  let c = tap(count, o(count, 'w_4'), initialChoice(w));
  assert.equal(groupMax(flavor, c), 1);
  c = tap(count, o(count, 'w_10'), c);
  assert.equal(groupMax(flavor, c), 2);
  c = tap(flavor, flavor.options[0], c);
  c = tap(flavor, flavor.options[5], c);
  assert.equal(c.wing_flavor.length, 2);
  c = trimToLimits(w, tap(count, o(count, 'w_6'), c));
  assert.equal(c.wing_flavor.length, 1, '6 wings keeps one flavor');
});

test('seasoned fries: any mix of sauce cups, counted up and down', () => {
  const sf = item('seasoned_fries');
  const cups = g(sf, 'fry_sauces');
  const ketchup = o(cups, 'fs_ketchup');
  let c = initialChoice(sf);
  c = bump(cups, ketchup, 1, c);
  c = bump(cups, ketchup, 1, c);
  c = bump(cups, o(cups, 'fs_bbq'), 1, c);
  assert.deepEqual(ids(c, 'fry_sauces'), ['fs_ketchup', 'fs_ketchup', 'fs_bbq']);
  c = bump(cups, ketchup, -1, c);
  assert.deepEqual(ids(c, 'fry_sauces'), ['fs_ketchup', 'fs_bbq']);
  c = bump(cups, o(cups, 'fs_mayo'), -1, c);
  assert.equal(c.fry_sauces.length, 2, 'taking away one you do not have does nothing');
});

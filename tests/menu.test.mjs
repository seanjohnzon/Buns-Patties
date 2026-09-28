// Locks the app's menu to the printed board. If someone edits a price or a
// modifier by mistake, this fails before it ever reaches a customer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../data/menu.seed.json', import.meta.url)));
const byId = Object.fromEntries(seed.items.map((i) => [i.id, i]));
const groups = seed.modifierGroups;

const delta = (groupId, optId) =>
  groups[groupId].options.find((o) => o.id === optId).priceDelta;

// ---- prices straight off the printed menu ----
const BOARD = {
  og:             { single: 9,  double: 11, triple: 13 },
  wake_n_smash:   { single: 10, double: 12, triple: 14 },
  lone_star_heat: { single: 9,  double: 11, triple: 13 },
  bbq_bacon:      { single: 10, double: 12, triple: 14 },
  build_your_own: { single: 9,  double: 11, triple: 13 },
  smash_fries:    { single: 8,  double: 10, triple: 12 },
};

test('every patty-priced item matches the printed board', () => {
  for (const [id, want] of Object.entries(BOARD)) {
    const item = byId[id];
    assert.ok(item, `${id} is missing from the menu`);
    assert.equal(item.price, want.single, `${id} single patty`);
    assert.equal(item.price + delta('patty', 'p_double'), want.double, `${id} double patty`);
    assert.equal(item.price + delta('patty', 'p_triple'), want.triple, `${id} triple patty`);
  }
});

test('wings match the board at every size', () => {
  const wings = byId.wings;
  assert.equal(wings.price + delta('wing_count', 'w_4'), 8);
  assert.equal(wings.price + delta('wing_count', 'w_6'), 11);
  assert.equal(wings.price + delta('wing_count', 'w_8'), 14);
  assert.equal(wings.price + delta('wing_count', 'w_10'), 17);
});

test('the flat-priced items match the board', () => {
  assert.equal(byId.seasoned_fries.price, 5);
  assert.equal(byId.can_drink.price, 2);
  assert.equal(byId.water.price, 1.5);
});

test('the paid toppings are the three on the board, at $1.50', () => {
  const paid = groups.toppings_add.options.filter((o) => o.priceDelta > 0);
  assert.deepEqual(paid.map((o) => o.id).sort(), ['t_avocado', 't_bacon', 't_egg']);
  for (const o of paid) assert.equal(o.priceDelta, 1.5, `${o.name} should be +$1.50`);
});

test('every other topping and all sauces are free', () => {
  const free = groups.toppings_add.options.filter((o) => !['t_avocado', 't_bacon', 't_egg'].includes(o.id));
  for (const o of free) assert.equal(o.priceDelta, 0, `${o.name} should be free`);
  for (const o of groups.sauces_add.options) assert.equal(o.priceDelta, 0, `${o.name} should be free`);
});

test('wings carry all five dry rubs and three wet rubs', () => {
  const flavours = groups.wing_flavor.options;
  assert.equal(flavours.filter((o) => o.name.startsWith('Dry rub')).length, 5);
  assert.equal(flavours.filter((o) => o.name.startsWith('Wet rub')).length, 3);
});

// ---- structural integrity ----
test('every item points at modifier groups that actually exist', () => {
  for (const item of seed.items) {
    for (const g of item.modifierGroups) {
      assert.ok(groups[g], `${item.id} references missing modifier group "${g}"`);
    }
  }
});

test('every item sits in a real category, and no category is empty', () => {
  const cats = new Set(seed.categories.map((c) => c.id));
  for (const item of seed.items) {
    assert.ok(cats.has(item.categoryId), `${item.id} is in unknown category "${item.categoryId}"`);
  }
  for (const c of cats) {
    assert.ok(seed.items.some((i) => i.categoryId === c), `category "${c}" has no items`);
  }
});

test('ids are unique across items, categories and modifier options', () => {
  const ids = seed.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate item id');
  for (const [gid, g] of Object.entries(groups)) {
    const opts = g.options.map((o) => o.id);
    assert.equal(new Set(opts).size, opts.length, `duplicate option id in ${gid}`);
  }
});

test('required groups can actually be satisfied', () => {
  for (const [gid, g] of Object.entries(groups)) {
    if (!g.required) continue;
    assert.ok(g.min >= 1, `${gid} is required but min is ${g.min}`);
    assert.ok(g.options.length >= g.min, `${gid} needs ${g.min} picks but offers ${g.options.length}`);
    assert.ok(g.max >= g.min, `${gid} has max below min`);
  }
});

test('every burger can have its own ingredients removed', () => {
  for (const id of ['og', 'wake_n_smash', 'lone_star_heat', 'bbq_bacon']) {
    const hasRemove = byId[id].modifierGroups.some((g) => g.startsWith('rm_'));
    assert.ok(hasRemove, `${id} has no "remove" group, so customers cannot say "no pickles"`);
  }
});

test('every reward points at a real menu item', () => {
  for (const r of seed.rewards) {
    assert.ok(byId[r.menuItemId], `reward "${r.id}" points at missing item "${r.menuItemId}"`);
    assert.ok(r.pointsCost > 0, `reward "${r.id}" costs nothing`);
  }
});

test('no item is priced at zero or negative', () => {
  for (const i of seed.items) assert.ok(i.price > 0, `${i.id} is priced at ${i.price}`);
});

test('something is featured, so the home screen is not empty', () => {
  assert.ok(seed.items.some((i) => i.featured), 'no featured items');
});

// ---- sold out ----
// Staff flip this mid-service. If it is written but never read, a customer
// orders something that ran out an hour ago.
test('an item is sold out only for the day it was switched off', async () => {
  const { isSoldOut } = await import('../lib/availability.ts');
  const day = (s) => new Date(s + 'T12:00:00Z');
  assert.equal(isSoldOut({ soldOutUntil: null }), false);
  assert.equal(isSoldOut({}), false);
  assert.equal(isSoldOut({ soldOutUntil: '2026-10-02' }, day('2026-10-02')), true, 'same day: off');
  assert.equal(isSoldOut({ soldOutUntil: '2026-10-02' }, day('2026-10-03')), false, 'next day: back on by itself');
  assert.equal(isSoldOut({ soldOutUntil: '2026-10-05' }, day('2026-10-02')), true, 'a future date keeps it off');
});

test('a customer only sees what can actually be made', async () => {
  const { isOrderable } = await import('../lib/availability.ts');
  const day = (s) => new Date(s + 'T12:00:00Z');
  assert.equal(isOrderable({ available: true }), true);
  assert.equal(isOrderable({ available: false }), false, 'taken off the menu entirely');
  assert.equal(isOrderable({ available: true, soldOutUntil: '2026-10-02' }, day('2026-10-02')), false, 'ran out today');
  assert.equal(isOrderable({ available: true, soldOutUntil: '2026-10-02' }, day('2026-10-03')), true, 'back tomorrow');
});

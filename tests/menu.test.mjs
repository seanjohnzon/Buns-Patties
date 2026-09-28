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

test('every other topping and all burger sauces are free', () => {
  const free = groups.toppings_add.options.filter((o) => !['t_avocado', 't_bacon', 't_egg'].includes(o.id));
  for (const o of free) assert.equal(o.priceDelta, 0, `${o.name} should be free`);
  for (const o of groups.sauce.options) assert.equal(o.priceDelta, 0, `${o.name} should be free`);
});

test('sauce cups on seasoned fries are 25 cents each, and counted', () => {
  assert.equal(groups.fry_sauces.counted, true);
  for (const o of groups.fry_sauces.options) assert.equal(o.priceDelta, 0.25, o.name);
  assert.deepEqual(byId.seasoned_fries.modifierGroups, ['fry_sauces']);
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

const SIGNATURE = ['og', 'wake_n_smash', 'lone_star_heat', 'bbq_bacon'];

test('every burger opens with its own sauce and its cheese already picked', () => {
  for (const id of SIGNATURE) {
    const item = byId[id];
    assert.ok(item.defaults?.sauce?.length, `${id} has no default sauce`);
    assert.deepEqual(item.defaults.cheese, ['c_american'], `${id} should come with American cheese`);
    for (const s of item.defaults.sauce) assert.ok(groups.sauce.options.some((o) => o.id === s), `${id}: unknown sauce ${s}`);
  }
});

test('no sauce and no cheese are real choices', () => {
  assert.ok(groups.sauce.options.some((o) => o.id === 's_none'));
  assert.ok(groups.sauce.exclusive.includes('s_none'), '"No sauce" clears the others');
  assert.ok(groups.cheese.options.some((o) => o.id === 'c_none'));
});

test('what comes on a burger is listed, never removable, never sold back to you', () => {
  // BBQ Bacon already has beef bacon: offering it as a $1.50 add-on charged
  // people for what they were already getting.
  const NAME = { t_lettuce: 'Lettuce', t_pickles: 'Pickles', t_tomatoes: 'Tomatoes', t_cucumbers: 'Cucumber',
    t_onions: 'onion', t_jalapenos: 'Jalapeños', t_avocado: 'Avocado', t_bacon: 'Beef bacon' };
  for (const id of SIGNATURE) {
    const item = byId[id];
    assert.ok(item.includes?.length, `${id} lists nothing it comes with`);
    assert.ok(!item.modifierGroups.some((g) => g.startsWith('rm_')), `${id} still has a remove list`);
    const add = groups[item.modifierGroups.find((g) => g.startsWith('add_'))];
    for (const o of add.options) {
      const n = NAME[o.id];
      if (!n) continue;
      assert.ok(!item.includes.some((x) => x.toLowerCase().includes(n.toLowerCase())), `${id} sells ${o.name} it already comes with`);
    }
  }
  assert.ok(!groups.add_bbq.options.some((o) => o.id === 't_bacon'), 'BBQ Bacon must not sell bacon');
  assert.ok(!groups.add_wake.options.some((o) => o.id === 't_avocado'), 'Wake N Smash must not sell avocado');
});

test('wings: one flavor for 4 or 6, two for 8 or 10', () => {
  const f = groups.wing_flavor;
  assert.equal(f.max, 1);
  assert.deepEqual(f.maxWhen, [{ group: 'wing_count', options: ['w_8', 'w_10'], max: 2 }]);
});

test('smash fries: toppings before sauce, sauce required, up to two, or none', () => {
  const g = byId.smash_fries.modifierGroups;
  assert.ok(g.indexOf('toppings_add') < g.indexOf('sauce'), 'toppings come first');
  assert.ok(g.includes('cheese'), 'no-cheese option');
  assert.equal(groups.sauce.required, true);
  assert.equal(groups.sauce.max, 2);
  assert.equal(byId.smash_fries.defaults?.sauce, undefined, 'they choose their own sauce');
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

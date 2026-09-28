// The server's copy of the menu rules (supabase/functions/_shared/validate-mods.ts).
// The app stops a customer tapping their way into these; this stops anyone who
// skips the app and sends an order by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMods } from '../supabase/functions/_shared/validate-mods.ts';
import { initialChoice } from '../lib/modifiers.ts';

const seed = JSON.parse(readFileSync(new URL('../data/menu.seed.json', import.meta.url)));
const groupsOf = (id) => seed.items.find((i) => i.id === id).modifierGroups.map((g) => seed.modifierGroups[g]);
const item = (id) => ({ ...seed.items.find((i) => i.id === id), modifierGroups: groupsOf(id) });
const ok = (id, mods) => checkMods(groupsOf(id), mods).ok;

test('every burger, exactly as it opens in the app, is accepted', () => {
  for (const id of ['og', 'wake_n_smash', 'lone_star_heat', 'bbq_bacon', 'smash_fries']) {
    const names = Object.values(initialChoice(item(id))).flat().map((o) => o.name);
    const withSauce = id === 'smash_fries' ? [...names, 'BBQ'] : names;
    assert.ok(ok(id, withSauce), `${id} as it opens: ${withSauce.join(', ')}`);
  }
});

test('an option that is not on the item is refused', () => {
  assert.equal(ok('og', ['Single patty', 'American cheese', 'Ketchup', 'Truffle oil']), false);
  assert.equal(ok('bbq_bacon', ['Single patty', 'American cheese', 'BBQ', 'Beef bacon']), false, 'bacon is not an add-on on BBQ Bacon');
});

test('a required choice cannot be skipped', () => {
  assert.equal(ok('og', ['American cheese', 'Ketchup']), false, 'no patty count');
  assert.equal(ok('og', ['Single patty', 'Ketchup']), false, 'no cheese choice');
  assert.equal(ok('smash_fries', ['Single patty', 'American cheese']), false, 'smash fries need a sauce');
  assert.equal(ok('wings', ['4 piece']), false, 'wings need a sauce');
});

test('"No sauce" and "No cheese" stand alone', () => {
  assert.ok(ok('og', ['Single patty', 'No cheese', 'No sauce']));
  assert.equal(ok('og', ['Single patty', 'American cheese', 'No sauce', 'BBQ']), false);
  assert.equal(ok('og', ['Single patty', 'American cheese', 'No cheese', 'Ketchup']), false);
});

test('two sauces at most on burgers and smash fries', () => {
  assert.ok(ok('og', ['Single patty', 'American cheese', 'Ketchup', 'BBQ']));
  assert.equal(ok('og', ['Single patty', 'American cheese', 'Ketchup', 'BBQ', 'Mayo']), false);
});

test('wings: one sauce at 4 or 6, two at 8 or 10', () => {
  const dry = seed.modifierGroups.wing_flavor.options.map((o) => o.name);
  assert.ok(ok('wings', ['4 piece', dry[0]]));
  assert.equal(ok('wings', ['6 piece', dry[0], dry[1]]), false);
  assert.ok(ok('wings', ['8 piece', dry[0], dry[1]]));
  assert.ok(ok('wings', ['10 piece', dry[0], dry[5]]));
  assert.equal(ok('wings', ['10 piece', dry[0], dry[1], dry[2]]), false);
});

test('nothing picked twice, except sauce cups on seasoned fries', () => {
  assert.equal(ok('og', ['Single patty', 'Single patty', 'American cheese', 'Ketchup']), false);
  assert.ok(ok('seasoned_fries', ['Ketchup', 'Ketchup', 'Ketchup', 'BBQ']));
  assert.ok(ok('seasoned_fries', []), 'plain fries are fine');
});

test('the server charges what the app shows for extras', () => {
  const r = checkMods(groupsOf('seasoned_fries'), ['Ketchup', 'Ketchup', 'BBQ']);
  assert.equal(r.picked.reduce((s, p) => s + p.delta, 0), 0.75);
  const b = checkMods(groupsOf('og'), ['Triple patty', 'American cheese', 'Fried egg', 'Ketchup']);
  assert.equal(b.picked.reduce((s, p) => s + p.delta, 0), 5.5);
});

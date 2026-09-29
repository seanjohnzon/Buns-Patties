// The test database (lib/local): what Expo Go and the TestFlight test app run on
// before the real database exists. Run here on Node's own SQLite, which speaks
// the same SQL as the phone's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteKV, memoryKV } from '../lib/local/kv.ts';
import { createLocalStore } from '../lib/local/store.ts';
import { campaignStats, loyalty, ownerToday, placeTestOrder, productMix } from '../lib/local/logic.ts';
import { DEFAULT_CAMPAIGNS } from '../lib/campaigns.ts';

const onNode = (db) => ({
  execSync: (sql) => db.exec(sql),
  getFirstSync: (sql, p) => db.prepare(sql).get(...p) ?? null,
  runSync: (sql, p) => db.prepare(sql).run(...p),
});
const fresh = () => ({
  truck: { isOpen: false, locationName: 'TBD', address: 'Houston, TX', lat: null, lng: null, hoursText: 'TBD', prepMinutes: 15 },
  soldOut: {}, orders: [], claims: [], stamps: {}, campaigns: DEFAULT_CAMPAIGNS, feedback: [], profileName: null,
});
const newStore = () => createLocalStore(memoryKV(), fresh);
const NOW = new Date('2026-10-02T12:00:00');
const line = (over = {}) => ({ menuItemId: 'og', name: 'The OG', qty: 1, price: 9, listPrice: 9, mods: ['Single patty'], ...over });
const order = (lines, over = {}) => {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const saved = lines.reduce((s, l) => s + (l.listPrice - l.price) * l.qty, 0);
  return { lines, subtotal, tax: 0, tip: 0, total: subtotal, saved, pickupName: 'Maria', pickupAt: null, ...over };
};

test('the SQL: one table, a key and a JSON value, and it survives closing the app', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'bp-')), 'bp-test.db');
  let db = new DatabaseSync(file);
  const kv = sqliteKV(onNode(db));
  kv.set('stamps', '{"stamp_card":3}');
  kv.set('stamps', '{"stamp_card":4}');           // upsert, not a second row
  db.close();

  db = new DatabaseSync(file);                    // the app was closed and opened again
  const again = sqliteKV(onNode(db));
  assert.equal(again.get('stamps'), '{"stamp_card":4}');
  assert.equal(db.prepare('select count(*) as n from kv').get().n, 1);
  again.clear();
  assert.equal(again.get('stamps'), null);
  db.close();
});

test('a fresh test database has the real campaigns and nothing else', () => {
  const s = newStore();
  assert.deepEqual(s.read('orders'), []);
  assert.deepEqual(s.read('stamps'), {});
  assert.deepEqual(s.read('campaigns').map((c) => c.id), ['welcome_drink', 'stamp_card']);
  assert.equal(s.read('campaigns')[0].claimsCount, 0, 'no made-up numbers');
});

test('what is written is what is read back; wipe starts again', () => {
  const s = newStore();
  s.write('profileName', 'Maria');
  assert.equal(s.read('profileName'), 'Maria');
  s.wipe();
  assert.equal(s.read('profileName'), null);
});

test('a $15+ order earns a stamp and lands on the kitchen board', () => {
  const s = newStore();
  const o = placeTestOrder(s, order([line({ qty: 2 })]), NOW, 't1');
  assert.equal(o.status, 'received');
  assert.equal(o.stampsEarned, 1);
  assert.equal(s.read('stamps').stamp_card, 1);
  assert.equal(s.read('orders')[0].id, 't1');
});

test('under $15 earns nothing', () => {
  const s = newStore();
  placeTestOrder(s, order([line({ menuItemId: 'can_drink', name: 'Can Drink', price: 2, listPrice: 2 })]), NOW, 't1');
  assert.equal(s.read('stamps').stamp_card ?? 0, 0);
});

test('free fries spend 5 stamps; not enough stamps changes nothing', () => {
  const s = newStore();
  const fries = line({ menuItemId: 'seasoned_fries', name: 'Seasoned Fries (on us)', price: 0, listPrice: 5, claim: { campaign: 'stamp_card', tier: 5 } });
  s.write('stamps', { stamp_card: 4 });
  assert.throws(() => placeTestOrder(s, order([fries]), NOW, 't1'), /not enough stamps/);
  assert.equal(s.read('stamps').stamp_card, 4);
  assert.deepEqual(s.read('orders'), []);
  s.write('stamps', { stamp_card: 7 });
  placeTestOrder(s, order([fries]), NOW, 't2');
  assert.equal(s.read('stamps').stamp_card, 2);
});

test('the free drink needs unlocking first, and is used once', () => {
  const s = newStore();
  const drink = line({ menuItemId: 'can_drink', name: 'Can Drink (on us)', price: 0, listPrice: 2, mods: ['Sprite'], claim: { campaign: 'welcome_drink' } });
  assert.throws(() => placeTestOrder(s, order([drink]), NOW, 't1'), /not been unlocked/);
  s.write('claims', [{ campaignId: 'welcome_drink', unlockedBy: 'follow_instagram', usedAt: null }]);
  placeTestOrder(s, order([drink]), NOW, 't2');
  assert.ok(s.read('claims')[0].usedAt);
  assert.throws(() => placeTestOrder(s, order([drink]), NOW, 't3'), /not been unlocked/);
});

test('the owner\'s numbers come from the test orders, not made-up figures', () => {
  const s = newStore();
  s.write('claims', [{ campaignId: 'welcome_drink', unlockedBy: 'follow_instagram', usedAt: null }]);
  placeTestOrder(s, order([line({ qty: 2 }), line({ menuItemId: 'can_drink', name: 'Can Drink (on us)', price: 0, listPrice: 2, claim: { campaign: 'welcome_drink' } })], { tip: 3 }), NOW, 't1');
  placeTestOrder(s, order([line({ menuItemId: 'wings', name: 'Wings', price: 8, listPrice: 8 })]), NOW, 't2');
  const orders = s.read('orders');
  const t = ownerToday(orders, NOW);
  assert.equal(t.netToday, 26, 'food only: 18 + 8');
  assert.equal(t.tipsToday, 3, 'tips kept apart');
  assert.equal(t.ordersToday, 2);
  assert.equal(t.discountToday, 2, 'the free drink at full price');
  assert.deepEqual(productMix(orders, NOW).map((r) => [r.menuItemId, r.qty]), [['og', 2], ['can_drink', 1], ['wings', 1]]);
  assert.deepEqual(loyalty(orders, NOW), { members: 1, newThisWeek: 0, givenThisWeek: 1, givenValueThisWeek: 2 });
  const drink = campaignStats({ campaigns: s.read('campaigns'), claims: s.read('claims'), orders }).find((c) => c.id === 'welcome_drink');
  assert.deepEqual([drink.claimsCount, drink.usedCount, drink.cost], [1, 1, 2]);
});

test('cancelled orders do not count in the owner\'s numbers', () => {
  const s = newStore();
  placeTestOrder(s, order([line({ qty: 2 })]), NOW, 't1');
  s.write('orders', s.read('orders').map((o) => ({ ...o, status: 'cancelled' })));
  assert.equal(ownerToday(s.read('orders'), NOW).netToday, 0);
});

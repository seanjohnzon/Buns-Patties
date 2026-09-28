// Owner dashboard maths. Wrong numbers here lose the owner's trust in the whole app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageTicket, changeVsLastWeek, mixShare, summariseToday } from '../lib/reporting.ts';

test('average ticket is money over orders', () => {
  assert.equal(averageTicket(245, 10), 24.5);
  assert.equal(averageTicket(100, 3), 33.33);
});

test('a day with no orders shows zero, never a divide-by-zero', () => {
  assert.equal(averageTicket(0, 0), 0);
  assert.ok(Number.isFinite(averageTicket(0, 0)));
});

test('change against last week is a whole percentage', () => {
  assert.equal(changeVsLastWeek(120, 100), 20);
  assert.equal(changeVsLastWeek(80, 100), -20);
  assert.equal(changeVsLastWeek(100, 100), 0);
});

test('no comparison is offered when last week was nothing', () => {
  // "up 100%" from zero is noise, not information.
  assert.equal(changeVsLastWeek(500, 0), null);
  assert.equal(changeVsLastWeek(0, 0), null);
});

test('product mix shares add up to one', () => {
  const rows = [
    { menuItemId: 'og', name: 'The OG', qty: 30, revenue: 300 },
    { menuItemId: 'fries', name: 'Fries', qty: 10, revenue: 50 },
  ];
  const out = mixShare(rows);
  assert.equal(out[0].share, 0.75);
  assert.equal(out.reduce((s, r) => s + r.share, 0), 1);
});

test('an empty mix does not divide by zero', () => {
  assert.deepEqual(mixShare([]), []);
  assert.equal(mixShare([{ menuItemId: 'x', name: 'X', qty: 0, revenue: 0 }])[0].share, 0);
});

test("today's summary reports tips apart from takings", () => {
  // Tips belong to staff. Rolling them into sales would overstate the business.
  const s = summariseToday({
    netToday: 245, tipsToday: 30, ordersToday: 10, discountToday: 5,
    netLastWeek: 200, ordersLastWeek: 8,
  });
  assert.equal(s.net, 245);
  assert.equal(s.tips, 30);
  assert.notEqual(s.net, 275, 'tips must not be counted as sales');
  assert.equal(s.avgTicket, 24.5);
  assert.equal(s.netChange, 23);
  assert.equal(s.ordersChange, 25);
});

test('a quiet day summarises without blowing up', () => {
  const s = summariseToday({
    netToday: 0, tipsToday: 0, ordersToday: 0, discountToday: 0,
    netLastWeek: 0, ordersLastWeek: 0,
  });
  assert.equal(s.net, 0);
  assert.equal(s.avgTicket, 0);
  assert.equal(s.netChange, null);
});

test('the mix is read top-down, so it must arrive sorted by quantity', () => {
  // The screen draws a bar per row and says "prep the top one first";
  // an unsorted list would make that advice wrong.
  const rows = mixShare([
    { menuItemId: 'a', name: 'A', qty: 64, revenue: 700 },
    { menuItemId: 'b', name: 'B', qty: 52, revenue: 104 },
    { menuItemId: 'c', name: 'C', qty: 41, revenue: 369 },
  ]);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].qty >= rows[i].qty, 'mix rows must descend by quantity');
    assert.ok(rows[i - 1].share >= rows[i].share, 'bar widths must descend with them');
  }
});

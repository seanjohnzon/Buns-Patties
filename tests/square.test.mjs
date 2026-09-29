// The Square side of checkout (supabase/functions/_shared/square.ts). If these
// fail, the owner's Square either charges the wrong amount, shows him the wrong
// order, or believes a forged "paid" message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { SQUARE_SCOPES, TAX_PERCENT, acceptSquareTotal, cents, e164, fullyRefunded, modSummary, orderIsPaid, squareBase, squareOrder, verifySquareSignature } from '../supabase/functions/_shared/square.ts';

const order = {
  orderId: '3f2b6c1e-9a8d-4f7e-b1c2-0d9e8f7a6b5c',
  lines: [
    { name: 'The OG', qty: 2, unitPrice: 12.5, mods: ['Double patty', 'No cheese', 'Fried egg', 'Ketchup'], note: 'Well done', free: false },
    { name: 'Seasoned Fries', qty: 1, unitPrice: 5.75, mods: ['Ketchup', 'Ketchup', 'Ketchup'], note: null, free: false },
    { name: 'Can Drink (on us)', qty: 1, unitPrice: 0, mods: ['Sprite'], note: null, free: true },
  ],
  tip: 4.2,
  pickupName: 'Maria',
  pickupAt: null,
};

test('money goes to Square in whole cents, without float dust', () => {
  assert.equal(cents(12.5), 1250);
  assert.equal(cents(0.1 + 0.2), 30);
  assert.equal(cents(1.005), 101);
  assert.equal(cents(0), 0);
});

test('every line reaches Square at the price the server worked out', () => {
  const o = squareOrder(order, 'LOC1');
  assert.equal(o.location_id, 'LOC1');
  assert.deepEqual(o.line_items.map((l) => [l.name, l.quantity, l.base_price_money.amount]), [
    ['The OG', '2', 1250], ['Seasoned Fries', '1', 575], ['Can Drink (on us)', '1', 0],
  ]);
  for (const l of o.line_items) assert.equal(l.base_price_money.currency, 'USD');
});

test('the owner sees what to make: options, note, and which lines were free', () => {
  const [og, fries, drink] = squareOrder(order, 'L').line_items;
  assert.equal(og.note, 'Double patty, No cheese, Fried egg, Ketchup · “Well done”');
  assert.equal(fries.note, 'Ketchup ×3');
  assert.equal(drink.note, 'On us · Sprite');
});

test('Houston tax is added by Square on the whole order; the tip is untaxed', () => {
  const o = squareOrder(order, 'L');
  assert.equal(TAX_PERCENT, '8.25');
  assert.deepEqual(o.taxes, [{ uid: 'houston-sales-tax', name: 'Sales tax', percentage: '8.25', type: 'ADDITIVE', scope: 'ORDER' }]);
  assert.equal(o.service_charges[0].amount_money.amount, 420);
  assert.equal(o.service_charges[0].taxable, false);
  assert.equal(squareOrder({ ...order, tip: 0 }, 'L').service_charges, undefined, 'no tip, no tip line');
});

test('the Square order points back to ours, and is marked as from the app', () => {
  const o = squareOrder(order, 'L');
  assert.equal(o.reference_id, order.orderId);
  assert.ok(o.reference_id.length <= 40, 'Square caps reference_id at 40');
  assert.equal(o.source.name, 'Buns & Patties app');
});

test('it arrives as a pickup under the customer\'s name, ASAP or at their time', () => {
  const asap = squareOrder(order, 'L').fulfillments[0];
  assert.equal(asap.type, 'PICKUP');
  assert.equal(asap.pickup_details.recipient.display_name, 'Maria');
  assert.equal(asap.pickup_details.schedule_type, 'ASAP');
  const later = squareOrder({ ...order, pickupAt: '2026-10-02T18:30:00Z' }, 'L').fulfillments[0];
  assert.equal(later.pickup_details.schedule_type, 'SCHEDULED');
  assert.equal(later.pickup_details.pickup_at, '2026-10-02T18:30:00Z');
});

test('Square\'s total wins only when it is a rounding cent or two away from ours', () => {
  assert.ok(acceptSquareTotal(29.43, 2943));
  assert.ok(acceptSquareTotal(29.43, 2944));
  assert.ok(acceptSquareTotal(29.43, 2941));
  assert.equal(acceptSquareTotal(29.43, 2950), false);
  assert.equal(acceptSquareTotal(29.43, 0), false);
});

test('a forged "paid" message is refused; a real one is accepted', async () => {
  const key = 'test-signature-key', url = 'https://ref.supabase.co/functions/v1/square-webhook';
  const body = JSON.stringify({ event_id: 'e1', type: 'payment.updated', data: { object: { payment: { status: 'COMPLETED' } } } });
  const good = createHmac('sha256', key).update(url + body).digest('base64');
  assert.equal(await verifySquareSignature(body, good, key, url), true);
  assert.equal(await verifySquareSignature(body.replace('COMPLETED', 'COMPLETEX'), good, key, url), false, 'tampered body');
  assert.equal(await verifySquareSignature(body, good, 'wrong-key', url), false, 'wrong key');
  assert.equal(await verifySquareSignature(body, good, key, url + '/x'), false, 'wrong URL');
  assert.equal(await verifySquareSignature(body, null, key, url), false, 'no signature');
  assert.equal(await verifySquareSignature(body, good, '', url), false, 'no key configured');
});

test('an order counts as paid only with a payment on it and nothing left to pay', () => {
  assert.equal(orderIsPaid({ tenders: [{ id: 't' }], net_amount_due_money: { amount: 0 } }), true);
  assert.equal(orderIsPaid({ tenders: [], net_amount_due_money: { amount: 2943 } }), false);
  assert.equal(orderIsPaid({ tenders: [{ id: 't' }], net_amount_due_money: { amount: 100 } }), false);
  assert.equal(orderIsPaid(null), false);
});

test('phone numbers reach Square as +1…', () => {
  assert.equal(e164('17135550100'), '+17135550100');
  assert.equal(e164('7135550100'), '+17135550100');
  assert.equal(e164('55501'), undefined);
  assert.equal(e164(null), undefined);
});

test('the Allow button asks for payments and orders, never the bank', () => {
  assert.ok(SQUARE_SCOPES.includes('PAYMENTS_WRITE') && SQUARE_SCOPES.includes('ORDERS_WRITE'));
  for (const s of SQUARE_SCOPES) assert.ok(!/BANK|SETTLEMENT|EMPLOYEE/.test(s), `${s} is more than the app needs`);
});

test('sandbox unless told otherwise, so a test can never charge a real card', () => {
  assert.equal(squareBase(undefined), 'https://connect.squareupsandbox.com');
  assert.equal(squareBase('sandbox'), 'https://connect.squareupsandbox.com');
  assert.equal(squareBase('production'), 'https://connect.squareup.com');
});

test('modSummary counts repeats', () => {
  assert.equal(modSummary(['BBQ', 'Ketchup', 'Ketchup']), 'BBQ, Ketchup ×2');
});

test('an order refunded back to nothing is not paid, whatever its tenders say', () => {
  assert.equal(orderIsPaid({ tenders: [{ id: 't' }], net_amount_due_money: { amount: 0 }, refunds: [{ id: 'r' }], net_amounts: { total_money: { amount: 0 } } }), false);
  assert.equal(orderIsPaid({ tenders: [{ id: 't' }], net_amount_due_money: { amount: 0 }, refunds: [{ id: 'r' }], net_amounts: { total_money: { amount: 500 } } }), true, 'a partial refund leaves it paid');
});

test('refunds that come in pieces count once they add up to the whole payment', () => {
  assert.equal(fullyRefunded({ total_money: { amount: 2943 }, refunded_money: { amount: 1000 } }), false);
  assert.equal(fullyRefunded({ total_money: { amount: 2943 }, refunded_money: { amount: 2943 } }), true);
  assert.equal(fullyRefunded({ amount_money: { amount: 500 }, refunded_money: { amount: 500 } }), true);
  assert.equal(fullyRefunded(null), false);
});

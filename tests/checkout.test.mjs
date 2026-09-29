// What a customer is allowed to send, and what they are told when they can't.
// The server enforces the same rules; these make sure nobody finds out at the
// payment step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutBlock } from '../lib/availability.ts';

const base = { open: true, paymentsEnabled: true, total: 12.5, name: 'Sam' };

test('an open truck with payments on takes a named order', () => {
  assert.equal(checkoutBlock(base).blocked, false);
});

test('a closed truck takes nothing, not even the free drink', () => {
  const b = checkoutBlock({ ...base, open: false, total: 0 });
  assert.equal(b.blocked, true);
  assert.equal(b.reason, 'closed');
});

test('before the owner\'s Square is connected, paid carts are told to pay at the window', () => {
  const b = checkoutBlock({ ...base, paymentsEnabled: false });
  assert.equal(b.blocked, true);
  assert.equal(b.reason, 'payments_off');
  assert.match(b.message, /window/);
});

test('the free drink still works before card payments are switched on', () => {
  // Launch can happen before Square is connected; the sticker's offer must not depend on it.
  assert.equal(checkoutBlock({ ...base, paymentsEnabled: false, total: 0 }).blocked, false);
});

test('an order needs a name, because pickup is by name', () => {
  const b = checkoutBlock({ ...base, name: '   ' });
  assert.equal(b.blocked, true);
  assert.equal(b.reason, 'no_name');
});

test('closed is reported before anything else', () => {
  // No point asking for a name for a truck that is shut.
  assert.equal(checkoutBlock({ open: false, paymentsEnabled: false, total: 5, name: '' }).reason, 'closed');
});

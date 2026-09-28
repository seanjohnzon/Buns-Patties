// If these are wrong, a staff member can never be added — the owner types the
// number one way and the database stored it another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneDigits, phoneE164, formatPhone, samePhone } from '../lib/phone.ts';

test('every way a Houston number gets typed lands on the same digits', () => {
  const want = '17135554402';
  for (const typed of [
    '+1 713 555 4402', '+17135554402', '17135554402',
    '713 555 4402', '7135554402', '(713) 555-4402', '713-555-4402', '+1 (713) 555 4402',
  ]) {
    assert.equal(phoneDigits(typed), want, `failed for "${typed}"`);
  }
});

test('the owner typing it with spaces finds the row Supabase created', () => {
  // profiles.phone is written by the signup trigger as bare digits.
  const stored = '17135554402';
  assert.ok(samePhone('+1 713 555 4402', stored));
  assert.ok(samePhone('(713) 555-4402', stored));
});

test('sign-in gets the plus that Supabase Auth requires', () => {
  assert.equal(phoneE164('713 555 4402'), '+17135554402');
  assert.equal(phoneE164('+1 713 555 4402'), '+17135554402');
});

test('nonsense is rejected rather than half-matched', () => {
  for (const bad of ['', '   ', 'abc', '555', '12345', '1234567890123456789']) {
    assert.equal(phoneDigits(bad), null, `"${bad}" should not be a number`);
    assert.equal(phoneE164(bad), null);
  }
});

test('two different people never compare equal', () => {
  assert.equal(samePhone('+1 713 555 4402', '+1 713 555 8890'), false);
  assert.equal(samePhone(null, null), false, 'missing numbers are not a match');
  assert.equal(samePhone('', '17135554402'), false);
});

test('numbers are shown back in a readable form', () => {
  assert.equal(formatPhone('17135554402'), '+1 713 555 4402');
  assert.equal(formatPhone(null), '');
});

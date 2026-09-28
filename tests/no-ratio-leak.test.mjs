// The conversion rate is ours to tune. The moment it appears on a customer
// screen it becomes a promise, and changing it later looks like a downgrade.
// This walks the actual customer-facing screens and fails if it leaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const CUSTOMER_SCREENS = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/rewards.tsx',
  'app/(tabs)/menu.tsx',
  'app/(tabs)/orders.tsx',
  'app/cart.tsx',
  'app/qr.tsx',
  'app/order/[id].tsx',
  'components/PointsCard.tsx',
  'app/auth.tsx',
  'app/(tabs)/account.tsx',
  'app/feedback.tsx',
  'app/item/[id].tsx',
];

// Pull out the strings a customer could actually read. This is a rough parse,
// not a compiler, so anything that still looks like code is discarded rather
// than reported — a false alarm here would train people to ignore the test.
const LOOKS_LIKE_CODE = /[;{}]|=>|\(\)|\breturn\b|\bconst\b|import |=== /;

function visibleText(src) {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const candidates = [];
  // JSX text nodes
  for (const m of withoutComments.matchAll(/>([^<>]{3,})</g)) candidates.push(m[1].replace(/\{[^{}]*\}/g, ' '));
  // copy passed as a prop
  for (const m of withoutComments.matchAll(/(?:title|placeholder|label|blurb)=\{?["'`]([^"'`]+)["'`]/g)) candidates.push(m[1]);
  // template literals, with ${...} stripped — those hold identifiers, not prose
  for (const m of withoutComments.matchAll(/`([^`]*)`/g)) candidates.push(m[1].replace(/\$\{[^}]*\}/g, ' '));

  return candidates
    .filter((c) => !LOOKS_LIKE_CODE.test(c))
    .filter((c) => /[a-zA-Z]{3,}/.test(c))
    .join(' ')
    .toLowerCase();
}

test('no customer screen mentions points, a rate, or a percentage', () => {
  const banned = [' pts', 'points', 'per $1', 'per dollar', '% back', 'redeem rate', 'just for joining'];
  for (const file of CUSTOMER_SCREENS) {
    const text = visibleText(readFileSync(file, 'utf8'));
    for (const word of banned) {
      assert.ok(!text.includes(word),
        `${file} shows "${word}" to a customer — progress must be expressed in money`);
    }
  }
});

test('nothing tells a customer to show or scan a code', () => {
  // Pickup is by name now. A QR to show at the window is the thing we removed.
  const banned = ['show this', 'scan this', 'show your code', 'qr at the window'];
  for (const file of CUSTOMER_SCREENS) {
    const text = visibleText(readFileSync(file, 'utf8'));
    for (const word of banned) {
      assert.ok(!text.includes(word), `${file} still asks the customer to show a code`);
    }
  }
});

test('the staff scanner is gone', () => {
  const staff = readdirSync('app/staff');
  assert.ok(!staff.includes('scan.tsx'), 'staff scan screen should have been removed');
});

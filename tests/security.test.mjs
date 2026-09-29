// Rules that stop one person taking what belongs to another. They live in the
// database and the server; these check they are still there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('supabase/schema.sql', 'utf8');
const build = readFileSync('supabase/functions/_shared/build-order.ts', 'utf8');

test('nobody can make themselves owner (or staff) by editing their own profile', () => {
  const fn = schema.slice(schema.indexOf('create or replace function protect_profile_columns()'));
  assert.ok(fn.length > 0, 'protect_profile_columns() is missing');
  assert.match(fn, /new\.role is distinct from old\.role and \(not is_owner\(\) or new\.id = auth\.uid\(\)\)/);
  assert.match(schema, /create trigger protect_profile_columns before update on profiles/);
});

test('the staff "paid, not on the board" list only shows orders Square says are paid', () => {
  const fn = schema.slice(schema.indexOf('create or replace function stuck_orders()'), schema.indexOf('-- ---------- campaigns'));
  assert.match(fn, /o\.square_paid_at is not null/);
  const api = readFileSync('lib/api.ts', 'utf8');
  assert.match(api, /\.eq\('status', 'pending_payment'\)\.not\('square_paid_at', 'is', null\)/, 'releasing by hand needs a Square-confirmed payment');
});

test('what the kitchen and the owner\'s Square read is the menu\'s name, not the phone\'s', () => {
  assert.match(build, /\.select\('id, name, price, modifier_groups, available, sold_out_until'\)/);
  assert.match(build, /name: \(String\(it\.name \?\? it\.id\)/);
  assert.doesNotMatch(build, /String\(l\.name/);
});

test('a free-drink claim is spent by one order only', () => {
  assert.match(build, /\.is\('used_at', null\)\s*\.select\('campaign_id'\)/);
  assert.match(build, /that offer has already been used/);
});

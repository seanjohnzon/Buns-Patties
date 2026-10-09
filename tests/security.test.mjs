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

test('a new sign-up can always be given its profile row', () => {
  // Sign-in runs as Supabase's auth role, which does not look in the public
  // schema. Without its own search path this function cannot find "profiles",
  // and every sign-up fails.
  assert.match(schema, /create or replace function handle_new_user\(\) returns trigger language plpgsql security definer set search_path = public as/);
});

test('only the cron job can run the payment sweep, and nobody ever handles its secret', () => {
  const sweep = readFileSync('supabase/functions/reconcile-orders/index.ts', 'utf8');
  const cron = readFileSync('supabase/cron.sql', 'utf8');
  // No secret sent: refused before anything else is looked at.
  assert.match(sweep, /if \(!sent\) return false;/);
  assert.match(sweep, /if \(!\(await allowed\(sb, req\.headers\.get\('x-reconcile-secret'\)\)\)\) \{\s*return new Response\('no', \{ status: 401 \}\);/);
  assert.match(sweep, /sb\.rpc\('reconcile_secret_ok', \{ p_secret: sent \}\)/);
  // The database answers yes or no; it never hands the secret out, and only the server may ask.
  const fn = schema.slice(schema.indexOf('create or replace function reconcile_secret_ok('), schema.indexOf('-- ---------- campaigns'));
  assert.match(fn, /returns boolean/);
  assert.match(fn, /security definer set search_path = ''/);
  assert.match(fn, /revoke execute on function reconcile_secret_ok\(text\) from public, anon, authenticated;/);
  assert.match(fn, /grant execute on function reconcile_secret_ok\(text\) to service_role;/);
  // The secret is made in the database, not typed into the file.
  assert.match(cron, /vault\.create_secret\(encode\(extensions\.gen_random_bytes\(32\), 'hex'\), 'reconcile_secret'/);
  assert.doesNotMatch(cron, /<RECONCILE_SECRET>/);
  assert.doesNotMatch(cron, /'x-reconcile-secret', '[^']/, 'no secret written out in the cron job');
});

test('checkout only sends customers back to a real address', () => {
  const checkout = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
  // Half an address ("/order/…" with no site in front) makes Square refuse the payment.
  assert.match(checkout, /\.\.\.\(site \? \{ redirect_url: `\$\{site\}\/order\/\$\{built\.orderId\}\?paid=1` \} : \{\}\)/);
});

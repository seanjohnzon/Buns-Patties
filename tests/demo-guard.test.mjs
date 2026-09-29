// Demo mode signs whoever opens the app in as the owner. That is fine on a
// developer's machine and a disaster on a live website, so it must be gated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the demo owner profile is only handed out when demo is allowed', () => {
  const api = readFileSync('lib/api.ts', 'utf8');
  assert.match(api, /export const DEMO_ALLOWED = __DEV__ \|\| process\.env\.EXPO_PUBLIC_ENV === 'sandbox' \|\| Constants\.expoConfig\?\.extra\?\.testMode === true;/);
  // The guard must sit before the demo profile is built.
  const guard = api.indexOf('if (!DEMO_ALLOWED) return null;');
  const demoOwner = api.indexOf("role: (process.env.EXPO_PUBLIC_DEMO_ROLE ?? 'owner')");
  assert.ok(guard > 0, 'getProfile has no demo guard');
  assert.ok(demoOwner > guard, 'demo owner profile is reachable before the guard');
});

test('the demo cart route refuses to run outside development', () => {
  const demo = readFileSync('app/demo.tsx', 'utf8');
  assert.match(demo, /if \(!DEMO_ALLOWED\) \{ router\.replace/);
});

test('pretend orders and the test controls cannot run against a real database', () => {
  const api = readFileSync('lib/api.ts', 'utf8');
  const place = api.slice(api.indexOf('export async function demoPlaceOrder'));
  assert.match(place.slice(0, 400), /if \(!DEMO_ALLOWED \|\| hasSupabase\) throw/, 'demoPlaceOrder must refuse outside demo');
  const set = api.slice(api.indexOf('export function demoSet'));
  assert.match(set.slice(0, 200), /if \(!DEMO_ALLOWED \|\| hasSupabase\) return/, 'demoSet must refuse outside demo');
  const controls = readFileSync('components/DemoControls.tsx', 'utf8');
  assert.match(controls, /if \(!DEMO_ALLOWED \|\| hasSupabase\) return null/, 'test controls must not render outside demo');
  const cart = readFileSync('app/cart.tsx', 'utf8');
  const i = cart.indexOf('demoPlaceOrder(');
  assert.ok(i > cart.indexOf('if (!hasSupabase) {') && cart.indexOf('if (!DEMO_ALLOWED) return;') < i, 'the cart only places a pretend order in a demo build');
});

test('the live website and the store app are never built in test mode', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['build:web'], /^APP_VARIANT=production /, 'build:web must build the production variant');
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.uat.env.APP_VARIANT, 'production', 'the store build must be the production variant');
  const { default: make } = await import('../app.config.js');
  const base = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const prev = process.env.APP_VARIANT;
  process.env.APP_VARIANT = 'production';
  const prod = make({ config: base });
  delete process.env.APP_VARIANT;
  const test = make({ config: base });
  if (prev !== undefined) process.env.APP_VARIANT = prev;
  assert.equal(prod.extra.testMode, false);
  assert.equal(prod.ios.bundleIdentifier, 'com.bunsandpatties.app');
  assert.equal(test.extra.testMode, true);
  assert.equal(test.ios.bundleIdentifier, 'com.bunsandpatties.app.preview');
});

test('the TestFlight test app can never point at a live database', () => {
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_SUPABASE_URL, '', 'preview must blank the database URL');
  assert.equal(eas.build.preview.environment, 'preview');
  assert.equal(eas.build.uat.environment, 'production');
});

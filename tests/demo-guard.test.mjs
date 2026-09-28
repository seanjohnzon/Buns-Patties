// Demo mode signs whoever opens the app in as the owner. That is fine on a
// developer's machine and a disaster on a live website, so it must be gated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the demo owner profile is only handed out when demo is allowed', () => {
  const api = readFileSync('lib/api.ts', 'utf8');
  assert.match(api, /export const DEMO_ALLOWED = __DEV__ \|\| process\.env\.EXPO_PUBLIC_ENV === 'sandbox'/);
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

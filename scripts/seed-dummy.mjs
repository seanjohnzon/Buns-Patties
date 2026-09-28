#!/usr/bin/env node
// Fill a SANDBOX or SIT database with believable dummy data so the owner
// dashboard, the kitchen board and the rewards screens have something to show.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-dummy.mjs
//
// Refuses to run against anything that looks like the live project. It creates
// real auth users (with fake numbers in the +1 555 01xx reserved-for-fiction
// range), which fires the signup trigger, so profiles come out right.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAYS = Number(process.env.SEED_DAYS ?? 14);
const CUSTOMERS = Number(process.env.SEED_CUSTOMERS ?? 25);

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}
if (process.env.SEED_I_MEAN_IT !== 'yes' && /prod|live/i.test(url)) {
  console.error('That URL looks like production. Re-run with SEED_I_MEAN_IT=yes if you really mean it.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const menu = JSON.parse(readFileSync(new URL('../data/menu.seed.json', import.meta.url)));
const groups = menu.modifierGroups;
const items = menu.items;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Busier at lunch and dinner, quiet in between — so "takings today" looks real.
function orderTimeOn(day) {
  const d = new Date(day);
  const lunch = Math.random() < 0.45;
  d.setHours(lunch ? between(11, 14) : between(17, 21), between(0, 59), 0, 0);
  return d;
}

function buildLine() {
  const item = pick(items.filter((i) => i.available));
  const chosen = [];
  for (const gid of item.modifierGroups) {
    const g = groups[gid];
    if (!g) continue;
    if (g.required) chosen.push(pick(g.options));
    else if (Math.random() < 0.35) chosen.push(pick(g.options));
  }
  const unit = item.price + chosen.reduce((s, o) => s + o.priceDelta, 0);
  const qty = Math.random() < 0.8 ? 1 : 2;
  return { menu_item_id: item.id, name: item.name, qty, unit_price: unit, mods: chosen.map((o) => o.name) };
}

async function main() {
  console.log(`Seeding ${CUSTOMERS} customers and ~${DAYS} days of orders into ${url}`);

  // 1. customers
  const userIds = [];
  for (let i = 0; i < CUSTOMERS; i++) {
    const phone = `1555010${String(i).padStart(4, '0')}`;   // fiction-reserved range
    const { data, error } = await db.auth.admin.createUser({ phone, phone_confirm: true });
    if (error) {
      if (!/already/i.test(error.message)) { console.error('createUser:', error.message); continue; }
      const { data: existing } = await db.from('profiles').select('id').eq('phone', phone).maybeSingle();
      if (existing) userIds.push(existing.id);
      continue;
    }
    userIds.push(data.user.id);
  }
  console.log(`  ${userIds.length} customers ready`);
  if (!userIds.length) { console.error('No customers — cannot make orders.'); process.exit(1); }

  // 2. orders across the period, all already paid and collected
  let made = 0;
  for (let d = DAYS; d >= 0; d--) {
    const day = new Date(); day.setDate(day.getDate() - d);
    const count = d === 0 ? between(6, 14) : between(8, 22);   // today is partway through
    for (let n = 0; n < count; n++) {
      const lines = Array.from({ length: between(1, 3) }, buildLine);
      const subtotal = +lines.reduce((s, l) => s + l.unit_price * l.qty, 0).toFixed(2);
      // Now and then a free drink went out with it: worth $2, not taken off the total.
      const discount = Math.random() < 0.12 ? 2 : 0;
      const tip = Math.random() < 0.5 ? +(subtotal * pick([0.1, 0.15, 0.2])).toFixed(2) : 0;
      const total = +(subtotal + tip).toFixed(2);
      const at = orderTimeOn(day).toISOString();

      const { data: order, error } = await db.from('orders').insert({
        user_id: pick(userIds),
        status: d === 0 && n >= count - 2 ? 'preparing' : 'completed',  // a couple live on the board
        subtotal, tax: 0, tip, discount, total,
        stamps_earned: subtotal >= 15 ? 1 : 0,
        created_at: at, updated_at: at,
      }).select().single();
      if (error) { console.error('order:', error.message); continue; }

      await db.from('order_lines').insert(lines.map((l) => ({ ...l, order_id: order.id })));
      made++;
    }
  }
  console.log(`  ${made} orders`);

  // 3. a little feedback, weighted the way real feedback arrives
  const notes = [
    [5, 'Ordering ahead is great, no queue at lunch.'],
    [5, null],
    [4, 'Good burger. Wish I could save a favourite.'],
    [2, 'Said ready before it was, waited another ten minutes.'],
    [3, 'Took me a while to find how to remove pickles.'],
  ];
  for (const [rating, message] of notes) {
    await db.from('feedback').insert({
      user_id: pick(userIds), rating, message, build: 'seed', env: process.env.SEED_ENV ?? 'sit',
    });
  }
  console.log(`  ${notes.length} pieces of feedback`);
  console.log('Done. Open the owner dashboard.');
}

main().catch((e) => { console.error(e); process.exit(1); });

// Everything that talks to Square, in one place. Pure helpers at the top (no
// Deno, no network) so tests/square.test.mjs can prove them; the network calls
// below only run inside the edge functions.
//
// How the money moves: the app never charges a card itself. The server builds
// the order (prices, rewards, tax — _shared/build-order.ts), sends it to Square
// as an itemised order on a Square-hosted payment page, and sends the customer
// there. Square takes the card (and Apple Pay / Google Pay), the money lands in
// the owner's Square account, and Square tells us by webhook. So the owner sees
// every app order, item by item, in his own Square dashboard.

export const SQUARE_VERSION = '2026-09-16';
export const TAX_PERCENT = '8.25';          // Houston. Must match TAX_RATE in build-order.ts
export const ORDER_SOURCE = 'Buns & Patties app';

/** What the Allow button asks the owner for. Nothing touches his bank or payouts. */
export const SQUARE_SCOPES = ['MERCHANT_PROFILE_READ', 'ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ', 'PAYMENTS_WRITE'];

export function squareBase(env: string | undefined) {
  return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

/** Dollars to the integer cents Square wants. */
export const cents = (dollars: number) => Math.round((dollars + Number.EPSILON) * 100);

export type SquareLine = { name: string; qty: number; unitPrice: number; mods: string[]; note: string | null; free: boolean };
export type ForSquare = {
  orderId: string;
  lines: SquareLine[];
  tip: number;
  pickupName: string | null;
  pickupAt: string | null;
};

/** "Ketchup ×2, BBQ" — the same summary the kitchen board shows. */
export function modSummary(mods: string[]) {
  const counts = new Map<string, number>();
  for (const m of mods) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

/**
 * The order as Square should see it: every line with its price, free lines at
 * $0 marked "on us", Houston tax added by Square, the tip as a non-taxable
 * charge, and a pickup under the customer's name so it shows in the owner's
 * Square order list like any other pickup order.
 */
export function squareOrder(o: ForSquare, locationId: string) {
  const usd = (d: number) => ({ amount: cents(d), currency: 'USD' });
  return {
    location_id: locationId,
    reference_id: o.orderId,                 // our id; how a Square order finds its way back
    source: { name: ORDER_SOURCE },
    line_items: o.lines.map((l) => ({
      name: l.name.slice(0, 500),
      quantity: String(l.qty),
      base_price_money: usd(l.unitPrice),
      note: [l.free ? 'On us' : '', modSummary(l.mods), l.note ? `“${l.note}”` : ''].filter(Boolean).join(' · ').slice(0, 2000) || undefined,
    })),
    taxes: [{ uid: 'houston-sales-tax', name: 'Sales tax', percentage: TAX_PERCENT, type: 'ADDITIVE', scope: 'ORDER' }],
    service_charges: o.tip > 0
      ? [{ uid: 'tip', name: 'Tip', amount_money: usd(o.tip), calculation_phase: 'TOTAL_PHASE', taxable: false }]
      : undefined,
    fulfillments: [{
      type: 'PICKUP',
      state: 'PROPOSED',
      pickup_details: o.pickupAt
        ? { recipient: { display_name: o.pickupName ?? 'Pickup' }, schedule_type: 'SCHEDULED', pickup_at: o.pickupAt }
        : { recipient: { display_name: o.pickupName ?? 'Pickup' }, schedule_type: 'ASAP', prep_time_duration: 'PT15M' },
    }],
  };
}

/**
 * Square works the tax out itself, spread across the lines, so its total can
 * land a cent away from ours. Up to two cents is rounding and Square's figure
 * wins (it is what the card is charged); more than that means the two sides
 * disagree about the order, and it must not go through.
 */
export function acceptSquareTotal(oursDollars: number, squareCents: number) {
  return Math.abs(cents(oursDollars) - squareCents) <= 2;
}

/**
 * Which of a Square account's locations app orders go to: the first active
 * one. Most trucks have exactly one. Nothing in, nothing out.
 */
export function mainLocation<T extends { status?: string }>(locations: T[] | null | undefined): T | null {
  const all = locations ?? [];
  return all.find((x) => x.status === 'ACTIVE') ?? all[0] ?? null;
}

/** A US number as Square wants it: +1XXXXXXXXXX, or nothing. */
export function e164(digits: string | null | undefined) {
  const d = (digits ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  return undefined;
}

/** Has this Square order been paid for in full? */
export function orderIsPaid(order: {
  tenders?: unknown[]; net_amount_due_money?: { amount?: number };
  refunds?: unknown[]; net_amounts?: { total_money?: { amount?: number } };
} | null | undefined) {
  if (!order) return false;
  // Refunded back to nothing: not a paid order, whatever the tenders say.
  if ((order.refunds?.length ?? 0) > 0 && order.net_amounts?.total_money?.amount === 0) return false;
  const due = order.net_amount_due_money?.amount;
  return (order.tenders?.length ?? 0) > 0 && (due === undefined || due === 0);
}

/** Has this payment been refunded in full (across however many refunds)? */
export function fullyRefunded(payment: { total_money?: { amount?: number }; amount_money?: { amount?: number }; refunded_money?: { amount?: number } } | null | undefined) {
  if (!payment) return false;
  const total = payment.total_money?.amount ?? payment.amount_money?.amount ?? 0;
  return total > 0 && (payment.refunded_money?.amount ?? 0) >= total;
}

/**
 * Square signs each webhook: base64 HMAC-SHA256, keyed with the subscription's
 * signature key, over the notification URL followed by the raw body. Compared
 * in constant time.
 */
export async function verifySquareSignature(rawBody: string, header: string | null, signatureKey: string, notificationUrl: string) {
  if (!header || !signatureKey) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(signatureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(notificationUrl + rawBody)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Network — edge functions only.

export class SquareError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function squareFetch(base: string, token: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const first = data?.errors?.[0];
    throw new SquareError(first?.detail ?? first?.code ?? `Square ${res.status}`, res.status, data?.errors);
  }
  return data;
}

export type SquareAuth = { base: string; token: string; locationId: string };

// The location found for a fixed token, kept while this function stays warm.
let found: { token: string; locationId: string } | null = null;

/**
 * The token and location to charge into. Sandbox runs on one fixed developer
 * token (SQUARE_ACCESS_TOKEN): its location is looked up, or can be pinned with
 * SQUARE_LOCATION_ID. Live uses what the owner's Allow button stored, refreshed
 * a week before it expires (Square tokens last 30 days).
 */
// deno-lint-ignore no-explicit-any
export async function squareAuth(sb: any): Promise<SquareAuth | null> {
  // @ts-ignore Deno global in edge functions
  const env = (k: string) => Deno.env.get(k) ?? '';
  const base = squareBase(env('SQUARE_ENV'));
  const fixed = env('SQUARE_ACCESS_TOKEN');
  if (fixed) {
    if (env('SQUARE_LOCATION_ID')) return { base, token: fixed, locationId: env('SQUARE_LOCATION_ID') };
    if (found?.token !== fixed) {
      try {
        const id = mainLocation<{ id?: string; status?: string }>((await squareFetch(base, fixed, '/v2/locations')).locations)?.id;
        found = id ? { token: fixed, locationId: id } : null;
      } catch { found = null; }   // a bad token reads as "not connected", never as a crash
    }
    return found ? { base, token: fixed, locationId: found.locationId } : null;
  }
  const { data: c } = await sb.from('square_connection').select('*').eq('id', 1).maybeSingle();
  if (!c?.access_token || !c?.location_id) return null;

  const expires = c.expires_at ? new Date(c.expires_at).getTime() : Infinity;
  if (expires - Date.now() < 7 * 864e5 && c.refresh_token) {
    const t = await fetch(base + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
      body: JSON.stringify({
        client_id: env('SQUARE_APPLICATION_ID'), client_secret: env('SQUARE_APPLICATION_SECRET'),
        grant_type: 'refresh_token', refresh_token: c.refresh_token,
      }),
    }).then((r) => r.json());
    if (t?.access_token) {
      await sb.from('square_connection').update({
        access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token, expires_at: t.expires_at,
      }).eq('id', 1);
      return { base, token: t.access_token, locationId: c.location_id };
    }
  }
  return { base, token: c.access_token, locationId: c.location_id };
}

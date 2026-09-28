// Data layer. Runs off the local seed until Supabase env vars are set,
// then reads/writes the real tables. Screens never talk to Supabase directly.
import Constants from 'expo-constants';
import seed from '@/data/menu.seed.json';
import { supabase, hasSupabase } from './supabase';

/** Demo data is for development only. See getProfile. */
export const DEMO_ALLOWED = __DEV__ || process.env.EXPO_PUBLIC_ENV === 'sandbox';
import type { Category, MenuItem, ModifierGroup, Order, Profile, Role, Testimonial, TruckStatus } from './types';
export { isOrderable, isSoldOut } from './availability';
import { soldOutToday } from './availability';
import { phoneDigits } from './phone';
import type { Campaign, CampaignAction, CampaignClaim, StampTier } from './campaigns';
import type { LoyaltyRaw, MixRow, TodayRaw } from './reporting';

const groups = seed.modifierGroups as Record<string, ModifierGroup>;

function hydrate(items: typeof seed.items): MenuItem[] {
  return items.map((i) => ({
    ...i,
    featured: !!i.featured,
    modifierGroups: (i.modifierGroups as string[]).map((g) => groups[g]).filter(Boolean),
    includes: 'includes' in i ? (i.includes as string[]) : [],
    defaults: ('defaults' in i ? i.defaults : {}) as Record<string, string[]>,
  }));
}

export async function getTruckStatus(): Promise<TruckStatus> {
  if (hasSupabase) {
    const { data } = await supabase.from('truck_status').select('*').eq('id', 1).single();
    if (data) return {
      isOpen: data.is_open, paymentsEnabled: data.payments_enabled, halal: data.halal, instagram: data.instagram,
      locationName: data.location_name, address: data.address, lat: data.lat, lng: data.lng,
      hoursText: data.hours_text, prepMinutes: data.prep_minutes,
      story: data.story ?? '', phone: data.contact_phone ?? '', email: data.contact_email ?? '',
      tiktok: data.tiktok ?? '', facebook: data.facebook ?? '',
      doordash: data.doordash_url ?? '', ubereats: data.ubereats_url ?? '', grubhub: data.grubhub_url ?? '',
      testimonials: Array.isArray(data.testimonials) ? data.testimonials : [],
    };
  }
  return demoStatus ?? { ...(seed.truck as TruckStatus), testimonials: DEMO_TESTIMONIALS };
}

// Shown only in demo builds, and labelled SAMPLE on screen, so nobody mistakes
// them for real reviews. The real ones are the owner's picks from his Google page.
const DEMO_TESTIMONIALS: Testimonial[] = [
  { name: 'Sample', quote: 'The owner’s favourite Google reviews go here. Pick them in Owner → The truck page.', stars: 5, sample: true },
  { name: 'Sample', quote: 'Three to five short ones read best.', stars: 5, sample: true },
];

// Demo mode keeps staff edits in memory so the flow can be shown without a backend.
let demoStatus: TruckStatus | null = null;

export async function setTruckStatus(s: TruckStatus): Promise<void> {
  if (!hasSupabase) { demoStatus = s; return; }
  const { error } = await supabase.from('truck_status').update({
    is_open: s.isOpen, location_name: s.locationName, address: s.address,
    hours_text: s.hoursText, prep_minutes: s.prepMinutes,
  }).eq('id', 1);
  if (error) throw error;
}

/** The owner's "truck page": story, contact, socials, delivery links, reviews. */
export async function setTruckPage(s: TruckStatus): Promise<void> {
  if (!hasSupabase) { demoStatus = s; return; }
  const { error } = await supabase.from('truck_status').update({
    story: s.story || null, contact_phone: s.phone || null, contact_email: s.email || null,
    instagram: s.instagram || null, tiktok: s.tiktok || null, facebook: s.facebook || null,
    doordash_url: s.doordash || null, ubereats_url: s.ubereats || null, grubhub_url: s.grubhub || null,
    testimonials: (s.testimonials ?? []).filter((x) => !x.sample),
  }).eq('id', 1);
  if (error) throw error;
}

export async function getMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
  if (hasSupabase) {
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase.from('categories').select('*').order('sort'),
      supabase.from('menu_items').select('*').eq('available', true).order('sort'),
    ]);
    if (cats && items) {
      return {
        categories: cats,
        items: items.map((i: any) => ({
          id: i.id, categoryId: i.category_id, name: i.name, description: i.description ?? '',
          price: Number(i.price), imageUrl: i.image_url, featured: i.featured, available: i.available,
          soldOutUntil: i.sold_out_until ?? null,
          modifierGroups: i.modifier_groups ?? [],
          includes: i.includes ?? [], defaults: i.defaults ?? {},
        })),
      };
    }
  }
  const today = soldOutToday();
  return { categories: seed.categories, items: hydrate(seed.items).map((i) => (demoSoldOut.has(i.id) ? { ...i, soldOutUntil: today } : i)) };
}

export async function getItem(id: string): Promise<MenuItem | undefined> {
  const { items } = await getMenu();
  return items.find((i) => i.id === id);
}

function hydrateProfile(d: any): Profile {
  const role: Role = d.role ?? 'customer';
  return {
    id: d.id, name: d.name, phone: d.phone, birthday: d.birthday,
    role,
    isStaff: role === 'staff' || role === 'owner',
    isOwner: role === 'owner',
  };
}

export async function getProfile(): Promise<Profile | null> {
  if (!hasSupabase) {
    // Demo mode signs you in as the owner so every screen is reachable — but ONLY
    // in a development build. A deployed build with no database configured must
    // show a signed-out app, never hand every visitor the owner's screens.
    if (!DEMO_ALLOWED) return null;
    return hydrateProfile({ id: 'demo', name: 'Cihan', phone: null, role: (process.env.EXPO_PUBLIC_DEMO_ROLE ?? 'owner'), birthday: null });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ? hydrateProfile(data) : null;
}

let DEMO_ORDERS: Order[] = [
  {
    id: 'demo-live', userId: 'demo', status: 'preparing',
    subtotal: 24.5, tax: 0, tip: 3, discount: 0, total: 27.5, stampsEarned: 1,
    pickupAt: null, pickupName: 'Cihan', createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
    lines: [
      { name: 'The OG', qty: 1, price: 12.5, mods: ['Double patty', 'No cheese', 'Beef bacon', 'Ketchup', 'Mustard'], note: 'Well done please' },
      { name: 'Smash Fries', qty: 1, price: 8, mods: ['Single patty', 'American cheese', 'OG House'] },
      { name: 'Can Drink', qty: 1, price: 2, mods: ['Coke'] },
      { name: 'Can Drink (on us)', qty: 1, price: 0, mods: ['Sprite'], free: true },
    ],
  },
  {
    id: 'demo-done', userId: 'demo', status: 'completed',
    subtotal: 24, tax: 0, tip: 0, discount: 0, total: 24, stampsEarned: 1,
    pickupAt: null, pickupName: 'Cihan', createdAt: new Date(Date.now() - 8 * 864e5).toISOString(),
    lines: [{ name: 'BBQ Bacon', qty: 2, price: 12, mods: ['Double patty'] }],
  },
];

export async function getMyOrders(): Promise<Order[]> {
  if (!hasSupabase) return DEMO_ORDERS;
  const { data } = await supabase.from('orders').select('*, order_lines(*)').order('created_at', { ascending: false }).limit(30);
  return (data ?? []).map(mapOrder);
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!hasSupabase) return DEMO_ORDERS.find((o) => o.id === id) ?? DEMO_ORDERS[0];
  const { data } = await supabase.from('orders').select('*, order_lines(*)').eq('id', id).single();
  return data ? mapOrder(data) : null;
}

export function subscribeOrder(id: string, cb: (o: Order) => void) {
  if (!hasSupabase) return () => {};
  const ch = supabase.channel('order:' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, async () => {
      const o = await getOrder(id); if (o) cb(o);
    }).subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Web: builds the order and returns a Stripe-hosted page to send them to. */
export async function createCheckoutSession(input: OrderInput): Promise<{ orderId: string; checkoutUrl?: string; free?: boolean }> {
  if (!hasSupabase) throw new Error('Supabase not configured — see README');
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Creates the order row + asks the edge function for a Stripe PaymentIntent.
export type OrderInput = {
  lines: { menuItemId: string; name: string; qty: number; mods: string[]; note?: string; campaign?: string; tier?: number }[];
  tip: number;
  pickupAt: string | null;
  pickupName?: string;
};

export async function createOrder(input: OrderInput): Promise<{ orderId: string; paymentIntentClientSecret?: string; customerId?: string; ephemeralKey?: string; free?: boolean }> {
  if (!hasSupabase) throw new Error('Supabase not configured — set EXPO_PUBLIC_SUPABASE_URL / ANON_KEY');
  const { data, error } = await supabase.functions.invoke('create-payment-intent', { body: input });
  if (error) throw error;
  return data;
}


export async function staffListOrders(): Promise<Order[]> {
  // Oldest first, the order the kitchen cooks in — same as the real query below.
  if (!hasSupabase) return DEMO_ORDERS.filter((o) => o.status !== 'completed').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const { data } = await supabase.from('orders').select('*, order_lines(*)').in('status', ['received', 'preparing', 'ready']).order('created_at');
  return (data ?? []).map(mapOrder);
}

export async function staffSetStatus(id: string, status: Order['status']) {
  if (!hasSupabase) { DEMO_ORDERS = DEMO_ORDERS.map((o) => (o.id === id ? { ...o, status } : o)); return; }
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

function mapOrder(o: any): Order {
  return {
    id: o.id, userId: o.user_id, status: o.status, subtotal: +o.subtotal, tax: +o.tax, tip: +o.tip, discount: +o.discount,
    total: +o.total, stampsEarned: o.stamps_earned ?? 0, pickupAt: o.pickup_at, pickupName: o.pickup_name ?? null, createdAt: o.created_at,
    lines: (o.order_lines ?? []).map((l: any) => ({ name: l.name, qty: l.qty, price: +l.unit_price, mods: l.mods ?? [], note: l.note ?? null, free: !!l.campaign_id })),
  };
}

// ---------- owner reporting ----------
// The database aggregates and returns small JSON; the phone never downloads
// the order history. Demo mode returns plausible figures so the screens are
// reviewable before Supabase exists.

export async function getOwnerToday(): Promise<TodayRaw> {
  if (!hasSupabase) {
    return { netToday: 412.5, tipsToday: 38, ordersToday: 17, discountToday: 12, netLastWeek: 335, ordersLastWeek: 15 };
  }
  const { data, error } = await supabase.rpc('owner_today');
  if (error) throw error;
  return data as TodayRaw;
}

export async function getProductMix(days = 7): Promise<MixRow[]> {
  if (!hasSupabase) {
    // Ordered by quantity, exactly as owner_product_mix returns it.
    return [
      { menuItemId: 'og', name: 'The OG', qty: 64, revenue: 704 },
      { menuItemId: 'can_drink', name: 'Can Drink', qty: 52, revenue: 104 },
      { menuItemId: 'smash_fries', name: 'Smash Fries', qty: 41, revenue: 369 },
      { menuItemId: 'bbq_bacon', name: 'BBQ Bacon', qty: 33, revenue: 396 },
      { menuItemId: 'wings', name: 'Wings', qty: 28, revenue: 322 },
      { menuItemId: 'lone_star_heat', name: 'Lone Star Heat', qty: 19, revenue: 209 },
      { menuItemId: 'seasoned_fries', name: 'Seasoned Fries', qty: 16, revenue: 80 },
    ];
  }
  const { data, error } = await supabase.rpc('owner_product_mix', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ menuItemId: r.menu_item_id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export async function getOwnerLoyalty(): Promise<LoyaltyRaw> {
  if (!hasSupabase) {
    return { members: 214, newThisWeek: 23, givenThisWeek: 31, givenValueThisWeek: 96 };
  }
  const { data, error } = await supabase.rpc('owner_loyalty');
  if (error) throw error;
  return data as LoyaltyRaw;
}

// ---------- owner: people ----------

export async function listTeam(): Promise<Profile[]> {
  if (!hasSupabase) {
    return [
      hydrateProfile({ id: 'demo', name: 'Cihan', phone: '+1 713 555 4402', role: 'owner' }),
      hydrateProfile({ id: 'u2', name: 'Samil', phone: '+1 713 555 8890', role: 'staff' }),
    ];
  }
  const { data, error } = await supabase.from('profiles').select('*').in('role', ['staff', 'owner']).order('role');
  if (error) throw error;
  return (data ?? []).map(hydrateProfile);
}

/** Owner-only. The database refuses this for anyone else, and refuses self-demotion. */
export async function setRole(userId: string, role: Role): Promise<void> {
  if (!hasSupabase) return;
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

export async function findByPhone(phone: string): Promise<Profile | null> {
  if (!hasSupabase) return null;
  // profiles.phone was written by the signup trigger as bare E.164 digits.
  // Match on those, not on however the owner typed it.
  const digits = phoneDigits(phone);
  if (!digits) return null;
  const { data } = await supabase.from('profiles').select('*').eq('phone', digits).maybeSingle();
  return data ? hydrateProfile(data) : null;
}

// ---------- staff: sold out ----------

// Demo builds remember sold-out switches on the phone, like the truck status.
const demoSoldOut = new Set<string>();

export async function setSoldOut(menuItemId: string, soldOut: boolean): Promise<void> {
  if (!hasSupabase) { if (soldOut) demoSoldOut.add(menuItemId); else demoSoldOut.delete(menuItemId); return; }
  const { error } = await supabase.from('menu_items')
    .update({ sold_out_until: soldOut ? soldOutToday() : null })
    .eq('id', menuItemId);
  if (error) throw error;
}

// ---------- feedback ----------

export type FeedbackRow = {
  id: string; rating: number | null; message: string | null;
  build: string | null; handled: boolean; createdAt: string;
};

export async function sendFeedback(input: { rating: number | null; message: string; orderId?: string | null }) {
  if (!hasSupabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first so we can follow up with you.');
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    order_id: input.orderId ?? null,
    rating: input.rating,
    message: input.message.trim() || null,
    build: Constants.expoConfig?.version ?? null,
    env: process.env.EXPO_PUBLIC_ENV ?? 'sandbox',
  });
  if (error) throw error;
}

export async function getOwnerFeedback(days = 30): Promise<FeedbackRow[]> {
  if (!hasSupabase) {
    return [
      { id: '1', rating: 2, message: 'Waited 25 min for a 15 min pickup. App said ready before it was.', build: '1.0.0', handled: false, createdAt: new Date(Date.now() - 36e5).toISOString() },
      { id: '2', rating: 5, message: 'Ordering ahead is great, no queue at lunch.', build: '1.0.0', handled: false, createdAt: new Date(Date.now() - 9e6).toISOString() },
      { id: '3', rating: 3, message: 'Could not find how to remove pickles.', build: '1.0.0', handled: true, createdAt: new Date(Date.now() - 18e6).toISOString() },
      { id: '4', rating: 5, message: null, build: '1.0.0', handled: true, createdAt: new Date(Date.now() - 26e6).toISOString() },
    ];
  }
  const { data, error } = await supabase.rpc('owner_feedback', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, rating: r.rating, message: r.message, build: r.build, handled: r.handled, createdAt: r.created_at,
  }));
}

export async function markFeedbackHandled(id: string, handled: boolean) {
  if (!hasSupabase) return;
  const { error } = await supabase.from('feedback').update({ handled }).eq('id', id);
  if (error) throw error;
}

// ---------- payment safety net ----------

export type StuckOrder = { id: string; createdAt: string; total: number; paymentIntent: string | null };

/**
 * Orders that took money but never reached the kitchen. Should always be empty —
 * the webhook plus the five-minute reconciliation sweep normally fix these before
 * anyone notices. Shown to staff so a human catches whatever automation missed.
 */
export async function getStuckOrders(): Promise<StuckOrder[]> {
  if (!hasSupabase) return [];
  const { data, error } = await supabase.rpc('stuck_orders');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, createdAt: r.created_at, total: Number(r.total), paymentIntent: r.stripe_payment_intent,
  }));
}

/** Staff pulling a stuck order onto the board by hand, once they can see the payment went through. */
export async function releaseStuckOrder(orderId: string) {
  if (!hasSupabase) return;
  const { error } = await supabase.from('orders').update({ status: 'received' }).eq('id', orderId).eq('status', 'pending_payment');
  if (error) throw error;
}



/** The name the order is called out under. */
export async function saveName(name: string) {
  if (!hasSupabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id);
}


// ---------- campaigns ----------

let demoClaims: CampaignClaim[] = [];
let demoStamps: Record<string, number> = { stamp_card: 6 };

/** The two campaigns the app ships with. Mirrors the inserts in supabase/schema.sql. */
export const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: 'welcome_drink', kind: 'action', title: 'Free drink', blurb: 'Follow us and your first drink is on us', finePrint: null,
    actions: [{ id: 'follow_instagram', label: 'Follow us on Instagram', url: 'https://www.instagram.com/buns.patties' }],
    rewardItemIds: ['can_drink'], cover: {}, minOrder: null, tiers: [],
    maxClaims: 1000, claimsCount: 138, endsAt: null, active: true,
  },
  {
    id: 'stamp_card', kind: 'stamps', title: 'Stamp card', blurb: 'Every order is a stamp',
    finePrint: 'Orders of $15 or more before tax earn a stamp. One stamp per order. Taking a reward uses its stamps.',
    actions: [], rewardItemIds: [], cover: {}, minOrder: 15,
    tiers: [
      { stamps: 5, label: 'Free fries', itemIds: ['seasoned_fries'], cover: {} },
      { stamps: 10, label: 'Free burger', itemIds: ['og', 'wake_n_smash', 'lone_star_heat', 'bbq_bacon'], cover: { patty: 2 } },
    ],
    maxClaims: null, claimsCount: 0, endsAt: null, active: true,
  },
];
let demoCampaigns = DEFAULT_CAMPAIGNS;

// ---------- demo builds: the whole flow, with no backend ----------
// So the owner can walk every step in Expo Go before a database exists. These
// mirror what the server does (supabase/functions/_shared/build-order.ts and the
// on_order_paid trigger): stamps are spent for a stamp reward, a one-off offer is
// marked used, and an order of the card's minimum or more earns a stamp.

export type DemoLine = { name: string; qty: number; price: number; mods: string[]; note?: string; claim?: { campaign: string; tier?: number } };

export async function demoPlaceOrder(input: { lines: DemoLine[]; subtotal: number; tax: number; tip: number; total: number; saved: number; pickupName: string; pickupAt: string | null }): Promise<string> {
  if (!DEMO_ALLOWED || hasSupabase) throw new Error('demo only');
  for (const l of input.lines) {
    if (!l.claim) continue;
    const c = demoCampaigns.find((x) => x.id === l.claim!.campaign);
    if (c?.kind === 'stamps' && l.claim.tier) {
      if ((demoStamps[c.id] ?? 0) < l.claim.tier) throw new Error('not enough stamps yet');
      demoStamps = { ...demoStamps, [c.id]: (demoStamps[c.id] ?? 0) - l.claim.tier };
    } else {
      const claim = demoClaims.find((x) => x.campaignId === l.claim!.campaign && !x.usedAt);
      if (!claim) throw new Error('that offer has not been unlocked');
      demoClaims = demoClaims.map((x) => (x === claim ? { ...x, usedAt: new Date().toISOString() } : x));
    }
  }
  let earned = 0;
  for (const c of demoCampaigns) {
    if (c.kind === 'stamps' && c.active && input.subtotal > 0 && input.subtotal >= (c.minOrder ?? 0)) {
      demoStamps = { ...demoStamps, [c.id]: (demoStamps[c.id] ?? 0) + 1 };
      earned += 1;
    }
  }
  const id = 'demo-' + Date.now().toString(36);
  DEMO_ORDERS = [{
    id, userId: 'demo', status: 'received',
    subtotal: input.subtotal, tax: input.tax, tip: input.tip, discount: input.saved, total: input.total, stampsEarned: earned,
    pickupAt: input.pickupAt, pickupName: input.pickupName, createdAt: new Date().toISOString(),
    lines: input.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, mods: l.mods, note: l.note ?? null, free: !!l.claim })),
  }, ...DEMO_ORDERS];
  return id;
}

/** Demo builds only: put the test account in a known state. */
export function demoSet(s: { stamps?: number; resetOffers?: boolean }) {
  if (!DEMO_ALLOWED || hasSupabase) return;
  if (s.stamps !== undefined) demoStamps = { ...demoStamps, stamp_card: s.stamps };
  if (s.resetOffers) demoClaims = [];
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!hasSupabase) return demoCampaigns.filter((c) => c.active);
  const { data, error } = await supabase.from('campaigns').select('*').eq('active', true).order('created_at');
  if (error) throw error;
  return (data ?? []).map(hydrateCampaign);
}

export async function getMyCampaignClaims(): Promise<CampaignClaim[]> {
  if (!hasSupabase) return demoClaims;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('campaign_claims').select('*').eq('user_id', user.id);
  return (data ?? []).map((c: any) => ({ campaignId: c.campaign_id, unlockedBy: c.unlocked_by, usedAt: c.used_at }));
}

/** Stamps on each card, by campaign id. */
export async function getMyStamps(): Promise<Record<string, number>> {
  if (!hasSupabase) return demoStamps;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase.from('campaign_stamps').select('campaign_id, stamps').eq('user_id', user.id);
  return Object.fromEntries((data ?? []).map((r: any) => [r.campaign_id, r.stamps]));
}

/**
 * Unlock a campaign. The database decides — it checks the cap, the end date, and
 * that the action is one this campaign actually offers, and it will not insert a
 * second claim for the same person.
 */
export async function claimCampaign(campaignId: string, actionId: string) {
  if (!hasSupabase) {
    if (!demoClaims.some((c) => c.campaignId === campaignId)) {
      demoClaims = [...demoClaims, { campaignId, unlockedBy: actionId, usedAt: null }];
    }
    return;
  }
  const { error } = await supabase.rpc('claim_campaign', { p_campaign: campaignId, p_action: actionId });
  if (error) throw error;
}

// ---------- owner: campaigns ----------

export type CampaignStats = {
  id: string; kind: Campaign['kind']; title: string; active: boolean; endsAt: string | null;
  maxClaims: number | null; claimsCount: number; usedCount: number; cost: number;
};

export async function getOwnerCampaigns(): Promise<CampaignStats[]> {
  if (!hasSupabase) {
    return demoCampaigns.map((c) => ({
      id: c.id, kind: c.kind, title: c.title, active: c.active, endsAt: c.endsAt,
      maxClaims: c.maxClaims, claimsCount: c.claimsCount,
      usedCount: c.kind === 'stamps' ? 12 : 96, cost: c.kind === 'stamps' ? 74 : 192,
    }));
  }
  const { data, error } = await supabase.rpc('owner_campaigns');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, title: r.title, active: r.active, endsAt: r.ends_at,
    maxClaims: r.max_claims, claimsCount: r.claims_count, usedCount: Number(r.used_count), cost: Number(r.cost),
  }));
}

export type CampaignDraft = {
  id: string; kind: Campaign['kind']; title: string; blurb: string; finePrint: string;
  actions: CampaignAction[]; rewardItemIds: string[]; cover: Record<string, number>;
  minOrder: number | null; tiers: StampTier[];
  maxClaims: number | null; endsAt: string | null; active: boolean;
};

export async function saveCampaign(c: CampaignDraft) {
  if (!hasSupabase) {
    const next: Campaign = { ...c, blurb: c.blurb || null, finePrint: c.finePrint || null, claimsCount: 0 };
    demoCampaigns = [...demoCampaigns.filter((x) => x.id !== c.id), next];
    return;
  }
  const { error } = await supabase.from('campaigns').upsert({
    id: c.id, kind: c.kind, title: c.title, blurb: c.blurb || null, fine_print: c.finePrint || null,
    actions: c.actions, reward_item_ids: c.rewardItemIds, reward_cover: c.cover,
    min_order: c.minOrder, tiers: c.tiers,
    max_claims: c.maxClaims, ends_at: c.endsAt, active: c.active,
  });
  if (error) throw error;
}

export async function setCampaignActive(id: string, active: boolean) {
  if (!hasSupabase) { demoCampaigns = demoCampaigns.map((c) => (c.id === id ? { ...c, active } : c)); return; }
  const { error } = await supabase.from('campaigns').update({ active }).eq('id', id);
  if (error) throw error;
}

function hydrateCampaign(d: any): Campaign {
  return {
    id: d.id, kind: d.kind ?? 'action', title: d.title, blurb: d.blurb, finePrint: d.fine_print ?? null,
    actions: Array.isArray(d.actions) ? d.actions : [],
    rewardItemIds: d.reward_item_ids ?? [], cover: d.reward_cover ?? {},
    minOrder: d.min_order === null || d.min_order === undefined ? null : Number(d.min_order),
    tiers: Array.isArray(d.tiers) ? d.tiers : [],
    maxClaims: d.max_claims, claimsCount: d.claims_count,
    endsAt: d.ends_at, active: d.active,
  };
}


/** Keeps the push token current so order updates can actually reach a phone. */
export async function savePushToken(token: string) {
  if (!hasSupabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ expo_push_token: token }).eq('id', user.id);
}

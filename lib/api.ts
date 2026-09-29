// Data layer. Screens never talk to a database directly.
//   Real database configured (EXPO_PUBLIC_SUPABASE_*): Supabase.
//   Otherwise, in test builds only (DEMO_ALLOWED): the test database on the phone
//   (lib/local — SQLite), so Expo Go and the TestFlight test app work end to end
//   with pretend orders and remember them between launches.
import Constants from 'expo-constants';
import seed from '@/data/menu.seed.json';
import { supabase, hasSupabase } from './supabase';

/** Test mode (no real database) is for development and test builds only. See getProfile. */
export const DEMO_ALLOWED = __DEV__ || process.env.EXPO_PUBLIC_ENV === 'sandbox' || Constants.expoConfig?.extra?.testMode === true;
import type { Category, MenuItem, ModifierGroup, Order, Profile, Role, Testimonial, TruckStatus } from './types';
export { isOrderable, isSoldOut } from './availability';
import { soldOutToday } from './availability';
import { phoneDigits } from './phone';
import { type Campaign, type CampaignAction, type CampaignClaim, type StampTier } from './campaigns';
import { localStore } from './local';
import { campaignStats, loyalty, ownerToday, placeTestOrder, productMix, type TestOrderInput } from './local/logic';
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
  return localStore().read('truck');
}


export async function setTruckStatus(s: TruckStatus): Promise<void> {
  if (!hasSupabase) { localStore().write('truck', { ...localStore().read('truck'), ...s }); return; }
  const { error } = await supabase.from('truck_status').update({
    is_open: s.isOpen, location_name: s.locationName, address: s.address,
    hours_text: s.hoursText, prep_minutes: s.prepMinutes,
  }).eq('id', 1);
  if (error) throw error;
}

/** The owner's "truck page": story, contact, socials, delivery links, reviews. */
export async function setTruckPage(s: TruckStatus): Promise<void> {
  if (!hasSupabase) { localStore().write('truck', { ...localStore().read('truck'), ...s }); return; }
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
  // Test database: a switch holds for the day it was flipped, then clears itself,
  // exactly like sold_out_until on the real menu.
  const off = localStore().read('soldOut');
  return { categories: seed.categories, items: hydrate(seed.items).map((i) => (off[i.id] ? { ...i, soldOutUntil: off[i.id] } : i)) };
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
    return hydrateProfile({ id: 'demo', name: localStore().read('profileName'), phone: null, role: (process.env.EXPO_PUBLIC_DEMO_ROLE ?? 'owner'), birthday: null });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ? hydrateProfile(data) : null;
}

export async function getMyOrders(): Promise<Order[]> {
  if (!hasSupabase) return localStore().read('orders');
  const { data } = await supabase.from('orders').select('*, order_lines(*)').order('created_at', { ascending: false }).limit(30);
  return (data ?? []).map(mapOrder);
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!hasSupabase) return localStore().read('orders').find((o) => o.id === id) ?? null;
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

// What the app sends to checkout. No prices: the server works them all out.
export type OrderInput = {
  lines: { menuItemId: string; name: string; qty: number; mods: string[]; note?: string; campaign?: string; tier?: number }[];
  tip: number;
  pickupAt: string | null;
  pickupName?: string;
};

/**
 * Builds and prices the order on the server and returns the owner's Square
 * payment page to send the customer to — or `free` when there is nothing to pay.
 * Same call from the app and the website.
 */
export async function createCheckout(input: OrderInput): Promise<{ orderId: string; checkoutUrl?: string; free?: boolean }> {
  if (!hasSupabase) throw new Error('No database configured — see README');
  return invoke('create-checkout', input as unknown as Record<string, any>);
}

/**
 * Call a server function and, when it refuses, show its own words ("The truck is
 * closed right now") rather than "Edge Function returned a non-2xx status code".
 */
async function invoke(name: string, body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (data?.error) throw new Error(data.error);
  if (error) {
    const said = await (error as any).context?.json?.().catch(() => null);
    throw new Error(said?.error ?? error.message);
  }
  return data;
}


export async function staffListOrders(): Promise<Order[]> {
  // Oldest first, the order the kitchen cooks in — same as the real query below.
  if (!hasSupabase) {
    return localStore().read('orders')
      .filter((o) => o.status === 'received' || o.status === 'preparing' || o.status === 'ready')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { data } = await supabase.from('orders').select('*, order_lines(*)').in('status', ['received', 'preparing', 'ready']).order('created_at');
  return (data ?? []).map(mapOrder);
}

export async function staffSetStatus(id: string, status: Order['status']) {
  if (!hasSupabase) { const s = localStore(); s.write('orders', s.read('orders').map((o) => (o.id === id ? { ...o, status } : o))); return; }
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

function mapOrder(o: any): Order {
  return {
    id: o.id, userId: o.user_id, status: o.status, subtotal: +o.subtotal, tax: +o.tax, tip: +o.tip, discount: +o.discount,
    total: +o.total, stampsEarned: o.stamps_earned ?? 0, checkoutUrl: o.checkout_url ?? null, pickupAt: o.pickup_at, pickupName: o.pickup_name ?? null, createdAt: o.created_at,
    lines: (o.order_lines ?? []).map((l: any) => ({ name: l.name, qty: l.qty, price: +l.unit_price, mods: l.mods ?? [], note: l.note ?? null, free: !!l.campaign_id })),
  };
}

// ---------- owner reporting ----------
// The database aggregates and returns small JSON; the phone never downloads
// the order history. The test database works the same figures out from the
// test orders on the phone (lib/local/logic.ts).

export async function getOwnerToday(): Promise<TodayRaw> {
  if (!hasSupabase) return ownerToday(localStore().read('orders'), new Date());
  const { data, error } = await supabase.rpc('owner_today');
  if (error) throw error;
  return data as TodayRaw;
}

export async function getProductMix(days = 7): Promise<MixRow[]> {
  if (!hasSupabase) return productMix(localStore().read('orders'), new Date(), days);
  const { data, error } = await supabase.rpc('owner_product_mix', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ menuItemId: r.menu_item_id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export async function getOwnerLoyalty(): Promise<LoyaltyRaw> {
  if (!hasSupabase) return loyalty(localStore().read('orders'), new Date());
  const { data, error } = await supabase.rpc('owner_loyalty');
  if (error) throw error;
  return data as LoyaltyRaw;
}

// ---------- owner: card payments (Square) ----------

export type SquareStatus = { connected: boolean; business: string | null; location: string | null; connectedAt: string | null; paymentsOn: boolean };

export async function getSquareStatus(): Promise<SquareStatus> {
  if (!hasSupabase) return { connected: false, business: null, location: null, connectedAt: null, paymentsOn: false };
  const { data, error } = await supabase.rpc('owner_square_status');
  if (error) throw error;
  return data as SquareStatus;
}

/** The squareup.com page where the owner signs in and presses Allow. */
export async function squareConnectUrl(): Promise<string> {
  if (!hasSupabase) throw new Error('Connect the database first — Square is linked to it.');
  return (await invoke('square-connect', {})).url;
}

// ---------- owner: people ----------

export async function listTeam(): Promise<Profile[]> {
  if (!hasSupabase) {
    return [
      hydrateProfile({ id: 'demo', name: localStore().read('profileName') ?? 'You (test owner)', phone: null, role: 'owner' }),
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

export async function setSoldOut(menuItemId: string, soldOut: boolean): Promise<void> {
  if (!hasSupabase) {
    const s = localStore(); const off = { ...s.read('soldOut') };
    if (soldOut) off[menuItemId] = soldOutToday(); else delete off[menuItemId];
    s.write('soldOut', off);
    return;
  }
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
  if (!hasSupabase) {
    const s = localStore();
    s.write('feedback', [{ id: 'fb-' + Date.now().toString(36), rating: input.rating, message: input.message.trim() || null,
      build: Constants.expoConfig?.version ?? null, handled: false, createdAt: new Date().toISOString() }, ...s.read('feedback')]);
    return;
  }
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
  if (!hasSupabase) return [...localStore().read('feedback')].sort((a, b) => Number(a.handled) - Number(b.handled) || b.createdAt.localeCompare(a.createdAt));
  const { data, error } = await supabase.rpc('owner_feedback', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, rating: r.rating, message: r.message, build: r.build, handled: r.handled, createdAt: r.created_at,
  }));
}

export async function markFeedbackHandled(id: string, handled: boolean) {
  if (!hasSupabase) { const s = localStore(); s.write('feedback', s.read('feedback').map((f) => (f.id === id ? { ...f, handled } : f))); return; }
  const { error } = await supabase.from('feedback').update({ handled }).eq('id', id);
  if (error) throw error;
}

// ---------- payment safety net ----------

export type StuckOrder = { id: string; createdAt: string; total: number; squareOrderId: string | null };

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
    id: r.id, createdAt: r.created_at, total: Number(r.total), squareOrderId: r.square_order_id,
  }));
}

/** Staff pulling a stuck order onto the board by hand, once they can see the payment went through. */
export async function releaseStuckOrder(orderId: string) {
  if (!hasSupabase) return;
  // Only an order Square has confirmed as paid can be put on the board by hand.
  const { error } = await supabase.from('orders').update({ status: 'received' }).eq('id', orderId).eq('status', 'pending_payment').not('square_paid_at', 'is', null);
  if (error) throw error;
}



/** The name the order is called out under. */
export async function saveName(name: string) {
  if (!hasSupabase) { if (name.trim()) localStore().write('profileName', name.trim()); return; }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id);
}


// ---------- campaigns ----------


// ---------- test builds: the whole flow, with no real database ----------
// Checkout in a test build places the order in the test database instead of
// charging a card. lib/local/logic.ts follows the server's rules: stamps spent for
// a stamp reward, a one-off offer used up, a stamp for an order over the minimum.

export async function demoPlaceOrder(input: TestOrderInput): Promise<string> {
  if (!DEMO_ALLOWED || hasSupabase) throw new Error('test builds only');
  return placeTestOrder(localStore(), input, new Date(), 'test-' + Date.now().toString(36)).id;
}

/** Test builds only: put the test account in a known state, or start again. */
export function demoSet(s: { stamps?: number; resetOffers?: boolean; wipe?: boolean }) {
  if (!DEMO_ALLOWED || hasSupabase) return;
  const st = localStore();
  if (s.wipe) { st.wipe(); return; }
  if (s.stamps !== undefined) st.write('stamps', { ...st.read('stamps'), stamp_card: s.stamps });
  if (s.resetOffers) st.write('claims', []);
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!hasSupabase) return localStore().read('campaigns').filter((c) => c.active);
  const { data, error } = await supabase.from('campaigns').select('*').eq('active', true).order('created_at');
  if (error) throw error;
  return (data ?? []).map(hydrateCampaign);
}

export async function getMyCampaignClaims(): Promise<CampaignClaim[]> {
  if (!hasSupabase) return localStore().read('claims');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('campaign_claims').select('*').eq('user_id', user.id);
  return (data ?? []).map((c: any) => ({ campaignId: c.campaign_id, unlockedBy: c.unlocked_by, usedAt: c.used_at }));
}

/** Stamps on each card, by campaign id. */
export async function getMyStamps(): Promise<Record<string, number>> {
  if (!hasSupabase) return localStore().read('stamps');
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
    // Same checks as claim_campaign(): running, offers that action, one per account, under the cap.
    const s = localStore();
    const c = s.read('campaigns').find((x) => x.id === campaignId);
    const claims = s.read('claims');
    if (!c || !c.active || c.kind !== 'action') throw new Error('that offer is not running');
    if (!c.actions.some((a) => a.id === actionId)) throw new Error('not one of the things this offer asks for');
    if (c.maxClaims !== null && claims.filter((x) => x.campaignId === c.id).length >= c.maxClaims) throw new Error('that offer is all gone');
    if (!claims.some((x) => x.campaignId === campaignId)) s.write('claims', [...claims, { campaignId, unlockedBy: actionId, usedAt: null }]);
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
    const s = localStore();
    return campaignStats({ campaigns: s.read('campaigns'), claims: s.read('claims'), orders: s.read('orders') });
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
    const s = localStore();
    s.write('campaigns', [...s.read('campaigns').filter((x) => x.id !== c.id), next]);
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
  if (!hasSupabase) { const s = localStore(); s.write('campaigns', s.read('campaigns').map((c) => (c.id === id ? { ...c, active } : c))); return; }
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

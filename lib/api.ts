// Data layer. Runs off the local seed until Supabase env vars are set,
// then reads/writes the real tables. Screens never talk to Supabase directly.
import Constants from 'expo-constants';
import seed from '@/data/menu.seed.json';
import { supabase, hasSupabase } from './supabase';
import type { Category, MenuItem, ModifierGroup, Order, Profile, Reward, Role, TruckStatus } from './types';
export { isOrderable, isSoldOut } from './availability';
import { soldOutToday } from './availability';
import { phoneDigits } from './phone';
import { pointsForOrder } from './points';
import type { Campaign, CampaignAction, CampaignClaim } from './campaigns';
import type { MixRow, RewardsRaw, TodayRaw } from './reporting';

const groups = seed.modifierGroups as Record<string, ModifierGroup>;

function hydrate(items: typeof seed.items): MenuItem[] {
  return items.map((i) => ({
    ...i,
    featured: !!i.featured,
    modifierGroups: (i.modifierGroups as string[]).map((g) => groups[g]).filter(Boolean),
  }));
}

export async function getTruckStatus(): Promise<TruckStatus> {
  if (hasSupabase) {
    const { data } = await supabase.from('truck_status').select('*').eq('id', 1).single();
    if (data) return { isOpen: data.is_open, halal: data.halal, instagram: data.instagram, locationName: data.location_name, address: data.address, lat: data.lat, lng: data.lng, hoursText: data.hours_text, prepMinutes: data.prep_minutes };
  }
  return demoStatus ?? (seed.truck as TruckStatus);
}

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
        })),
      };
    }
  }
  return { categories: seed.categories, items: hydrate(seed.items) };
}

export async function getItem(id: string): Promise<MenuItem | undefined> {
  const { items } = await getMenu();
  return items.find((i) => i.id === id);
}

export async function getRewards(): Promise<Reward[]> {
  if (hasSupabase) {
    const { data } = await supabase.from('rewards').select('*').order('points_cost');
    if (data) return data.map((r: any) => ({ id: r.id, name: r.name, pointsCost: r.points_cost, imageUrl: r.image_url, menuItemId: r.menu_item_id }));
  }
  return seed.rewards;
}

function hydrateProfile(d: any): Profile {
  const role: Role = d.role ?? 'customer';
  return {
    id: d.id, name: d.name, phone: d.phone, points: d.points, birthday: d.birthday,
    role,
    isStaff: role === 'staff' || role === 'owner',
    isOwner: role === 'owner',
  };
}

export async function getProfile(): Promise<Profile | null> {
  if (!hasSupabase) {
    // Demo mode signs you in as the owner so every screen is reachable.
    return hydrateProfile({ id: 'demo', name: 'Cihan', phone: null, points: 730, role: (process.env.EXPO_PUBLIC_DEMO_ROLE ?? 'owner'), birthday: null });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data ? hydrateProfile(data) : null;
}

const DEMO_ORDERS: Order[] = [
  {
    id: 'demo-live', userId: 'demo', status: 'preparing',
    subtotal: 24.5, tax: 0, tip: 3, discount: 0, total: 27.5, pointsEarned: 122,
    pickupAt: null, pickupName: 'Cihan', createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
    lines: [
      { name: 'The OG', qty: 1, price: 12.5, mods: ['Double patty', 'Beef bacon'] },
      { name: 'Smash Fries', qty: 1, price: 8, mods: ['Single patty', 'OG House'] },
      { name: 'Can Drink', qty: 2, price: 2, mods: ['Coke'] },
    ],
  },
  {
    id: 'demo-done', userId: 'demo', status: 'completed',
    subtotal: 24, tax: 0, tip: 0, discount: 0, total: 24, pointsEarned: 120,
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
  lines: { menuItemId: string; name: string; qty: number; mods: string[]; note?: string; campaign?: string; reward?: string }[];
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
  if (!hasSupabase) return DEMO_ORDERS.filter((o) => o.status !== 'completed');
  const { data } = await supabase.from('orders').select('*, order_lines(*)').in('status', ['received', 'preparing', 'ready']).order('created_at');
  return (data ?? []).map(mapOrder);
}

export async function staffSetStatus(id: string, status: Order['status']) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

function mapOrder(o: any): Order {
  return {
    id: o.id, userId: o.user_id, status: o.status, subtotal: +o.subtotal, tax: +o.tax, tip: +o.tip, discount: +o.discount,
    total: +o.total, pointsEarned: o.points_earned, pickupAt: o.pickup_at, pickupName: o.pickup_name ?? null, createdAt: o.created_at,
    lines: (o.order_lines ?? []).map((l: any) => ({ name: l.name, qty: l.qty, price: +l.unit_price, mods: l.mods ?? [] })),
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

export async function getOwnerRewards(): Promise<RewardsRaw> {
  if (!hasSupabase) {
    return { pointsOutstanding: 48600, members: 214, newThisWeek: 23, redeemedThisWeek: 3100 };
  }
  const { data, error } = await supabase.rpc('owner_rewards');
  if (error) throw error;
  return data as RewardsRaw;
}

// ---------- owner: people ----------

export async function listTeam(): Promise<Profile[]> {
  if (!hasSupabase) {
    return [
      hydrateProfile({ id: 'demo', name: 'Cihan', phone: '+1 713 555 4402', points: 730, role: 'owner' }),
      hydrateProfile({ id: 'u2', name: 'Samil', phone: '+1 713 555 8890', points: 120, role: 'staff' }),
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
  if (!hasSupabase) return;
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

const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: 'welcome_drink', title: 'Free drink', blurb: 'On us, for your first order',
    actions: [
      { id: 'follow_instagram', label: 'Follow us on Instagram', url: 'https://www.instagram.com/buns.patties' },
      { id: 'google_review', label: 'Leave a Google review', url: process.env.EXPO_PUBLIC_GOOGLE_REVIEW_URL ?? 'https://maps.google.com/?cid=559877457463287649' },
    ],
    rewardItemId: 'can_drink', maxClaims: 1000, claimsCount: 138, endsAt: null, active: true,
  },
];

export async function getCampaigns(): Promise<Campaign[]> {
  if (!hasSupabase) return DEMO_CAMPAIGNS;
  const { data, error } = await supabase.from('campaigns').select('*').eq('active', true);
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
  id: string; title: string; active: boolean; endsAt: string | null;
  maxClaims: number | null; claimsCount: number; usedCount: number; cost: number;
};

export async function getOwnerCampaigns(): Promise<CampaignStats[]> {
  if (!hasSupabase) {
    return [{ id: 'welcome_drink', title: 'Free drink', active: true, endsAt: null, maxClaims: 1000, claimsCount: 138, usedCount: 96, cost: 192 }];
  }
  const { data, error } = await supabase.rpc('owner_campaigns');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, active: r.active, endsAt: r.ends_at,
    maxClaims: r.max_claims, claimsCount: r.claims_count, usedCount: Number(r.used_count), cost: Number(r.cost),
  }));
}

export async function saveCampaign(c: {
  id: string; title: string; blurb: string; actions: CampaignAction[];
  rewardItemId: string; maxClaims: number; endsAt: string | null; active: boolean;
}) {
  if (!hasSupabase) return;
  const { error } = await supabase.from('campaigns').upsert({
    id: c.id, title: c.title, blurb: c.blurb, actions: c.actions,
    reward_item_id: c.rewardItemId, max_claims: c.maxClaims, ends_at: c.endsAt, active: c.active,
  });
  if (error) throw error;
}

export async function setCampaignActive(id: string, active: boolean) {
  if (!hasSupabase) return;
  const { error } = await supabase.from('campaigns').update({ active }).eq('id', id);
  if (error) throw error;
}

function hydrateCampaign(d: any): Campaign {
  return {
    id: d.id, title: d.title, blurb: d.blurb,
    actions: Array.isArray(d.actions) ? d.actions : [],
    rewardItemId: d.reward_item_id, maxClaims: d.max_claims, claimsCount: d.claims_count,
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

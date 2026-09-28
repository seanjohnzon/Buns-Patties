export type Category = { id: string; name: string; sort: number };

export type ModifierOption = { id: string; name: string; priceDelta: number };
export type ModifierGroup = {
  id: string;
  name: string;            // "Cook temp", "Add-ons", "Remove"
  required: boolean;
  min: number;
  max: number;             // 1 = single choice
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;           // dollars
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
  featured?: boolean;
  available: boolean;
  /** Set to today by staff when they run out. Clears itself tomorrow. */
  soldOutUntil?: string | null;
};

export type CartLine = {
  key: string;             // itemId + chosen option ids
  item: MenuItem;
  qty: number;
  chosen: ModifierOption[];
  note?: string;
  /** Which entitlement makes this line free. The server checks it; the price
   *  on this object is only what the phone shows. */
  claim?: { campaign?: string; reward?: string };
};

// Mirrors the order_status enum in supabase/schema.sql. 'pending_payment' is a
// real state the app can see — a web customer returning from Stripe before the
// webhook has landed — so it has to be in here.
export type OrderStatus = 'pending_payment' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type Order = {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  tip: number;
  discount: number;        // points redemption in $
  total: number;
  pointsEarned: number;
  pickupAt: string | null; // ISO, null = ASAP
  pickupName: string | null;
  createdAt: string;
  lines: { name: string; qty: number; price: number; mods: string[] }[];
};

export type Reward = {
  id: string;
  name: string;            // "Free Fries"
  pointsCost: number;
  imageUrl: string | null;
  menuItemId: string | null;
};

export type Role = 'customer' | 'staff' | 'owner';

export type Profile = {
  id: string;
  name: string | null;
  phone: string | null;
  points: number;
  role: Role;
  /** Owners are staff too — they work the window. */
  isStaff: boolean;
  isOwner: boolean;
  birthday: string | null;
};

export type TruckStatus = {
  isOpen: boolean;
  /** Card payments live? Off until Stripe approves the owner. */
  paymentsEnabled?: boolean;
  halal?: boolean;
  instagram?: string | null;
  locationName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hoursText: string;       // "11am – 9pm"
  prepMinutes: number;     // "Pickup in 15 min"
};

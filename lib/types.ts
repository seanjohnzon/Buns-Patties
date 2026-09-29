export type Category = { id: string; name: string; sort: number };

export type ModifierOption = { id: string; name: string; priceDelta: number };
export type ModifierGroup = {
  id: string;
  name: string;            // "Cook temp", "Add-ons", "Remove"
  required: boolean;
  min: number;
  max: number;             // 1 = single choice
  options: ModifierOption[];
  /** Options that stand alone: picking "No sauce" clears the rest, and the other way round. */
  exclusive?: string[];
  /** A different max while another group has one of these picked (8 or 10 wings = 2 flavors). */
  maxWhen?: { group: string; options: string[]; max: number }[];
  /** Each option has a counter and is charged per tap (sauce cups on seasoned fries). */
  counted?: boolean;
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;           // dollars
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
  /** What comes on it and cannot be taken off. Shown, never charged. */
  includes?: string[];
  /** Options already picked when the item opens: its own sauce, its cheese. */
  defaults?: Record<string, string[]>;
  featured?: boolean;
  available: boolean;
  /** Set to today by staff when they run out. Clears itself tomorrow. */
  soldOutUntil?: string | null;
};

/** A reward line: the item's own price is on the house, and so are its
 *  modifiers up to `cover` dollars per group. Anything past that is charged. */
export type Claim = { campaign: string; tier?: number; cover?: Record<string, number> };

export type CartLine = {
  key: string;             // itemId + chosen option ids
  item: MenuItem;
  qty: number;
  chosen: ModifierOption[];
  note?: string;
  /** Which campaign makes this line free, and for a stamp card which reward
   *  (by its stamp count). The server checks it; the price on this object is
   *  only what the phone shows. */
  claim?: Claim;
};

// Mirrors the order_status enum in supabase/schema.sql. 'pending_payment' is a
// real state the app can see — a customer back from the Square payment page before the
// webhook has landed — so it has to be in here.
export type OrderStatus = 'pending_payment' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type Order = {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  tip: number;
  discount: number;        // what the free lines would have cost; not taken off the total
  total: number;
  stampsEarned: number;
  /** The Square payment page, while the order is waiting to be paid. */
  checkoutUrl?: string | null;
  pickupAt: string | null; // ISO, null = ASAP
  pickupName: string | null;
  createdAt: string;
  lines: { name: string; qty: number; price: number; mods: string[]; note?: string | null; free?: boolean }[];
};

export type Role = 'customer' | 'staff' | 'owner';

export type Profile = {
  id: string;
  name: string | null;
  phone: string | null;
  role: Role;
  /** Owners are staff too — they work the window. */
  isStaff: boolean;
  isOwner: boolean;
  birthday: string | null;
};

export type TruckStatus = {
  isOpen: boolean;
  /** Card payments live? Off until the owner's Square is connected. */
  paymentsEnabled?: boolean;
  halal?: boolean;
  instagram?: string | null;
  locationName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hoursText: string;       // "11am – 9pm"
  prepMinutes: number;     // "Pickup in 15 min"
  // The truck's page: set by the owner, shown on Home and Account. Empty = hidden.
  story?: string;
  phone?: string;
  email?: string;
  tiktok?: string;
  facebook?: string;
  doordash?: string;
  ubereats?: string;
  grubhub?: string;
  testimonials?: Testimonial[];
};

/** A review the owner chose to show, copied from his Google page. */
export type Testimonial = { name: string; quote: string; stars: number; sample?: boolean };

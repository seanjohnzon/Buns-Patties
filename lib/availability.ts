// Whether a customer can order something right now.
//
// Pure and import-free so it can be unit-tested. Staff flip "sold out" mid
// service; it is stored as the date it was switched off and clears itself the
// next day, so nobody has to remember to turn the menu back on in the morning.

export type Availability = { available?: boolean; soldOutUntil?: string | null };

/** True while staff have it switched off. */
export function isSoldOut(item: Availability, today = new Date()): boolean {
  if (!item.soldOutUntil) return false;
  return item.soldOutUntil >= today.toISOString().slice(0, 10);
}

/** What a customer should actually see on the menu. */
export function isOrderable(item: Availability, today = new Date()): boolean {
  if (item.available === false) return false;
  return !isSoldOut(item, today);
}

/** The date string staff writing "sold out" today should store. */
export function soldOutToday(today = new Date()): string {
  return today.toISOString().slice(0, 10);
}

export type CheckoutBlock =
  | { blocked: false }
  | { blocked: true; reason: 'closed' | 'no_name' | 'payments_off'; message: string };

/**
 * Whether this cart can be sent, and if not, what to tell the customer. The server
 * enforces the same rules; this just means nobody finds out at the payment step.
 */
export function checkoutBlock(input: {
  open: boolean | null; paymentsEnabled: boolean | null; total: number; name: string;
}): CheckoutBlock {
  if (input.open === false) {
    return { blocked: true, reason: 'closed', message: 'The truck is closed right now.' };
  }
  // A $0 order (the free drink) never needs card payments.
  if (input.total > 0 && input.paymentsEnabled === false) {
    return { blocked: true, reason: 'payments_off', message: 'Card payments start very soon. For now, order and pay at the window. Your free drink still works here.' };
  }
  if (!input.name.trim()) {
    return { blocked: true, reason: 'no_name', message: 'Add a name so we can call your order out.' };
  }
  return { blocked: false };
}

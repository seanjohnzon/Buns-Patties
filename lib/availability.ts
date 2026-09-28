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

// Phone numbers get typed a dozen different ways and stored exactly one way.
// Supabase keeps auth.users.phone as E.164 digits with no plus ("17135554402"),
// and the signup trigger copies that into profiles.phone — so every lookup and
// every sign-in has to go through here first, or "+1 713 555 4402" never matches
// the row it created.

const DEFAULT_COUNTRY = '1'; // US/Canada — the truck is in Houston

/** Digits only, country code included. Null when it cannot be a real number. */
export function phoneDigits(input: string, defaultCountry = DEFAULT_COUNTRY): string | null {
  const d = (input || '').replace(/\D/g, '');
  if (!d) return null;
  // A bare 10-digit US number: add the country code.
  if (d.length === 10) return defaultCountry + d;
  // Already has a country code (US 11, international up to 15).
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** The form Supabase Auth wants when sending a code. */
export function phoneE164(input: string, defaultCountry = DEFAULT_COUNTRY): string | null {
  const d = phoneDigits(input, defaultCountry);
  return d ? '+' + d : null;
}

/** How it is shown back to a person: +1 713 555 4402 */
export function formatPhone(stored: string | null): string {
  const d = phoneDigits(stored || '');
  if (!d) return stored || '';
  if (d.length === 11 && d.startsWith('1')) {
    return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return '+' + d;
}

/** Two numbers are the same person if they normalise to the same digits. */
export function samePhone(a: string | null, b: string | null): boolean {
  const da = phoneDigits(a || ''), db = phoneDigits(b || '');
  return !!da && da === db;
}

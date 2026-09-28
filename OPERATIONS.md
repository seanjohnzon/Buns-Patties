# How we run this

Internal. Not for a client.

## Who owns what, and why

The rule: **we own everything we operate; the client owns only what legally has
to be theirs.** A client emailing us admin keys is a security problem and a
support ticket waiting to happen — and it is not how anybody in this market does
it.

| | Owner | How we get in | Why |
|---|---|---|---|
| Code (GitHub) | **Us** | — | We write it. Handed over if they leave. |
| Database (Supabase) | **Us** | — | We operate it. One project per environment. |
| Text messages (Twilio) | **Us** | — | Ours, pooled across clients. |
| Web hosting / EAS | **Us** | — | Ours. |
| **Square** | **Client** | Their existing Square account. They press **Allow** on one squareup.com page (Square OAuth) that lets our app take payments and refunds. No team invite, no key sent to us. They cut us off in Square Dashboard → Settings → App integrations → Disconnect | It is their money and their tax liability |
| **Apple Developer** | **Client** | They invite us into App Store Connect as **App Manager** (invite cihanshah.sahin@gmail.com) with **Access to Certificates, Identifiers & Profiles** ticked — without it EAS cannot generate signing credentials | Apple forbids publishing a client's app under an agency licence — the account holder must be able to bind the business legally |
| **Google Play** | **Client** | Play Console → Users and permissions → Invite new users → cihanshah.sahin@gmail.com, **Admin (all permissions)** | Same, and an Organization account skips the 12-tester rule |
| **Google Business Profile** | **Client** | Business Profile settings → People and access → Add → cihanshah.sahin@gmail.com, **Manager** | It is their listing and their reviews |

Nobody sends a password. Every client-owned account ends with *them adding us
from inside*, and they can remove us at any time without anything breaking.

### Card payments: Square, connected with one Allow button

- **Buns & Patties already has Square** from the old business. So payments go into
  that account. We make our own free Square developer app; the owner opens one
  squareup.com page, signs in and presses **Allow** (Square OAuth). Our server
  keeps the token it gets back; nothing is ever emailed, and he can disconnect us
  from his dashboard at any time.
- What the Allow grants: take payments, refund them, read orders and his business
  profile. What it cannot do: see or change his bank, move money out, see his
  password.
- **Never ask a client to email a key or token.** Square access tokens start
  `EAAA`, secrets `sq0`. The client page tells them to refuse — including us.
- **State of the code (Monday 28):** checkout still runs through the Stripe
  version (PaymentSheet on native, a hosted page on web, a webhook, a five-minute
  reconcile sweep). The swap to Square's hosted checkout + `payment.updated`
  webhook + the OAuth callback is the next job. The rest of the app (menu, prices,
  stamps, rules) does not change with it — `_shared/build-order.ts` is payment-
  provider neutral apart from the customer record.
- **Later, many clients:** the same Allow button scales — every restaurant
  connects its own Square account to one app of ours. That is how Square's own
  App Marketplace partners work.

## Order of operations for a new client

1. **Business type, day one.** Apple and Google Play only accept a registered
   company (LLC or corporation) as an organisation. A sole trader or DBA enrols as
   an individual under their own name — and a personal Google Play account created
   since November 2023 has to run a 12-tester, 14-day closed test before release.
2. **Domain, day one.** Apple rejects organisations without a real, public website
   on their own domain *and* a work email on that domain — social links and parked
   pages are refused. Google Play, the payment provider and the QR sticker all point at it too.
   We register it (handed over if they leave), put a real site on it within a day
   — legal business name, menu, hours, contact, privacy/refund/terms pages — and
   set up `hello@<domain>` forwarding to their normal inbox.
3. **D-U-N-S** gates both store accounts. Apple can take 2 more working days to
   see a newly issued number.
4. Store accounts the day the D-U-N-S arrives; card payments (their Square) on day one, independently.

For Buns & Patties: `bunsandpattieshtx.com` (plain `bunsandpatties.com` belongs to
an unrelated restaurant in Berkley, Michigan).

## Sign-in texts

Supabase phone auth through **Twilio Verify**, not a plain Twilio number. US
carriers require A2P 10DLC brand and campaign registration for application SMS,
which takes days and needs the client's EIN; Verify is exempt for one-time
passcodes. Ours, pooled across clients.

## Card payments switch

`truck_status.payments_enabled` starts **off**. While off, the server refuses any
order above $0 and the cart tells customers to pay at the window — the free drink
still works. We flip it on once the owner has pressed Allow on Square and a real
$1 order has gone through and been refunded. Owners cannot toggle it.

## Demo mode

Demo data signs every visitor in as the owner. It only runs when `__DEV__` or
`EXPO_PUBLIC_ENV=sandbox`. A production build with no database configured shows a
signed-out app, and `/owner` redirects to sign-in — verified against a real
static export. Never set `EXPO_PUBLIC_ENV=sandbox` on a deployed site.

In demo the whole customer flow works with no backend, so it can be checked by
hand in Expo Go (QA Gate 1): checkout places a pretend order that follows the
server's rules (stamps earned at $15+, spent on rewards, one free drink), and
**Account → Test controls** sets the stamp card to 0/4/5/9/10 or resets the free
drink. None of it can run against a real database — `tests/demo-guard.test.mjs`.

## The pipeline

```
   GitHub (ours)
        │
        ├── push → CI: npm run verify        typecheck + every test, Gate 0
        │
        ├── WEB     eas deploy / Vercel  →  sandbox URL → SIT URL → their domain
        │
        └── NATIVE  eas build --profile …
                      ├── sandbox  dev client, simulator
                      ├── sit      → TestFlight, via THEIR App Store Connect
                      └── uat      → App Store + Play, via THEIR accounts
```

Profiles live in `eas.json`. Because the store accounts are the client's, EAS
submits **into their account using our invited role** — we never hold their
credentials, and the app is listed under their business name, as Apple requires.

### Environments

| | Supabase | Card payments | Who sees it |
|---|---|---|---|
| Sandbox | none yet — demo mode (Expo Go) | none (pretend orders) | us, and the owner in Expo Go |
| SIT | ours, dummy data | test mode | us + the owner, on TestFlight |
| UAT | ours, **real data, never wiped** | **live, the owner's Square** | real customers |

Three separate Supabase projects. SIT's seeded orders must never appear in the
takings the owner reads.

## Orders that cost nothing

A claimed freebie on its own totals exactly $0.00, so checkout opens a $0 order
straight onto the kitchen board without a card. Safe because the total is
computed server-side from verified entitlements — a phone cannot talk its way to
$0. (Square's minimum is 1 cent, so the free fries with two 25¢ sauce cups —
$0.54 — is a normal payment.)

## Secrets

Nothing lives in the repo. `.env` is gitignored, `.env.example` and
`.env.server.example` show the shape.

- **App build-time** (`EXPO_PUBLIC_*`) — EAS environment variables, per profile.
  These reach the phone, so nothing sensitive goes here.
- **Server** — Supabase function secrets, set from `.env.server` via
  `scripts/deploy-functions.sh`. Payment provider secret, webhook secret,
  reconcile secret. These never reach a phone.

## Changing the menu

The menu lives in `data/menu.seed.json` — the demo app reads it directly and
`supabase/seed.sql` is generated from it:

1. Edit the JSON (prices, options, which options come pre-picked in `defaults`,
   what it `includes`).
2. `node scripts/build-seed.mjs` → rewrites `supabase/seed.sql`.
3. `npm run verify`. If the printed board changed, update `BOARD` in
   `tests/menu.test.mjs` in the same commit.

The owner's rules the tests hold you to:
- **One order on every item page: size → cheese → toppings → sauce last.**
- Defaults cannot be removed, only added to; sauce and cheese offer "No …".
- An add-on list never offers what the item already comes with.
- The server checks the same rules (`supabase/functions/_shared/validate-mods.ts`).

Added or moved a screen? Run `scripts/typegen.sh` so the typed routes know about it.

## QA

- **The QA page** (Release Checklist artifact) holds every gate, with pass/fail
  runs per build and tester. Gate 1 is the owner's Expo Go checklist.
- **`docs/OWNER_NOTES.md`** maps each point the owner asked for to how it works,
  the automated test, and the Gate 1 check that covers it. Update it when he adds
  to the list; nothing counts as done until it has a check.

## Releasing

1. `npm run verify` — Gate 0. Red means stop.
2. Gate 1 on Expo Go — the 25-check list, ticked on the QA page.
3. `eas build --profile sit` → TestFlight → Gates 2 and 3.
4. Gate 4 before real customers. `eas build --profile uat` → stores.
5. Web can go out on its own at any point — no review, no waiting.

Never patch straight to UAT, however small it looks.

## What we keep doing after launch

- Menu and price changes on request.
- Surviving the yearly iOS and Android releases — Expo SDK upgrades roughly
  twice a year, and a store rebuild after each.
- Backups on, and restored once so we know they work.
- Watching `webhook_events` for anything unhandled, and the kitchen board's
  paid-but-not-cooking banner.
- Campaign costs, weekly (Owner → Campaigns).
- Apple renews annually ($99) on the client's card. Diarise it — a lapsed
  membership pulls their app from the store.

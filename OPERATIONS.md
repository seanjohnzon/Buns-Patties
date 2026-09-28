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
| **Stripe** | **Client** | They sign up at dashboard.stripe.com/register, then Settings → Team → Add member → cihanshah.sahin@gmail.com, role **Developer**. We build on a **restricted** key, then tell them to remove us. Payouts go to their bank, never through us | It is their money and their tax liability |
| **Apple Developer** | **Client** | They invite us into App Store Connect as **App Manager** (invite cihanshah.sahin@gmail.com) with **Access to Certificates, Identifiers & Profiles** ticked — without it EAS cannot generate signing credentials | Apple forbids publishing a client's app under an agency licence — the account holder must be able to bind the business legally |
| **Google Play** | **Client** | Play Console → Users and permissions → Invite new users → cihanshah.sahin@gmail.com, **Admin (all permissions)** | Same, and an Organization account skips the 12-tester rule |
| **Google Business Profile** | **Client** | Business Profile settings → People and access → Add → cihanshah.sahin@gmail.com, **Manager** | It is their listing and their reviews |

Nobody sends a password. Every client-owned account ends with *them adding us
from inside*, and they can remove us at any time without anything breaking.

### Stripe: two models

- **Now, one client:** their own Stripe account; they invite us as a team member
  with role **Developer** — the lowest Stripe role that can create API keys and
  webhooks. Invites expire after 10 days.

  Be accurate about what Developer can do (Stripe's own roles page): it **can**
  create keys, view and refund payments, and pay the balance out — but only to
  the bank account already on file. It **cannot** add or edit bank accounts, edit
  the payout schedule, invite or remove anyone, or change the owner. So money can
  only ever reach the client, but it is not a read-only role. (An earlier version
  of this file said Developer "cannot touch payouts". That was wrong.)

  So: build on a **restricted** key with only what the app needs, create the
  webhook, then tell the client it is safe to **remove us**. Verify in SIT that
  removing the member who created the key does not revoke it before telling any
  client to do it.

- **Never ask a client to email a key.** Stripe classes secret and restricted keys
  as credentials, like a password. An emailed key lives in an inbox forever, has
  no 2FA and no audit trail, and rotating it breaks the integration. The client
  page tells them to refuse — including us — which also protects them from
  phishing.

Restricted key permissions the app needs: PaymentIntents (write), Checkout
Sessions (write), Customers (write), Ephemeral keys (write — native only; confirm
in SIT that a restricted key can mint them), Charges (read), Events (read).
- **Later, many clients:** Stripe **Connect** — we hold the platform account and
  each business onboards as a connected account through Stripe's hosted flow.
  This is what Owner.com, Toast and Square all do. Worth moving to at the point
  where chasing individual Stripe accounts becomes the bottleneck, not before.

## The pipeline

```
   GitHub (ours)
        │
        ├── push → CI: npm run verify        typecheck + 72 tests, Gate 0
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

| | Supabase | Stripe | Who sees it |
|---|---|---|---|
| Sandbox | ours, dummy data | test keys | us |
| SIT | ours, dummy data | test keys | us + the owner, on TestFlight |
| UAT | ours, **real data, never wiped** | **live keys** | real customers |

Three separate Supabase projects. SIT's seeded orders must never appear in the
takings the owner reads.

## Orders that cost nothing

A claimed freebie on its own totals exactly $0.00. Stripe refuses any charge under
50 cents, so both checkout functions open a $0 order straight onto the kitchen
board without touching Stripe. Safe because the total is computed server-side
from verified entitlements — a phone cannot talk its way to $0. Anything actually
paid for clears the minimum (cheapest item $1.50 + tax), and both are tested.

## Secrets

Nothing lives in the repo. `.env` is gitignored, `.env.example` and
`.env.server.example` show the shape.

- **App build-time** (`EXPO_PUBLIC_*`) — EAS environment variables, per profile.
  These reach the phone, so nothing sensitive goes here.
- **Server** — Supabase function secrets, set from `.env.server` via
  `scripts/deploy-functions.sh`. Stripe secret key, webhook secret, reconcile
  secret. These never reach a phone.

## Releasing

1. `npm run verify` — Gate 0. Red means stop.
2. Sandbox gate (Gate 1) on Expo Go.
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
- Apple renews annually ($99) on the client's card. Diarise it — a lapsed
  membership pulls their app from the store.

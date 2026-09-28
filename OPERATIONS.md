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
| **Stripe** | **Client** | They complete a hosted onboarding link; payouts go to their bank, never through us | It is their money and their tax liability |
| **Apple Developer** | **Client** | They invite us into App Store Connect as **App Manager** | Apple forbids publishing a client's app under an agency licence — the account holder must be able to bind the business legally |
| **Google Play** | **Client** | They invite us in Play Console under Users and permissions | Same, and an Organization account skips the 12-tester rule |
| **Google Business Profile** | **Client** | They add us as a **Manager** | It is their listing and their reviews |

Nobody sends a password. Every client-owned account ends with *them adding us
from inside*, and they can remove us at any time without anything breaking.

### Stripe: two models

- **Now, one client:** their own Stripe account, we are invited as a team member
  and create our own restricted API keys. Simplest, and the money never touches us.
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

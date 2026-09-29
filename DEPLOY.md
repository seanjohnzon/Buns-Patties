# Deploying

Three environments, each its own Supabase project and its own site. Nothing is
shared between them — SIT's dummy orders must never touch UAT's real takings.

| | Site | Supabase | Card payments |
|---|---|---|---|
| Sandbox | local / Expo Go | none yet (demo mode) | none |
| SIT | a staging URL | SIT project | test mode |
| UAT | bunsandpattieshtx.com | UAT project | **live, the owner's Square** |

> Test builds for phones go through TestFlight on Samil's Apple account — see
> [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md).

---

## 1. Supabase, once per environment

```bash
# In the SQL editor, in this order:
#   supabase/schema.sql     tables, roles, rules, reporting
#   supabase/seed.sql       the real menu (generated: node scripts/build-seed.mjs)
#   supabase/cron.sql       the five-minute reconciliation sweep
```

Then **Authentication → Providers → Phone**:
- Sandbox and SIT: add a **Test OTP** number and fixed code. No Twilio, no cost.
- UAT: connect Twilio. Keep one test number for Apple's reviewer.

Make the first owner by hand, once:

```sql
update profiles set role = 'owner' where phone = '17135554402';  -- digits only
```

## 2. Edge functions

```bash
cp .env.server.example .env.server      # fill it in, never commit it
SUPABASE_PROJECT_REF=<ref> npm run deploy:functions
```

Then in the **Square Developer Console** (our app — one app for every restaurant):

- **OAuth → Redirect URL:** `https://<ref>.supabase.co/functions/v1/square-oauth`
- **Webhooks → Add subscription:** `https://<ref>.supabase.co/functions/v1/square-webhook`,
  events `payment.created`, `payment.updated`, `refund.created`, `refund.updated`.
  Put its **signature key** and the URL exactly as entered in `.env.server`, and run
  the deploy again.

For UAT, the owner connects his Square from Owner → **Connect Square** (sign in,
Allow). The owner screen then shows **Square connected** and which location.

## 3. The web app

```bash
npm run build:web        # static export into dist/
npm run serve:web        # check it locally first
```

**Dynamic routes need a rewrite or they 404.** Expo Router exports them as
literal `[id]` files, so `/order/<id>` — the address Square returns customers to
after paying — does not resolve on its own. A customer would see a 404 and think
they had lost their money. `vercel.json`, `netlify.toml` and `public/_redirects`
all carry the mapping; use whichever host you pick, and **test `/order/anything`
before launch**.

Set `EXPO_PUBLIC_SITE_URL` and the `PUBLIC_SITE_URL` secret to the real address,
exactly. Square sends customers back to it.

## 4. Native apps, later

```bash
npx eas build --profile sit --platform ios     # TestFlight
npx eas build --profile uat --platform all     # stores
```

Profiles are in `eas.json`. Needs the Apple ($99/yr) and Google ($25) accounts,
which take days to approve — start them well before you need them.

---

## Before real customers

Run the **Gate 4** checks: https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE

The ones people skip and regret:

- Connect the owner's Square (he presses Allow), then put **one real $1 order through yourself** and refund it.
- Confirm the reconciliation sweep is actually running:
  `select * from cron.job_run_details order by start_time desc limit 10;`
- Confirm the UAT database has no seeded dummy data in it.
- Turn on backups, and restore one once.

## If something is wrong mid-service

- **Stop taking orders:** Truck status → Closed. Immediate, no deploy.
- **One item is wrong:** mark it sold out (kitchen board → Ran out of something?, or the owner dashboard). Immediate.
- **A giveaway is being abused:** Owner → Campaigns → switch it off. Immediate.
- **Paid but not cooking:** the kitchen board shows these in red; staff release by hand.
- **Roll the site back:** redeploy the previous build. The database is unaffected.

Never patch straight to UAT. Sandbox, then SIT, then UAT — however small it looks.

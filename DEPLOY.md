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
#                           (one line to change first: this project's ref)
```

`cron.sql` makes the sweep's secret inside the database and keeps it in Supabase
Vault. There is nothing to copy anywhere: the cron job reads it to send, and
`reconcile-orders` asks the database whether what it was sent is right.

Then **Authentication → Providers → Phone**:
- Sandbox and SIT: add a **Test OTP** number and fixed code. No Twilio, no cost.
- UAT: connect Twilio. Keep one test number for Apple's reviewer.

Make the first owner by hand, once:

```sql
update profiles set role = 'owner' where phone = '17135554402';  -- digits only
```

## 2. Edge functions

```bash
# .env.server: the secrets below, one NAME=value per line. Never commit it.
SUPABASE_PROJECT_REF=<ref> npm run deploy:functions
```

The secrets the functions read. Supabase supplies `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` itself.

| Secret | Set it | What it is |
|---|---|---|
| `SQUARE_ACCESS_TOKEN` | Sandbox and SIT only | The **sandbox** access token from the Square Developer Console. That one value is all a test project needs to take test payments: its location is looked up. Never in UAT, where the owner's Allow button supplies the token. |
| `SQUARE_LOCATION_ID` | Rarely | Pins the location, if the sandbox account has more than one. |
| `SQUARE_ENV` | UAT only | `production`. Unset means sandbox everywhere else, so a test can never charge a real card. |
| `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET` | When the **Connect Square** button is needed | Our Square app's pair: the sandbox pair in SIT, the production pair in UAT. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL` | Once the webhook subscription exists (below) | Until then nothing is lost: the five-minute sweep confirms payments instead. |
| `SQUARE_MERCHANT_ID` | With a fixed sandbox token and webhooks | That account's merchant id, so other merchants' events are ignored. With the Allow button it is stored automatically. |
| `PUBLIC_SITE_URL` | Once the site has an address | Where Square sends a customer after paying. Unset, Square shows its own "paid" page. |
| `RECONCILE_SECRET` | Almost never | Only for running the sweep by hand. The cron job does not need it. |

**Keys never go through a chat.** Sandbox or live, they are typed straight into
Supabase (Edge Functions → Secrets), or pushed from `.env.server` by the script.

Then in the **Square Developer Console** (our app — one app for every restaurant):

- **OAuth → Redirect URL:** `https://<ref>.supabase.co/functions/v1/square-oauth`
- **Webhooks → Add subscription:** `https://<ref>.supabase.co/functions/v1/square-webhook`,
  events `payment.created`, `payment.updated`, `refund.created`, `refund.updated`.
  Put its **signature key** and the URL exactly as entered in `.env.server`, and run
  the deploy again.

For UAT, the owner connects his Square from Owner → **Connect Square** (sign in,
Allow). The owner screen then shows **Square connected** and which location.

### Without a terminal: from a Claude chat with the Supabase connector

This is how the first test project (`buns-patties-test`) was set up, and it is
the quick way for the next client.

1. Create the project in the "Test" organisation (us-east-2).
2. `schema.sql` and `seed.sql`: have the database fetch each file from GitHub at
   a pinned commit, compare its md5 with the file in the repo, and run it only if
   they match. Nothing is retyped, so nothing can drift.
3. `cron.sql`, with the project ref filled in.
4. Each function is deployed as a one-line `index.ts` that imports the real one
   from GitHub at the same pinned commit
   (`https://raw.githubusercontent.com/seanjohnzon/Buns-Patties/<commit>/supabase/functions/<name>/index.ts`).
   Token required: `create-checkout`, `square-connect`. No token (they check a
   signature, a state value or the sweep's secret themselves): `square-webhook`,
   `square-oauth`, `reconcile-orders`.
5. Secrets: the connector asks, and Cihan types the value into the Supabase
   dashboard himself.

### After every deploy, check

Each of these was run against the test project and gave the answer shown.

| Ask | Right answer |
|---|---|
| `reconcile-orders` with no secret, then a wrong one | `401 no`, both times |
| `reconcile-orders` from the cron job | `200`, and `{"skipped":"Square not connected"…}` until Square is connected |
| `create-checkout` and `square-connect`, not signed in | `401 Sign in first.` |
| `square-webhook` with no signature | `400 bad signature` |
| `square-oauth` with no state | `Link expired…` |
| The menu, not signed in (`/rest/v1/menu_items`) | every item |
| `square_connection`, `client_intake`, `profiles`, not signed in | `[]` |
| `owner_today`, `spend_stamps`, `reconcile_secret_ok`, not signed in | `permission denied` |
| A new sign-up | gets a `profiles` row (this was broken until `handle_new_user` got its search path) |

The Security Advisor (Supabase dashboard) will still list three things, all meant:
tables with row rules and no policy (`square_connection`, `square_oauth_states`,
`client_intake`: only the server reads them), functions a signed-in person can
call (the owner and kitchen screens; each checks the caller's role), and the five
functions anyone can call (see "who may call what" at the end of `schema.sql`).

## 3. The web app

```bash
npm run build:web        # static export into dist/
npm run serve:web        # check it locally first
```

**On Netlify the branch decides which database the site talks to.** `netlify.toml`
carries the public settings for the test branch (`[context.test-env.environment]`:
the test project's address, its publishable key, `EXPO_PUBLIC_ENV=sit`). Connect the
repo, choose the branch `test-env`, deploy: nothing to type in. They are public
values (Expo writes every `EXPO_PUBLIC_` value into the pages a browser downloads).
A secret key never goes in that file, and a test stops it. The live site gets its
own block when it has a live project.

Every push to `test-env` or `main` also builds the site on GitHub first
(`.github/workflows/site-build.yml`, the Actions tab), so a broken build shows up
there and not as a failed deploy.

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
  and what it was told: `select status_code, content from net._http_response order by created desc limit 5;`
- Confirm the UAT database has no seeded dummy data in it.
- Turn on backups, and restore one once.

## If something is wrong mid-service

- **Stop taking orders:** Truck status → Closed. Immediate, no deploy.
- **One item is wrong:** mark it sold out (kitchen board → Ran out of something?, or the owner dashboard). Immediate.
- **A giveaway is being abused:** Owner → Campaigns → switch it off. Immediate.
- **Paid but not cooking:** the kitchen board shows these in red; staff release by hand.
- **Roll the site back:** redeploy the previous build. The database is unaffected.

Never patch straight to UAT. Sandbox, then SIT, then UAT — however small it looks.

# Proud Merchant — delivery playbook

**Proud Merchant** (proudmerchant.com) is the name clients see. Sahin LLC is the company
behind it. We build ordering and loyalty apps for any small business, the way Owner.com
does for restaurants. Food trucks are only where we start.

The same system for every client. Decided once, costed once (checked against vendor
pages, September 2026). A new client is this repo copied, one sheet sent, and the
steps below run in order.

## 1. Agency accounts — once, ever (shared by every client)

| Account | Why | Plan / cost | Status |
|---|---|---|---|
| GitHub (seanjohnzon) | one repo per client | free | ✅ |
| Expo (cihanshah) | builds; one project per client, up to 50 | **Starter $19/mo** before any paying client (Free is only for pre-revenue/hobby) | ✅ account · ⏳ upgrade to Starter |
| Apple — Samil's team | test apps on TestFlight before a client has his own account | Samil's $99/yr | ✅ |
| Supabase | database, sign-in, server code | **two orgs**: "Test" (Free; max **2 active projects**, pauses after 7 idle days, no backups) and "Clients" (**Pro $25/mo**, daily backups, includes one project) | ✅ "Test" = the **Sahin LLC** org (Free) · ❌ "Clients" (Pro), at the first launch |
| Square Developer | the one app every restaurant presses Allow on; payment webhooks | free, no Square review | ✅ account, sandbox keys · ⏳ production keys at stage 4 |
| Twilio | sign-in text codes (Verify — no carrier registration per client) | pay as you go; one **Primary Compliance Profile**, approval ≤48h, before the first live client | ❌ sign up |
| Netlify | hosts each client's website | Free to start (300 credits, pauses at the cap); **Pro $20/mo** from the second live client. Not Vercel Hobby, not Cloudflare Free (their terms don't allow it) | ❌ sign up |
| GoDaddy | our own brand domain, **proudmerchant.com**. Clients buy theirs themselves, in their own name, from the button on their sheet (a registrar they have heard of) | $2.99 the first year for a new customer (code GDWELCOME, 1-year term), then $22.99/yr. Checked on godaddy.com, 9 Oct 2026 | ⏳ name chosen 10 Oct (free at GoDaddy that day) · Cihan buys it |

## 2. What each client costs

| | Who pays | Amount |
|---|---|---|
| Database (Supabase Micro in "Clients") | us | ~$10/mo (the first client is covered by the $25 Pro base) |
| Sign-in texts (Twilio Verify, $0.05 + $0.0083 each) | us | ~$15–30/mo at 200–500 sign-ups |
| Builds, hosting | us | share of Expo Starter + Netlify |
| Domain (GoDaddy) | client, in his own name | ~$23/yr |
| Apple Developer (Organization) | client | $99/yr |
| Google Play (Organization) | client | $25 once |
| Card processing (his Square) | client | 2.9% + 30¢ per online order |

About **$30–45/mo per client** on our side. Fixed agency base: $25 Supabase + $19 Expo (+$20 Netlify later).

## 3. The stages (same order, every client)

| # | Stage | Done when | Lead time |
|---|---|---|---|
| 0 | **Kickoff.** Send the client his sheet (`tools/client-sheet/`: one section per account, required and optional boxes, a button to the exact page for each job). Until our own domain is up it is a claude.ai page with a Copy button; after that it is `/intake?c=<code>` with Send, straight into `client_intake`. He starts the slow things that day: D-U-N-S, Apple Organization, Google Organization, Google listing, Square. We run section 4. | sheet sent, section 4 done | day 0, ~2 hours ours |
| 1 | **Build.** Menu into `data/menu.seed.json` → `node scripts/build-seed.mjs`. Branding, campaigns. | QA Gate 0 green, Gate 1 in Expo Go | 2–4 days |
| 2 | **Test app.** TestFlight on Samil's team (`SAMIL.md` — his Claude does it). The owner walks Gate 1 on his own phone. | owner has ticked Gate 1 | same day |
| 3 | **SIT.** Supabase test project + Square sandbox + test sign-in codes. | QA Gates 2 and 3 green | 1–2 days |
| 4 | **Launch on the web.** Supabase project in "Clients", owner presses **Connect Square**, domain on Netlify, QR sticker. | QA Gate 4 green | 1 day |
| 5 | **Stores.** In the client's own Apple and Google accounts (Apple rule 4.2.6: template apps must be submitted by the business itself). `APP_VARIANT=production`. | apps live | D-U-N-S up to 7 business days, then Apple approval **days to 30+ (no SLA)** — why it starts at stage 0 |
| 6 | **Run.** QA Gate 5, monthly cost check. | — | ongoing |

The website does not wait for the app stores. That is why launch is stage 4, not 5.

## 4. Per client, day 0 — ours (~2 hours)

1. **Repo:** copy this one → `github.com/seanjohnzon/<Client>`. Change the name, bundle ids and slug in `app.json` / `app.config.js`. Test id `com.<client>.app.preview`, real id `com.<client>.app`. Never upload the real id from Samil's team: bundle ids lock to the first team that uploads a build.
2. **Expo:** `npx eas-cli init` (project under our account).
3. **Supabase:** a SIT project in "Test" (us-east-2). Run `schema.sql`, `seed.sql`, `cron.sql` (one line to change: the project ref). Phone sign-in → Test OTP numbers. Functions: `scripts/deploy-functions.sh`, or from a Claude chat with the Supabase connector (DEPLOY.md, "Without a terminal"). One secret to type in: the Square **sandbox** token. Then run the checks in DEPLOY.md. Put the project's address and publishable key in `netlify.toml` (the `test-env` block), so the test site needs no settings on Netlify. The production project in "Clients" waits for stage 4.
4. **Twilio:** subaccount `<Client> – prod` → Verify service (friendly name = the brand, **code length 6**, US only). Paste into Supabase → Phone → Twilio Verify. Raise Supabase's SMS limit from 30/hour.
5. **Square Developer:** add this client's webhook URL(s) to our one app. Nothing else until he presses Allow.
6. **Domain:** the client buys it himself at GoDaddy, in his own name (the button on his sheet: the name only, none of the extras offered at checkout), and puts it on the sheet. We point it at the Netlify site from the repo (`npm run build:web`) and set up `hello@` forwarding to his inbox.
7. **Sheet:** copy `tools/client-sheet/food-truck.html`, fill in the `SHEET` object (its README says which four things), publish, send him the link. For the hosted form: add his private code in `lib/intake-links.ts` and his row in `client_intake`. Read answers: `select * from client_intake`.
8. **QA page:** start a run for the client.

## 5. Client-facing, the whole time

- **One sheet** — a checklist of sections, each with named boxes marked required or optional and a button to the exact page (`tools/client-sheet/`). The Food Truck template, https://claude.ai/artifact/DmuMyjuiHjejKN9pVdwXvT → filled in per client; for Buns & Patties https://claude.ai/artifact/HwCPDBosxVayFjk2PFx6vm. Anything new we need from him goes on it, never in a message. Everything on it is something he can do that day.
- **Nightly meeting notes** (`docs/MEETING_NOTES.md`): what landed, what's blocked. No new asks.
- **Owner notes** (`docs/OWNER_NOTES.md`): every point he asks for → how it works → which QA check proves it.

## 6. Coming changes to plan for

- Supabase retires the `anon` / `service_role` keys at the end of 2026 in favour of `sb_publishable_` / `sb_secret_`. Move the template before then.
- .com wholesale price rises 1 Nov 2026 (and up to 7% a year after). Budget $23 a year at GoDaddy.
- Apple and Google both reject near-identical apps (4.3). Each client needs his own branding, menu and screenshots.

## 7. Next plan: the customer needs almost nothing to start (10 Oct — a direction, not built)

Cihan's direction: a customer should need very little to get going. We carry the Apple
and Google accounts ourselves, so nobody waits on Apple. The intake is what starts the
work: each answer triggers a job. Copy what already works at Owner.com and the others,
down to their forms and steps; invent nothing. Plan it first, then build the intake.
The automation behind it ("the rails") can come after.

What the others do (sources are in the competitor doc, "Ordering App Competitors"):

| Path | Who | How long | The catch |
|---|---|---|---|
| The business enrols with Apple itself and invites the vendor as Admin | Owner.com, Toast, ChowNow (iPhone), Flipdish | Toast budgets about six weeks | Slow, and the customer does the paperwork: D-U-N-S, Apple's phone call, $99 a year |
| Every client's app sits under the vendor's own account | Per Diem, Craver (the store shows them as the seller) | 24 hours to a few days | Apple's rule 4.2.6 says a template app must be submitted by the business itself. They ship this way anyway. If Apple objects, every client is on the one account |

What the fast path needs from us, and it has lead time:

- Apple Developer Program as an **Organization** under Sahin LLC (D-U-N-S first), so the
  store shows the company as the seller and not a person's name. Check what kind of
  account the one we use today is.
- Google Play as an Organization too. To check: a personal Play account has to run a
  closed test with real testers for two weeks before it may publish at all.
- The real bundle id (`com.<client>.app`) would live on our team. Moving an app to the
  client's own account later is an Apple app transfer. Today's rule (never upload the
  real id from our side) changes if we go this way.

Intake that starts the work:

- The fastest vendors make "connect Square" the intake. Orda says "launch in 5 minutes";
  Per Diem: connect Square, their team builds, test orders, go live, QR stickers. Menu,
  hours, location and logo come out of Square. We already have the Allow button
  (`square-oauth`).
- A customer can start on `<client>.proudmerchant.com` and bring his own domain later.

Order of work: (1) take apart the onboarding of Owner.com, Per Diem, Craver, Orda and
ChowNow: every question they ask and every step after it; (2) our intake, one field per
job it triggers; (3) build the intake; (4) the rails. If this plan is adopted it replaces
stage 5, the Apple and Google sections of the client sheet, and "the client buys his
domain first".

---

## Buns & Patties — where it stands (9 Oct)

| Stage | State |
|---|---|
| 0 Kickoff | ✅ sheet sent; rebuilt 9 Oct at the same link. Owner: D-U-N-S requested, menu received and loaded, Google Maps move requested (pending at Google). Still on the sheet: legal name, domain, Apple and Google accounts, Square email, the truck, photos |
| 1 Build | ✅ Gates 0–1 green (141 tests; the 25 Expo Go checks walked on the simulator) |
| 2 Test app | ⏳ Samil runs `SAMIL.md` → owner gets B&P Test |
| 3 SIT | ⏳ Supabase test project **`buns-patties-test`** (ref `ysochqypjpmuhackmzqw`, us-east-2) is up: schema, menu, the five-minute sweep, all five functions, and every check in DEPLOY.md passes. Still needed: the Square sandbox token typed in as a secret, a test phone code for sign-in, a web address for the site |
| 4 Launch | Web. Needs stage 3, his domain, and his Allow on Square |
| 5 Stores | after the D-U-N-S → his Apple and Google accounts |

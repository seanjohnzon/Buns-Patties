# Delivery playbook — ordering apps for restaurants and food trucks

The same system for every client. Decided once, costed once (checked against vendor
pages, September 2026). A new client is this repo copied, one sheet sent, and the
steps below run in order.

## 1. Agency accounts — once, ever (shared by every client)

| Account | Why | Plan / cost | Status |
|---|---|---|---|
| GitHub (seanjohnzon) | one repo per client | free | ✅ |
| Expo (cihanshah) | builds; one project per client, up to 50 | **Starter $19/mo** before any paying client (Free is only for pre-revenue/hobby) | ✅ account · ⏳ upgrade to Starter |
| Apple — Samil's team | test apps on TestFlight before a client has his own account | Samil's $99/yr | ✅ |
| Supabase | database, sign-in, server code | **two orgs**: "Test" (Free; max **2 active projects**, pauses after 7 idle days, no backups) and "Clients" (**Pro $25/mo**, daily backups, includes one project) | ❌ sign up |
| Square Developer | the one app every restaurant presses Allow on; payment webhooks | free, no Square review | ❌ sign up |
| Twilio | sign-in text codes (Verify — no carrier registration per client) | pay as you go; one **Primary Compliance Profile**, approval ≤48h, before the first live client | ❌ sign up |
| Netlify | hosts each client's website | Free to start (300 credits, pauses at the cap); **Pro $20/mo** from the second live client. Not Vercel Hobby, not Cloudflare Free (their terms don't allow it) | ❌ sign up |
| Porkbun | client domains, registered in the client's legal name; free email forwarding | ~$11–12/yr per domain | ❌ sign up |

## 2. What each client costs

| | Who pays | Amount |
|---|---|---|
| Database (Supabase Micro in "Clients") | us | ~$10/mo (the first client is covered by the $25 Pro base) |
| Sign-in texts (Twilio Verify, $0.05 + $0.0083 each) | us | ~$15–30/mo at 200–500 sign-ups |
| Builds, hosting | us | share of Expo Starter + Netlify |
| Domain | us, rebilled | ~$12/yr |
| Apple Developer (Organization) | client | $99/yr |
| Google Play (Organization) | client | $25 once |
| Card processing (his Square) | client | 2.9% + 30¢ per online order |

About **$30–45/mo per client** on our side. Fixed agency base: $25 Supabase + $19 Expo (+$20 Netlify later).

## 3. The stages (same order, every client)

| # | Stage | Done when | Lead time |
|---|---|---|---|
| 0 | **Kickoff.** Send the client sheet (Universal Client Pack, filled in). He starts the slow things that day: D-U-N-S, Apple Organization, Google Organization, Google listing, Square. We run section 4. | sheet sent, section 4 done | day 0, ~2 hours ours |
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
3. **Supabase:** a SIT project in "Test" (us-east-2). Run `schema.sql`, `seed.sql`, `cron.sql`. Phone sign-in → Test OTP numbers. `scripts/deploy-functions.sh`. The production project in "Clients" waits for stage 4.
4. **Twilio:** subaccount `<Client> – prod` → Verify service (friendly name = the brand, **code length 6**, US only). Paste into Supabase → Phone → Twilio Verify. Raise Supabase's SMS limit from 30/hour.
5. **Square Developer:** add this client's webhook URL(s) to our one app. Nothing else until he presses Allow.
6. **Domain:** register at Porkbun in the client's legal name, `hello@` forwarding to his inbox, Netlify site from the repo (`npm run build:web`).
7. **QA page:** start a run for the client.

## 5. Client-facing, the whole time

- **One sheet** (Universal Client Pack, https://claude.ai/artifact/DmuMyjuiHjejKN9pVdwXvT → filled in per client; for Buns & Patties https://claude.ai/artifact/HwCPDBosxVayFjk2PFx6vm). Anything new we need from him goes on it, never in a message.
- **Nightly meeting notes** (`docs/MEETING_NOTES.md`): what landed, what's blocked. No new asks.
- **Owner notes** (`docs/OWNER_NOTES.md`): every point he asks for → how it works → which QA check proves it.

## 6. Coming changes to plan for

- Supabase retires the `anon` / `service_role` keys at the end of 2026 in favour of `sb_publishable_` / `sb_secret_`. Move the template before then.
- .com wholesale price rises 1 Nov 2026 (and up to 7% a year after). Budget $12 a year.
- Apple and Google both reject near-identical apps (4.3). Each client needs his own branding, menu and screenshots.

---

## Buns & Patties — where it stands (29 Sep)

| Stage | State |
|---|---|
| 0 Kickoff | ✅ sheet sent. Owner: D-U-N-S requested; legal name, domain yes, Apple ID email pending (on the sheet) |
| 1 Build | ✅ Gates 0–1 green (125 tests; the 25 Expo Go checks walked on the simulator) |
| 2 Test app | ⏳ Samil runs `SAMIL.md` → owner gets B&P Test |
| 3 SIT | ❌ waiting on our Supabase / Square Developer / Twilio accounts (section 1) |
| 4 Launch | Friday 2 Oct — web. Needs stage 3, the domain, and his Allow on Square (Thursday) |
| 5 Stores | after the D-U-N-S → his Apple and Google accounts |

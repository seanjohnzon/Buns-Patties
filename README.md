# Buns & Patties app

Ordering and rewards for a halal smash burger truck in Houston
([@buns.patties](https://www.instagram.com/buns.patties)). **Soft launch 2 October.**

A printed QR on the truck gets people into the app, where a free drink is waiting
if they follow on Instagram or leave a review. After that they order ahead, pay,
and pick up **by name** — nothing to show, nothing to scan. Staff get a kitchen
board; the owner gets the takings, what is selling, and a tool for building his
own giveaways.

Runs on iOS, Android **and the web**. The web build is what makes the launch date
possible: it takes payments with no app store involved.

**Stack:** Expo (React Native, iOS + Android + web landing) · Supabase (auth, Postgres, realtime, edge functions) · Stripe (Apple Pay / Google Pay / cards). Running cost ≈ $0/mo + Stripe's 2.9% + 30¢.

## Run it now (demo mode, no backend needed)

```bash
npm install
npx expo start
```

On the Mac mini (where Xcode lives): rsync to `~/Library/Caches/Anchor/burgertruck/`, then
`npx expo start --go --lan --port 8085`, and open `exp://10.0.0.152:8085` on a simulator.
Deep-link any screen for a demo: `exp://10.0.0.152:8085/--/menu`, `/--/rewards`, `/--/staff/status`,
or `/--/demo` which seeds a sample order and jumps to checkout.

Press `i` for iOS simulator. Without `.env` it runs off `data/menu.seed.json` with a fake 730-point demo user and staff mode enabled, so every screen is browsable.

## Testing

Three steps, each with its own Supabase project:

| | What it is | Data | What it is for |
|---|---|---|---|
| **Sandbox** | Expo Go, local | Dummy, wipe freely | The app isn't broken. Sign-in works here via Supabase **test OTP** — no Twilio, no texts, no cost. |
| **SIT** | TestFlight, real device | Dummy, seeded, wipe freely | The real pieces join up: Twilio texting real codes, Stripe **test** mode. Every new feature and every first deploy passes through here. |
| **UAT** | Real customers at the truck | **Real. Never wiped.** | Real feedback, to fix and improve. Stripe is **live** — this is a soft launch, not a test environment. |

Nothing moves forward without its gate passing. See the checklist:
https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE

### Dummy data

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:dummy
```

Creates ~25 customers on the `+1 555 01xx` fiction-reserved range and a fortnight of
paid orders weighted to lunch and dinner, so the owner dashboard, kitchen board and
rewards screens have something real-shaped to show. Tunable with `SEED_DAYS` and
`SEED_CUSTOMERS`. It refuses to run against a URL containing `prod` or `live`.

**Never run it against UAT.** Seeded orders inside real takings makes every number
on the owner dashboard a lie.

```bash
npm run verify
```

That is Gate 0 — typecheck plus 70 tests over pricing, rewards rules, menu integrity,
owner reporting, availability, feedback and phone normalisation (see [tests/README.md](tests/README.md)).
Gate 1 is sandbox smoke, Gate 2 is SIT, and Gate 3 is a scripted three-phone
end-to-end run on SIT. All hands-on gates live in the QA checklist:
https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE

Design work happens after every gate is green, not before.

### Testing sign-in without Twilio

Supabase Auth takes a map of phone number to fixed code, so the whole sign-in flow
is testable in sandbox with no SMS provider and no cost. Set it under
**Authentication → Providers → Phone → Test OTP** (self-hosted: `[auth.sms.test_otp]`).

Keep one of these for **Apple's reviewer** and put the number and code in the App
Store Connect review notes — the reviewer cannot receive your texts, and apps get
rejected for exactly that.

## Screens

| Route | What it is | Copied from |
|---|---|---|
| `(tabs)/index` | Home: the logo smash (press, juice, fries), where/when, free drink, stamp card, reviews, tag us, links | reference screenshot 1 |
| `(tabs)/menu` | Category pills + item rows with "+" | reference screenshot 3 |
| `item/[id]` | Modifiers (required single / optional multi), qty, note | Toast/Owner item sheet |
| `cart` | Pickup ASAP/scheduled, tip %, rewards shown as "on us", Pay (Stripe PaymentSheet) | reference screenshot 2 |
| `order/[id]` | Received → Cooking → Ready, live via realtime | BurgerFi order tracking |
| `(tabs)/rewards` | Live offers, then progress to the next free thing in money | |
| `(tabs)/orders` | History + reorder entry point | |
| `(tabs)/account` | Phone OTP sign-in, staff links | |
| `staff/index` | Kitchen board — orders called out by name, plus a red banner for anything paid but not cooking | (Owner charges for this) |
| `owner/index` | Takings today vs last week, orders, average order, tips kept separate, what's selling, rewards liability | Toast Now |
| `owner/campaigns` | Build an offer, cap it, see what it cost | |
| `owner/people` | Who is staff / owner — a role on a normal phone login, no second admin password | Square, Toast |
| `owner/menu` | Mark an item sold out; it disappears for customers at once | |
| `feedback` / `owner/feedback` | Customers tell the owner what was wrong; he works the list |  |
| `qr` | Landing the truck QR points at | |

## Rewards and offers

### Offers (campaigns) — the owner's tool

Everything the truck gives away is a campaign, including the free drink printed on
the sticker. The owner makes the rest from his phone (`owner/campaigns`): a title,
what someone has to do, a link to send them to, what they get, and a cap.

**Nothing here can be verified.** No platform will tell an app who followed, liked,
shared or reviewed — Instagram and Google both refuse, and any product claiming
otherwise is using the same workarounds. So safety does not come from checking. It
comes from the shape of the offer:

- **One claim per account, ever** — enforced by a primary key on
  `(campaign_id, user_id)`, and an account needs a phone number that received a text.
- **A hard cap** — `max_claims`. The builder shows the worst case in money
  (*cap × what the item costs you*) before anything starts.
- **An end date**, and an off switch that works immediately.

The worst case is a number you read before you start, not a surprise afterwards.

### Not giving it away by accident

The owner's worry was a glitch handing out free food. Three things stop it:

1. **The server never takes a price from the client.** The phone sends what it wants
   and which entitlement it claims; `create-payment-intent` looks up every price
   itself and checks the claim against the database. *(This replaced a real hole —
   the old code did `unitPrice === 0 ? 0 : …`, so anyone able to send an HTTP request
   could have ordered anything for nothing.)*
2. **The claim is spent atomically.** Marking it used is conditional on it still
   being unused, so a retried request cannot hand the same offer out twice, and the
   cart refuses to hold two lines for one entitlement.
3. **A dead link is never a free drink.** An action with no valid URL is not shown,
   and unlocking requires the app to actually go to the background and come back
   after `MIN_AWAY_MS` (`components/useLeftTheApp.ts`). That will not stop someone
   determined, and is not meant to — it stops a mis-tap or an unset link quietly
   giving something away.

### The stamp card

No points. Every order of **$15 or more (before tax)** is a stamp. At **5 stamps**
take free seasoned fries, or keep going; at **10** take a free burger — any burger
but Build Your Own. A double patty is on us; a triple pays the difference, and paid
toppings are always paid. Taking a reward uses its stamps. The $15 rule lives in the
small print on the card, where every coffee-shop card keeps it.

Stamps are added by the database when an order is paid (`on_order_paid` in
`supabase/schema.sql`) and handed back if the order dies. Spending them goes through
`spend_stamps()`, which only the checkout function can call and which cannot spend
the same stamps twice. The owner can build more cards, or change this one, in
Owner → Campaigns.

### Picking the order up

By name, like DoorDash. Typed at checkout, headline on the kitchen board, and the
order screen says *"Ask for Cihan."*

## Go-live checklist (what I need from you)

1. ~~**Menu**~~ — done, loaded from the printed board into `data/menu.seed.json` + `supabase/seed.sql`.
   Open questions: which sodas the Can Drink covers, and whether Build Your Own includes cheese by default.
2. **Photos** — one square photo per item (600×600 is fine). Until then `components/ItemImage.tsx` falls back to the logo.
3. ~~**Branding**~~ — logo in `assets/brand/`, black + cheese-yellow palette in `lib/theme.ts`.
4. **Reward tiers** — confirm the 5% rate and the ladder: free drink after $40 of
   orders, seasoned fries after $100, wings after $160, The OG after $180.
5. **Tax** — Houston is 8.25%; confirm whether menu prices include it → `TAX_RATE` in `lib/cart.ts` and the edge function (currently 0).
6. **Your Google Maps review link** — the direct "write a review" URL, for
   `EXPO_PUBLIC_GOOGLE_REVIEW_URL`. Without it that half of the welcome offer is dead.
7. **Accounts to create** (all free tier):
   - Supabase project → run `supabase/schema.sql` then `seed.sql`; turn on Phone auth (needs a Twilio account for SMS OTP, ~$0.01/msg); deploy both edge functions with `supabase functions deploy`; set secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
   - Stripe account → publishable + secret keys; add webhook pointing at the `stripe-webhook` function for `payment_intent.succeeded` / `payment_intent.payment_failed`; register Apple Pay merchant ID `merchant.com.burgertruck.app`.
   - Apple Developer ($99/yr) + Google Play ($25 once) → EAS Build/Submit. Replace `bundleIdentifier` / `package` in `app.json` with the real ones.
7. **Domain** for the QR landing page + universal links (e.g. `order.yourtruck.com`) → `associatedDomains` in `app.json`, then generate the QR from that URL.
8. **Truck location/hours** — set in `truck_status` (staff can toggle open/closed; a staff toggle UI is a 20-line add).
9. **Who is staff** — see *Signing in* below. Only the first owner needs SQL.

## Signing in

One login for everyone: a phone number and a code by text. No passwords, no separate
admin account. A `role` on the profile (`customer` / `staff` / `owner`) decides what
you see.

1. **Everyone** installs the app and signs in with their own number. They start as a
   `customer` with the signup bonus.
2. **The first owner** is set once, by hand, because there is deliberately no way to
   promote yourself from inside the app:
   ```sql
   update profiles set role = 'owner' where phone = '17135554402';  -- digits only
   ```
3. **Everyone after that** is promoted by the owner from `owner/people`, by phone
   number. No SQL again.

Guard rails, all enforced in Postgres rather than only in the app:

- `is_staff()` / `is_owner()` are SECURITY DEFINER so RLS doesn't recurse through
  `profiles`' own policy.
- Only an owner may change a role, and never their own (`id <> auth.uid()`).
- `protect_last_owner` refuses to demote the only owner, so the truck can't end up
  with nobody in charge.
- `owner_today` / `owner_product_mix` / `owner_rewards` each refuse a non-owner, so
  the money is safe even if someone calls the API directly.
- `components/RequireRole.tsx` gates the screens as a second line of defence — it
  stops the wrong screen opening, it is not what keeps the data safe.

Phone numbers are normalised through `lib/phone.ts` before they are sent or looked
up. Supabase stores them as bare E.164 digits, so `+1 713 555 4402`, `(713) 555-4402`
and `7135554402` all have to resolve to the same row.

## Paying

Two paths, one set of rules. Every order — native or web — is built by
`supabase/functions/_shared/build-order.ts`, which owns all pricing and every
entitlement check. The two checkouts cannot drift apart because neither has its
own copy.

| | How they pay | Needs a store account? |
|---|---|---|
| **Web** | Redirect to a Stripe-hosted page, back to the order screen | **No** |
| **iOS / Android** | Native payment sheet, Apple Pay / Google Pay | Yes |

The web path is what makes a launch possible without waiting on Apple: a QR
sticker points at the site, people scan it, order and pay, no install. Both paths
land on the same webhook, and the reconciliation sweep understands both a
PaymentIntent and a Checkout session.

`EXPO_PUBLIC_SITE_URL` must match the real address exactly — Stripe returns
customers to it after paying.

## When payment and food get out of step

Stripe guarantees the money moved. It has no idea whether a burger was made — no
processor does, and none sells that. Keeping the two in step is ours, so it is built
in three layers rather than written down as a procedure:

1. **The order row exists before the payment does.** `create-payment-intent` writes
   the order as `pending_payment`, then creates the PaymentIntent carrying its id. So
   "paid with no order record" is close to impossible by construction.
2. **The webhook never lies to Stripe.** If the database write fails, it returns 500,
   and Stripe retries with backoff for up to three days. Returning 2xx on a failed
   write is the bug that loses orders. Every event is logged to `webhook_events`
   keyed on Stripe's own event id, so a replay is recognised instead of redone.
3. **A sweep asks Stripe the other way round.** `reconcile-orders` runs every five
   minutes (`supabase/cron.sql`): for anything still `pending_payment`, it asks Stripe
   what really happened and makes the database agree. Webhooks are a push and any push
   can be missed; this is the pull that does not depend on delivery.

Anything that still slips through shows on the kitchen board as **Paid, but not on the
board**, with the amount, so staff can release it by hand.

```sql
-- should always be empty
select * from webhook_events where handled_at is null or error is not null;
```

## Feedback

UAT only works if what customers say comes back. They're asked once, on the order
screen after pickup, and can also reach it from Account. It lands on the owner's
**What people are saying** screen, unhandled and lowest-rated first, tagged with the
build it came from so "it broke" traces to a version.

## Deploying

See [DEPLOY.md](DEPLOY.md). The one that bites: Expo Router exports dynamic routes
as literal `[id]` files, so `/order/<id>` — where Stripe returns customers after
paying — 404s without a host rewrite. `vercel.json`, `netlify.toml` and
`public/_redirects` all carry it. **Test `/order/anything` before launch.**

## Not built yet (deliberately)

- Delivery (a truck is pickup only)
- Web push (needs a service worker and a VAPID key; the order screen updates live anyway)
- Scheduled pickup date picker (currently ASAP or +30 min placeholder)
- Admin menu editor (edit in Supabase dashboard for now)

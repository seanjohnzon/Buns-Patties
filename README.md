# Buns & Patties app

Ordering and rewards for a halal smash burger truck in Houston
([@buns.patties](https://www.instagram.com/buns.patties)). **Soft launch 2 October.**

A printed QR on the truck gets people into the app, where the logo smashes a
burger and a free drink is waiting if they follow on Instagram. After that they
order ahead, pay, pick up **by name** — nothing to show, nothing to scan — and
fill a stamp card: 5 orders of $15+ is free fries, 10 is a free burger. Staff get
a kitchen board; the owner gets the takings, what is selling, sold-out switches,
and a builder for his own campaigns.

Runs on iOS, Android **and the web**. The web build is what makes the launch date
possible: it takes payments with no app store involved.

**Stack:** Expo (React Native, iOS + Android + web) · Supabase (auth, Postgres, realtime, edge functions) · card payments into the owner's own **Square** (2.9% + 30¢ online; card, Apple Pay, Google Pay on Square's page).

**How we deliver every client (stages, accounts, costs):** [docs/PLAYBOOK.md](docs/PLAYBOOK.md).

**TestFlight test app:** Samil pastes the first line of [SAMIL.md](SAMIL.md) into Claude Code; it does the rest.

## Run it now (demo mode, no backend needed)

```bash
npm install
npx expo start
```

On the Mac mini (where Xcode lives): rsync to `~/Library/Caches/Anchor/burgertruck/`, then
`npx expo start --go --lan --port 8085`, and open `exp://10.0.0.152:8085` on a simulator.
Deep-link any screen for a demo: `exp://10.0.0.152:8085/--/menu`, `/--/rewards`, `/--/staff/status`,
or `/--/demo` which seeds a sample order and jumps to checkout.

Press `i` for iOS simulator. Without `.env` it runs on the **test database** (SQLite on
the phone, `lib/local`), signed in as the owner, and the whole flow works with no
backend: checkout places a pretend order, the kitchen board shows it, the stamp card
counts it, the owner's numbers add it up — and it is all still there next launch. **Account → Test controls**
sets the stamp card (0/4/5/9/10) and resets the free drink, for the Expo Go checklist.

## Testing

Three steps, each with its own Supabase project:

| | What it is | Data | What it is for |
|---|---|---|---|
| **Sandbox** | Expo Go | Demo mode now; a sandbox project later | The app isn't broken. **Gate 1 is the 25-check list the owner ticks himself in Expo Go.** |
| **SIT** | TestFlight, real device | Dummy, seeded, wipe freely | The real pieces join up: Twilio texting real codes, card payments in **test** mode. Every new feature and every first deploy passes through here. Gate 3, the three-phone acceptance route, runs here. |
| **UAT** | Real customers at the truck | **Real. Never wiped.** | Real feedback, to fix and improve. Payments are **live** into the owner's Square — this is a soft launch, not a test environment. |

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

That is Gate 0 — typecheck plus the whole suite: pricing, the menu against the
printed board, the owner's option rules (in the app and on the server), stamps and
campaigns, owner reporting, availability, feedback, phones, the demo guards (see
[tests/README.md](tests/README.md)). Gate 1 is the owner's Expo Go checklist, Gate 2
is SIT, Gate 3 is the three-phone acceptance route on SIT. All hands-on gates live in
the QA checklist: https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE

Every point the owner has asked for is traced to its test and its check in
[docs/OWNER_NOTES.md](docs/OWNER_NOTES.md).

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
| `cart` | Pickup ASAP/scheduled, tip %, rewards shown as "on us", Pay on the owner's Square page | reference screenshot 2 |
| `order/[id]` | Received → Cooking → Ready, live via realtime | BurgerFi order tracking |
| `(tabs)/rewards` | Live offers, then progress to the next free thing in money | |
| `(tabs)/orders` | History + reorder entry point | |
| `(tabs)/account` | Phone OTP sign-in, staff links | |
| `staff/index` | Kitchen board — orders called out by name, plus a red banner for anything paid but not cooking | (Owner charges for this) |
| `owner/index` | Takings today vs last week, orders, average order, tips kept separate, given away, sold-out switches, what's selling, free items this week | Toast Now |
| `owner/campaigns` | Build a campaign (do this, get that — or a stamp card), cap it, see what it cost, switch it off | |
| `owner/page` | The truck page: story, contact, socials, delivery links, the reviews on Home | |
| `reward` | Pick which item a reward pays for (which burger at 10 stamps) | |
| `owner/people` | Who is staff / owner — a role on a normal phone login, no second admin password | Square, Toast |
| `staff/soldout` | Mark an item sold out (staff and owner); it disappears for customers at once | |
| `feedback` / `owner/feedback` | Customers tell the owner what was wrong; he works the list |  |
| `qr` | Landing the truck QR points at | |

## Rewards and offers

### Offers (campaigns) — the owner's tool

Everything the truck gives away is a campaign. Two ship with the app — the free
drink for an Instagram follow, and the stamp card — and the owner builds the rest
from his phone (`owner/campaigns`), in two shapes:

- **Do this, get that** — pick what they do from ready-made actions (follow on
  Instagram or TikTok, post and tag us, open a link), paste the link, pick what
  they get (they choose one), set a cap and an end date.
- **Stamp card** — the smallest order that earns a stamp, and what any number of
  stamps buys (with "double patty included" for burgers).

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

## What we still need from the owner

The client-facing list is the **What We Need** page
(https://claude.ai/artifact/HwCPDBosxVayFjk2PFx6vm): legal name, the domain, the
D-U-N-S number, the Google listing fixed, Square (he presses Allow), Apple and
Google Play the day the D-U-N-S arrives, photos, his story, the reviews to show,
his other links. The menu, prices, tax (8.25% added at checkout) and branding are
already in.

## Signing in

One login for everyone: a phone number and a code by text. No passwords, no separate
admin account. A `role` on the profile (`customer` / `staff` / `owner`) decides what
you see.

1. **Everyone** installs the app and signs in with their own number. They start as a
   `customer`. (No signup bonus — the free drink is earned by following.)
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
- `owner_today` / `owner_product_mix` / `owner_loyalty` / `owner_campaigns` each refuse a non-owner, so
  the money is safe even if someone calls the API directly.
- `components/RequireRole.tsx` gates the screens as a second line of defence — it
  stops the wrong screen opening, it is not what keeps the data safe.

Phone numbers are normalised through `lib/phone.ts` before they are sent or looked
up. Supabase stores them as bare E.164 digits, so `+1 713 555 4402`, `(713) 555-4402`
and `7135554402` all have to resolve to the same row.

## Paying

Every order — app or website — goes through one function, `create-checkout`.
`_shared/build-order.ts` prices it and checks every reward (the phone never sends a
price); `_shared/square.ts` sends it to the **owner's Square** as an itemised pickup
order and returns Square's hosted payment page. The customer pays there (card, Apple
Pay, Google Pay) and comes back to their order screen. The owner sees each app order,
item by item, in his own Square dashboard, and the money is his from the first second.

He connects his Square once, from Owner → **Connect Square**: he signs in on the
Square page and presses **Allow** (OAuth). The token stays on our server
(`square_connection`, readable by nobody in the app). Sandbox can run on a fixed test
seller token instead. Orders that total $0 (the free drink alone) skip Square.

`PUBLIC_SITE_URL` must match the real address exactly — Square returns customers to
it after paying.

## When payment and food get out of step

Square guarantees the money moved. It has no idea whether a burger was made — no
processor does. Keeping the two in step is ours, in three layers:

1. **The order row exists before the payment does.** It is written as
   `pending_payment`, and the Square order carries its id (`reference_id`). So "paid
   with no order record" is close to impossible by construction.
2. **The webhook never lies to Square** (`square-webhook`). Signature checked; if the
   database write fails it returns 500 and Square retries. Every event is logged to
   `webhook_events` keyed on Square's event id, so a replay is recognised instead of
   redone. A full refund cancels the order, which hands back its stamps and offers.
3. **A sweep asks Square the other way round.** `reconcile-orders` runs every five
   minutes (`supabase/cron.sql`): a waiting order whose Square order is paid gets
   opened; one abandoned for an hour has its payment page closed first, then is
   cancelled; an app payment with no order is flagged.

Anything that still slips through shows on the kitchen board as **Paid, but not on the
board**, so staff can check Square and release it by hand.

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
as literal `[id]` files, so `/order/<id>` — where Square returns customers after
paying — 404s without a host rewrite. `vercel.json`, `netlify.toml` and
`public/_redirects` all carry it. **Test `/order/anything` before launch.**

## Not built yet (deliberately)

- Delivery (a truck is pickup only)
- Web push (needs a service worker and a VAPID key; the order screen updates live anyway)
- Scheduled pickup date picker (currently ASAP or +30 min placeholder)
- Admin menu editor (edit in Supabase dashboard for now)

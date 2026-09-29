# TestFlight — getting the app onto the owner's phone

## Whose Apple account

**Samil's.** He already pays for an Apple Developer membership, and one membership
can build and TestFlight any number of apps. So until launch:

- **We don't buy one.** Nobody on our side needs a second $99 membership to test.
- **The owner buys his own** (Organisation, needs the D-U-N-S) — but only for the
  real App Store release under his business name. Not needed to test.
- **Testers pay nothing.** They install Apple's free **TestFlight** app.

The test build uses its own id, **`com.bunsandpatties.app.preview`**, named **B&P Test**
(`app.config.js`, `APP_VARIANT=preview`). The real id `com.bunsandpatties.app` stays
free for the owner's account, so nothing has to be moved or transferred later — the
store build is simply made on his account when it exists (`eas build --profile uat`).

## What the test build is

Profile **`preview`** in `eas.json`: the full app on the **test database** — a small
SQLite file on the phone (`lib/local`). Orders are pretend (no card), but they are
kept: stamps, orders, sold-out switches, campaigns and the owner's numbers all
survive closing the app. **Account → Test controls** sets the stamp card, resets the
free drink, or wipes everything. Each phone has its own test data. The owner can walk
the whole Gate 1 checklist on his own phone. When the SIT database
exists, profile **`sit`** is the same app pointed at it (real sign-in, Square sandbox).

## The one-time setup (needs Samil, about 10 minutes)

Apple only lets a person sign in the first time — after that, EAS keeps the signing
certificate and every later build runs by itself. Either:

- **Samil runs step 2 himself**, or
- Samil adds **cihanshah.sahin@gmail.com** to his team first: App Store Connect →
  Users and Access → **+** → role **App Manager**, tick **Access to Certificates,
  Identifiers & Profiles** → Invite. Accept the email, then you run step 2.

1. On the Mac mini:
   ```bash
   export PATH=$HOME/.local/node22/bin:$PATH
   cd ~/Library/Caches/Anchor/burgertruck
   ```
2. Build and send to TestFlight in one go:
   ```bash
   npx eas-cli build --profile preview --platform ios --auto-submit
   ```
   It asks, in order: log in to Apple (Samil's Apple ID or yours → 2FA code on that
   person's phone) → pick **Samil's team** → "Generate a new Distribution
   Certificate?" **Yes** → "Generate a new Provisioning Profile?" **Yes** → "Set up
   Push Notifications?" **Yes**. If App Store Connect says the name *B&P Test* is
   taken, use **Buns & Patties Preview**.
3. Wait: the cloud build takes 15–30 minutes (longer on the free queue at busy
   times), then Apple "processes" the upload for 10–30 minutes. You get an email
   from App Store Connect when it is ready.

Later builds: the same command, no questions asked.

## Inviting the owner

Two ways. **Internal is faster** — no Apple review, the build is available the moment
it finishes processing.

**Internal (recommended for this week)**
1. Samil: App Store Connect → Users and Access → **+** → the owner's Apple ID email,
   role **Marketing**, App Access → **Specific apps → B&P Test** only. (He sees only
   this app.)
2. The owner accepts the email invite.
3. App Store Connect → the app → **TestFlight → Internal Testing → +** → add him.
4. He gets an email → installs **TestFlight** from the App Store → taps **Install**.

**External (no team access at all)**
1. App Store Connect → the app → **TestFlight → External Testing → +** group
   "Owner & staff" → add the owner's email (any email).
2. The first build goes to **Beta App Review** — usually under a day. In "What to
   Test" write: *"Demo build: no sign-in needed. Opens signed in as a test owner;
   orders are pretend. Account → Test controls resets the test account."*
3. Once approved he gets the email invite. Later builds of the same version usually
   skip the review.

Staff: same as the owner, whichever way was used.

## Things that bite

- A TestFlight build **expires after 90 days** — build again before then.
- Each new build needs a higher build number; `autoIncrement` handles it.
- Internal testers must be on Samil's team; external testers must wait for the first
  Beta App Review. For Thursday, invite **Tuesday or Wednesday**.
- The test app and the real app are different apps on the phone. When the real one
  ships from the owner's account, delete *B&P Test*.

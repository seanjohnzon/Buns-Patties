# Handoff for Claude on Samil's Mac: the next "B&P Test" build, from `test-env`

Samil: open Claude Code in any folder and paste this one line:

> Follow https://github.com/seanjohnzon/Buns-Patties/blob/test-env/SAMIL.md

---

**Claude, this part is for you.** Do the whole job yourself. Only stop for Samil when
something needs his Apple login or a click on the App Store Connect website, and
then give him the exact clicks.

## The goal

A new build of the Buns & Patties test app on TestFlight, on **Samil's Apple
Developer team**, from the branch **`test-env`**. The app:

- Name **B&P Test**, bundle id **`com.bunsandpatties.app.preview`**, Expo SDK 57. The
  same app record as last time; this is its next build.
- Last time the app ran on a test database inside the phone. This build talks to the
  real test server (Supabase, test cards on Square's sandbox): the branch carries
  the public settings in a tracked `.env`, so a plain clone still needs **no keys, no
  env vars, nothing typed in**.
- Do not set `APP_VARIANT`. That builds the owner's real app
  (`com.bunsandpatties.app`), which must never be uploaded to Samil's team: bundle
  ids lock to the first team that uploads a build.

## Already done last time — do not redo

- Xcode, Node, CocoaPods, Samil's team id.
- The App Store Connect record **B&P Test** (bundle id above, SKU `bp-test`).
- The owner is an internal tester with automatic distribution on, so this build
  reaches him by itself once Apple has processed it (10–30 minutes). No new invite.

## Steps

1. **The code.** In the clone from last time:
   ```bash
   cd Buns-Patties && git fetch origin && git checkout test-env && git pull
   ```
   or, fresh:
   ```bash
   git clone -b test-env https://github.com/seanjohnzon/Buns-Patties.git && cd Buns-Patties
   ```
   Then:
   ```bash
   npm ci
   npx expo prebuild -p ios --clean
   ```
   This creates `ios/BPTest.xcworkspace`, scheme `BPTest`.
2. **Team id**, if it is not in your notes:
   `defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier`. If nothing
   comes back, ask Samil to sign in once in Xcode → Settings → Accounts, or to read
   the Team ID from developer.apple.com → Account → Membership.
3. **Archive**, keeping the log:
   ```bash
   mkdir -p build
   xcodebuild -workspace ios/BPTest.xcworkspace -scheme BPTest -configuration Release \
     -destination 'generic/platform=iOS' -archivePath build/BPTest.xcarchive \
     -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAM_ID> CODE_SIGN_STYLE=Automatic \
     CURRENT_PROJECT_VERSION=$(date +%Y%m%d%H%M) archive 2>&1 | tee build/archive.log
   ```
4. **Check the build is wired to the test server** before uploading anything:
   ```bash
   grep -n "env: " build/archive.log
   ```
   The bundling step must show `env: load .env` and
   `env: export EXPO_PUBLIC_ENV EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   If those lines are missing, the build would run on the phone's own data again:
   stop here, do not upload, and tell Cihan what the log shows.
5. **Upload.** `build/ExportOptions.plist` from last time still works (`method` =
   `app-store-connect`, `destination` = `upload`, `teamID` = <TEAM_ID>,
   `signingStyle` = `automatic`); write it again if it is gone. Then:
   ```bash
   xcodebuild -exportArchive -archivePath build/BPTest.xcarchive \
     -exportOptionsPlist build/ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
   ```
   Encryption is already declared as none in the app, so there's no compliance question.
6. **Report to Cihan** in two lines: the build number (the `CURRENT_PROJECT_VERSION`
   timestamp), and whether it is showing in App Store Connect → TestFlight yet.

For every later build: step 1 (`git pull`, `npm ci`, prebuild), then 3 to 6. The
timestamp keeps the build number unique.

## If something fails

Fix only the build setup (signing, pods, Xcode settings), never the app's own code
and never `.env`. Commit any fix on a branch `samil/testflight`, push it, and tell
Cihan what you changed.

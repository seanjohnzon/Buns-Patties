# Handoff for Claude on Samil's Mac: put "B&P Test" on TestFlight

Samil: open Claude Code in any folder and paste this one line:

> Follow https://github.com/seanjohnzon/Buns-Patties/blob/main/SAMIL.md

---

**Claude, this part is for you.** Do the whole job yourself. Only stop for Samil when
something needs his Apple login or a click on the App Store Connect website, and
then give him the exact clicks.

## The goal

Get the Buns & Patties test app onto TestFlight on **Samil's Apple Developer team**,
then invite the food-truck owner as a tester. The app:

- Name **B&P Test**, bundle id **`com.bunsandpatties.app.preview`**, Expo SDK 57.
- A plain clone builds it as-is. It runs on a test database on the phone, so it needs
  no server, no keys and no env vars.
- Do not set `APP_VARIANT`. That builds the owner's real app
  (`com.bunsandpatties.app`), which must never be uploaded to Samil's team: bundle
  ids lock to the first team that uploads a build.

## Steps

1. **Check the tools.** You need Xcode 16 or later (`xcodebuild -version`), Node 20
   or later, git, and CocoaPods (`pod --version`; if it's missing,
   `brew install cocoapods`). Get Samil's team id:
   `defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier`. If nothing
   comes back, ask Samil to sign in once in Xcode → Settings → Accounts, or to read
   the Team ID from developer.apple.com → Account → Membership.
2. **Build the native project.**
   ```bash
   git clone https://github.com/seanjohnzon/Buns-Patties.git && cd Buns-Patties
   npm ci
   npx expo prebuild -p ios --clean
   ```
   This creates `ios/BPTest.xcworkspace`, scheme `BPTest`.
3. **Make the App Store Connect record.** Upload fails without it. Ask Samil to go to
   appstoreconnect.apple.com → Apps → **+** → New App:
   - Platform: iOS
   - Name: **B&P Test**, or **Buns & Patties Test** if that name is taken
   - Language: English (U.S.)
   - Bundle ID: `com.bunsandpatties.app.preview`. If it isn't in the list yet, do
     step 4 first. Automatic signing registers it; then come back.
   - SKU: `bp-test`
   - User access: Full Access
4. **Archive.**
   ```bash
   xcodebuild -workspace ios/BPTest.xcworkspace -scheme BPTest -configuration Release \
     -destination 'generic/platform=iOS' -archivePath build/BPTest.xcarchive \
     -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAM_ID> CODE_SIGN_STYLE=Automatic \
     CURRENT_PROJECT_VERSION=$(date +%Y%m%d%H%M) archive
   ```
5. **Upload.** Write `build/ExportOptions.plist` with `method` = `app-store-connect`,
   `destination` = `upload`, `teamID` = <TEAM_ID>, `signingStyle` = `automatic`.
   Then run:
   ```bash
   xcodebuild -exportArchive -archivePath build/BPTest.xcarchive \
     -exportOptionsPlist build/ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
   ```
   Encryption is already declared as none in the app, so there's no compliance question.
6. **Invite the owner** once the build shows in App Store Connect → TestFlight
   (processing takes 10–30 minutes). Cihan sends his Apple ID email. Give Samil these
   clicks:
   - App Store Connect → Users and Access → **+** → the owner's email, role
     **Marketing**, App Access → **Specific apps → B&P Test**.
   - App → TestFlight → Internal Testing → **+** group "Owner" → add him and turn
     automatic distribution on.
   - This way there is no Apple review, and he gets the email straight away.
7. **Report to Cihan** in two lines: the build number, and whether the owner has been
   invited or what is still waiting.

## If something fails

Fix only the build setup (signing, pods, Xcode settings), never the app's own code.
Commit any fix on a branch `samil/testflight`, push it, and tell Cihan what you
changed. For a later build, repeat steps 4 and 5; the timestamp keeps the build
number unique.

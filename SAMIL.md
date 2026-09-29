# Samil — put "B&P Test" on TestFlight

About 20 minutes, on a Mac with Xcode and your Apple developer account.
A plain clone builds the test app. There's nothing to configure and no keys.

```bash
git clone https://github.com/seanjohnzon/Buns-Patties.git
cd Buns-Patties
npm install
npx expo prebuild -p ios          # needs CocoaPods: brew install cocoapods
open ios/BPTest.xcworkspace
```

In Xcode:
1. **BPTest** target → **Signing & Capabilities** → Team: yours. Leave "Automatically
   manage signing" on. The bundle id is `com.bunsandpatties.app.preview`.
2. Device: **Any iOS Device (arm64)** → **Product → Archive**.
3. App Store Connect → **Apps → + New App**: iOS, name **B&P Test** (or "Buns &
   Patties Test" if that name is taken), bundle id `com.bunsandpatties.app.preview`,
   SKU `bp-test`.
4. Back in the Organizer → **Distribute App → App Store Connect → Upload**.
   (Encryption is already declared as "none".)

When it finishes processing, go to **TestFlight** in App Store Connect:
- **Owner** (Apple ID email is on the What We Need sheet). Fastest way: **Users and
  Access → +**, role **Marketing**, access to **B&P Test** only, then add him under
  **Internal Testing**. There's no Apple review this way.
- If you'd rather not add him to your team, use **External Testing** with his email.
  The first build waits for Beta App Review (usually under a day). Review note:
  "Test build: no sign-in needed; orders are pretend."

He installs Apple's **TestFlight** app and taps the invite. Builds expire after 90
days. For a new build, bump the build number (target → General) and repeat steps 2 and 4.

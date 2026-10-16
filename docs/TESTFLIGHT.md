# TestFlight

**How:** Samil pastes the first line of [SAMIL.md](../SAMIL.md) into Claude Code on his
Mac. His Claude pulls the branch, builds, signs and uploads; the first time it also
walked him through inviting the owner.

**Why Samil's account:** his existing $99 membership covers it. Nobody else buys one to
test. The owner buys his own Organization account only for the real App Store release
(Apple rule 4.2.6: template-built apps must be submitted by the business itself).

**Which app:** every build is **B&P Test** (`com.bunsandpatties.app.preview`); the
branch decides what it runs on.

- `main`: the phone's own test database — pretend orders kept between launches, and
  **Account → Test controls**. No server at all. This was the first build.
- `test-env`: the real test server. A tracked `.env` on the branch carries the SIT
  project's public settings, so a plain clone builds against it with nothing typed in.
  Sign-in is a test number and a fixed code (DEPLOY.md, part 1), cards are Square's
  sandbox test cards, nothing real is charged. This is the build for the SIT round:
  the owner's requirements review and Burak's QA run on it.

`APP_VARIANT=production` builds the real app (`com.bunsandpatties.app`). That one is
never uploaded to Samil's team, because a bundle id locks to the first team that
uploads it.

**Testers:** the owner joined as an internal tester (Marketing role, access to this one
app) with automatic distribution on, so there is no Apple review and every new build
reaches him by itself. Burak joins the same way when he has his Apple ID in. Builds
expire after 90 days.

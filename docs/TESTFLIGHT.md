# TestFlight

**How:** Samil pastes the first line of [SAMIL.md](../SAMIL.md) into Claude Code on his
Mac. His Claude builds, signs, uploads and walks him through inviting the owner.

**Why Samil's account:** his existing $99 membership covers it. Nobody else buys one to
test. The owner buys his own Organization account only for the real App Store release
(Apple rule 4.2.6: template-built apps must be submitted by the business itself).

**Which app:** a plain clone builds **B&P Test** (`com.bunsandpatties.app.preview`). It
runs on the test database on the phone: pretend orders that are kept between launches,
and **Account → Test controls**. `APP_VARIANT=production` builds the real app
(`com.bunsandpatties.app`). That one is never uploaded to Samil's team, because a bundle
id locks to the first team that uploads it.

**Testers:** the owner joins as an internal tester (Marketing role, access to this one
app), so there is no Apple review. Builds expire after 90 days.

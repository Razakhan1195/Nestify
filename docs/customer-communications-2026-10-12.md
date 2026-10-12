# Customer communications finish — October 12, 2026

This increment follows customer-auth-finish-2026-10-12.md (checkpoint 192b630). It completes the next engineering slice for a combined founder test. It is staging engineering evidence, not launch or physical-device acceptance.

## What changed

- New verified mobile customers receive a separate branded welcome after opening the signed-in, unlocked app. The rollout cutoff prevents backfilling old accounts. Both password and social-created accounts use the same server eligibility check. Web-only signup does not currently trigger this separate welcome.
- One service-only database record per user stores the immutable email payload, original provider idempotency key, attempts and outcome. Concurrent requests cannot claim two live sends. Retry uses the same payload/key within 23 hours, with five-minute backoff and at most five attempts. Unknown outcomes stop automatically after the safe retry window; an accepted response is not proof of inbox delivery.
- Account deletion holds cover in-flight email operations, and delivery records cascade when the account is removed. Changed recipient addresses suppress an outstanding old welcome. Email failure never blocks app entry.
- Eleven remaining Supabase authentication/security email templates now have Rezlee branding. Together with the prior confirmation/recovery templates, this covers the full 13-template Supabase family. Magic-link OTP and email-change placeholders are preserved.
- Password-changed security notices are enabled on staging. The other six security switches remain OFF until their customer flows are supported and accepted. Template branding does not enable those flows.
- Email continuation uses a hosted /open page with an explicit Open Rezlee button and web sign-in fallback. Expo Go users can switch back to the already-open app. Native scheme behavior still requires a signed build.
- Notification taps now ask the server for the current account-owned destination. Removed, expired, handled or inaccessible updates return a clear inbox explanation; obsolete owned updates are retired so they do not return after refresh. A read-receipt failure no longer blocks opening the saved record.
- Push responses wait until app unlock and required recovery/onboarding navigation are complete. Duplicate taps are coalesced. Late responses from a previous account cannot navigate the new account. Older pushes without an inbox ID open the current account inbox.
- Inbox state is isolated by account. Overlapping pages deduplicate by notification ID, and a late page cannot overwrite a newer refresh.

## Verification

- 924 regression tests passed, including new SQL lifecycle and delivery-controller tests.
- 20 actual-component rendered scenarios passed at 320/390 widths: read-receipt failure, missing record, offline retry, account switch, duplicate pagination, password-recovery navigation, app lock, duplicate pushes, late old-account push and welcome retry coalescing.
- 24 email layout/link checks passed across the eleven templates plus the welcome, at 320/390 widths. Welcome and inbox screenshots were visually inspected.
- 23 final hosted staging checks passed using disposable accounts, synthetic records and reserved .invalid addresses, including obsolete-update retirement. Exact cases are recorded in docs/qa/customer-communications-20261012/hosted-results.json.
- Web/mobile types, scoped lint, Next build and native iOS/Android exports passed; final gate logs are archived with this checkpoint.
- Staging deployment build authenticated the existing Resend SMTP sender without sending a message. All eleven hosted template bodies were read back; browser redaction prevents programmatic comparison of some subject fields. The password-change subject is visible in the saved preview.
- No test email, SMS or push was sent. No real household records were edited; temporary QA accounts and their dependent records were removed. No paid AI/provider calls or recurring jobs were started.

## Deployment and rollback

Staging Supabase: gjwvalpxnfbvryosmcbj. Applied migration 202610120001_welcome_delivery and recorded migration history.

Staging API: https://staging.rezlee.com. Deployment identity, cutoff and isolated snapshot are in docs/checkpoints/customer-communications-20261012/deployment.json. The snapshot derives from the previously deployed inventory/auth build and overlays only the new welcome, notification-open and /open server paths. Crons remain empty. Production unchanged.

The welcome gate is REZLEE_WELCOME_ENABLED=true for this staging deployment, with the recorded REZLEE_WELCOME_START_AT cutoff. Keep the cutoff stable across redeploys. Never move it backward to send welcomes to old users.

Rollback the API alias to https://nestify-jc17bwdp2-razakhan1195s-projects.vercel.app, or deploy with the welcome gate disabled. Turn OFF staging Password changed to restore its previous switch state. Previous template bodies are in hosted-email-rollback.json; redacted old subject placeholders must never be applied as literal subjects. The migration is additive and may remain with sending disabled. Do not drop delivery history to retry mail.

The inherited source tree remains dirty. This milestone uses the established scoped before/after archive and diff checkpoint instead of sweeping unrelated work into a commit.

## Combined founder test — when ready

Use staging Expo Go on 8081 and reload. Existing TestFlight binaries do not acquire these client edits.

1. Returning account: open Home, Bills, Vault and Care. Confirm the former Home duplicate-key warning is gone and saved records remain sensible. No new welcome should be generated for an existing account.
2. Password recovery: request the branded reset email, enter its code on the requesting phone, set a new password and sign in again. Check the new branded password-changed notice. Repeat with a wrong/used code and an app interruption; there should be a clear recovery path.
3. Fresh account: use an inbox you control, confirm signup, then open the signed-in app. Check one welcome, a useful Open Rezlee continuation and no duplicate welcome after reload/sign-out/sign-in.
4. Notifications: open the bell, tap an update, switch accounts and return. Old-account updates should not carry over. A removed/expired update should explain what happened; a temporary connection failure should be retryable.
5. Signed native build later: repeat cold-start/locked-app notification taps, OS permission/push delivery, recovery deep links and social-auth return on iOS and Android. Expo Go is not acceptance for native push or universal-link behavior.

Record device/build, expected behavior, actual behavior and any screenshot. Inbox delivery, spam placement, sender authentication headers and actual native handoff remain unaccepted until observed.

## Remaining order

Apple/native auth configuration and acceptance remain open. The next independent engineering pass is connected-account deletion/revocation and truthful completion receipts, then operational budgets/monitoring/support and a signed release candidate. Existing physical acceptance, household two-device behavior, utility pilots, bill usefulness/outcomes, native capture and home-AI gates remain on the audit; none is closed by this communications work.

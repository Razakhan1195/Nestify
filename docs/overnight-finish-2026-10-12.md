# Rezlee overnight finishing checkpoint — October 12, 2026

**Consolidated staging candidate delivered for testing. Overall launch is not signed off.** Use [the morning checklist](morning-testing-2026-10-12.md); the operational/owner gates are in [launch operations](launch-operations-2026-10-12.md).

## What changed

- Account deletion receipts are durable per account, survive restarts and partial storage writes, and cannot be erased by another account's completion.
- Password reconfirmation is isolated from the main session. Late responses, unmounts and account changes cannot submit deletion for the previous account. Completion clears the account's pending recovery/draft state.
- Deck disconnect stops imports before vendor cleanup, verifies session/credential ownership, retains cleanup references on failure, offers Finish disconnecting, and blocks stale verification/reconnect work during cleanup. Existing bills remain.
- Persistent Deck sessions are explicitly ended during deletion. Active task cancellation and credential deletion are scoped to the verified owner. Unknown ownership and ambiguous vendor results do not count as revocation.
- Expected hosted-sign-in expiry waits preserve the deletion failure budget. Operations labels a future scheduled wait honestly rather than raising a false failure alarm.
- A real staging check found eight-digit email OTPs. Sign-in and deletion now accept them; both native profiles, Expo and the backend have matching email-code flags.
- Cloud deletion recovery runs every five minutes, using a purpose-specific expiring signature generated from the existing protected scheduler secret. The raw long-lived secret is not queued in HTTP headers.
- Newer feature tables now inherit deletion read/write protections: quote reviews, cleaning routines, notification preferences, outcome/revision records, import/recovery receipts and related tables. A full-schema guard assertion catches future omissions.
- Foreign-key unlink cleanup remains possible without allowing ordinary late customer writes. The final regression found bill-history recreation during original-file unlink; the added cleanup migration prevents that history write for a deleting account.
- New iOS 25 and Android 19 builds contain the accumulated October 8–12 customer-facing work, including prior Home duplicate-key, auth recovery, branded communications and Hark-inspired connection introductions.

## Verification

| Layer | Result and limit |
|---|---|
| Regression suite | **951 passed, 0 failed** after final fixes. Includes full-schema migration replay, private ownership, bill originals/history and deletion guards. |
| Static/build checks | Root and mobile TypeScript, scoped lint, production-mode staging build and iOS/Android native exports passed. Final operations-only change passed root types/lint and hosted build. |
| Actual-screen rendering | **28** deletion/email-code and **8** provider-disconnect scenarios at 320/390 widths. Real components; device/auth/network boundaries mocked. |
| Live deletion acceptance | **29** checks against deployed staging Auth/routes/RLS/storage with disposable accounts, including wrong-account denial, active-operation delay, durable retry, eight-digit OTP, original/history cleanup and preservation of another household. |
| App-closed recovery | **5** checks: live cron/HTTP worker completed an accepted fixture without any app/status requests; identity, home and bytes removed; saved receipt still worked on return. |
| Operations | **6** no-send checks: live bounded shared budget, actual PostgREST attention filter, fixture cleanup and anonymous denial for operations/worker/deletion. |
| Existing journeys | Fresh **94** bill-outcome, **23** phone-invitation and **30** one-quote hosted checks passed. No paid model/provider calls. |
| Native packaging | EAS archive inspected: 921 runtime files, zero environment/signing files. Both builds finished; Apple delivery verified separately below. |
| Expo | Restarted on 8081. Actual iOS bundle contains the staging API and correct staging Supabase host; LAN exp://10.0.0.13:8081 at verification. |

No manual customer test emails, SMS, push, model requests or paid provider retrievals were sent. Disposable accounts, uploads and deletion receipts were cleaned up. These layers do not establish physical phone behavior or live vendor revocation.

## Deployment and build delivery

- Staging alias: https://staging.rezlee.com
- Final backend: https://nestify-5fhilaf3o-razakhan1195s-projects.vercel.app
- Immediate rollback: https://nestify-gzvrtlzne-razakhan1195s-projects.vercel.app
- Pre-overnight backend: https://nestify-o77apow4z-razakhan1195s-projects.vercel.app
- Staging migrations 202610120002, 202610120003 and 202610120004 installed and verified.
- Deletion and email-code gates ON. Welcome remains ON with unchanged cutoff **2026-10-12T03:18:56.180803+00:00**.
- Shared AI request caps remain 200/day and 3,000/month. Utility recurring pulls and recurring Gmail discovery remain OFF. Existing customer-started import recovery is separate.
- **iOS 0.1.0 (25)** — EAS c4446a78-3598-4bb3-a7bf-e9c42ff795c5, FINISHED. Submission 6a4f801c-b315-483e-b0a8-77c0369da70a FINISHED. Apple build c68ada9f-35bf-4d1f-b9b0-3bc2cfdc3e93 VALID / IN_BETA_TESTING for internal testers. External state READY_FOR_BETA_SUBMISSION; no public release.
- **Android 0.1.0 (19)** — EAS 7ff86c76-6374-4809-9032-18f2fa962e02, FINISHED. [Download APK](https://expo.dev/artifacts/eas/bHT7BG7MlUEwir2zAZQTpZNiZiF7347QmYkix_1heS8.apk).
- Expo Go is **8081**, not 8082. Email sign-in works there; native OAuth, OS links and notifications need the installed native build.

## What still requires completion

1. **Apple sign-in:** actual staging provider is disabled with empty Client IDs/OAuth-secret fields. Existing client source and App Store submission credentials do not configure Sign in with Apple. Developer-service setup, token-revocation lifecycle and real native/private-relay acceptance remain.
2. **Physical acceptance:** email inbox/reset handoff, native OAuth, welcome/security mail, camera/HEIC, OS interruption, push and two-device household/invitation behavior. User has not yet supplied acceptance results.
3. **Provider reliability:** real consented Green Button/Deck/Gmail reconnect, grant revocation and provider-specific login/MFA/import/freshness. 54 Ontario Green Button and 29 configured Deck testing entries are not 83 accepted providers. Rogers is paused; 639 entries show Coming soon.
4. **Usefulness and broader scope:** customer acceptance of bills/outcomes, repair and one-quote review. Multiple-quote comparison and evidence-backed compatibility/repair-versus-replace are still unfinished, separate engineering increments.
5. **Production readiness:** real backup/restore rehearsal, approved dollar budgets, alert/support ownership, production configuration, identity/privacy/OAuth/store approval and a production-pointing release candidate. See the concrete gates in launch-operations-2026-10-12.md.
6. **Deliberately later:** native sharing, voice, weather/AQHI, perks and broader benchmarks.

## Evidence and preservation

Base source checkpoint **ef008c0**. Scoped manifest, before/after ZIPs, diff, deployment/build records and hosted results are under **docs/checkpoints/overnight-finish-20261012**. Rendered evidence is under **docs/qa/deletion-recovery-20261012** and **docs/qa/provider-disconnect-20261012**.

The inherited dirty source is preserved. No blanket reset, stash, source commit or production release. Database guards are additive; backend rollback is not a data restore. The exact source bundle is recoverable from the scoped after archive, and the previous version of each edited file is retained separately.

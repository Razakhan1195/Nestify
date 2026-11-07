# Customer roadmap and realtor gifting release

**Superseded web access policy:** Customer web access was retired later on 7 November. See [customer-web-retirement-20261107.md](customer-web-retirement-20261107.md). /roadmap now opens the mobile app; the web board and customer browser login are no longer available.

Updated 7 November 2026. Backend deployed; iOS 0.1.0 (83) available for internal TestFlight testing. Android 0.1.0 (67) built and inspected; its Google Play upload is pending because the connected Mac is locked. No public store release or store-review submission.

## Customer experience

- In the app: Account → Rezlee roadmap. Public web: https://rezlee.com/roadmap.
- Customers can submit an idea, choose a topic, and opt into publishing it. A suggestion remains private to its author and the team until reviewed.
- Customers can upvote, downvote, change or remove their vote. One vote per account. Search, status filters, sorting and pagination are available.
- “Your ideas” shows the submission, response deadline, decision, priority and team explanation. The commitment is a response within seven calendar days, not delivery within seven days.
- Private bug reports remain separate from public suggestions. Names and email addresses are not published.

## Team operation

Open https://rezlee.com/admin/roadmap with an existing authorized operator account. Review the queue daily, starting with overdue and oldest undecided submissions. Decide whether to publish, choose a status, enter a plain-language explanation, and set Next or Later when planning work. Update the same idea as work starts and ships. The queue records decisions and revision conflicts; it does not generate decisions or promise delivery dates automatically. Meeting the response commitment still requires a team member to review the queue.

The current public board is intentionally empty until actual customer suggestions are reviewed. No test ideas were published to production.

## Realtor fulfilment

Realtor gifting remains an operator-assisted service at /admin/annual-gifts, not a self-service realtor dashboard or checkout. Record the realtor, recipient email, order reference and required consent together. The ledger supports status filtering, pagination and cancellation of unused invitations with a recorded reason.

A verified recipient must claim with the invited email address. An unclaimed invitation lasts 30 days; the 365-day gift starts on successful claim. Repeated claims do not start duplicate gifts. Wrong-account, expired and cancelled invitations are handled explicitly. Gift access does not grant the realtor access to the customer's household or records. Expired gift receipts no longer say Pro is active. Membership refresh after claiming cannot be overwritten by an older pending request.

The existing production gift feature flag was enabled for this release. No customer invitations, payments or emails were sent during verification.

## Evidence

- Backend code: 8464fe251b2095b8bff8d40b9e716710c7a1bf55; live deployment dpl_ALQtVnQ8ndnePRtXxM6VP2ASCNaR.
- Mobile release code: ec83db94eaffaff7bda8d1d367606059d1b51929; mirrored under apps/mobile in this repository.
- Recovery commit 50b13ba381b3a8358ebd60bcfe8391a57df95252 is an ancestor of the mobile release.
- Four additive migrations, 202611070001 through 202611070004, applied transactionally in staging and production. Account/session checks, deletion cleanup, vote constraints and staff-only review are enforced in the database.
- Regression suite: 1,467 passing, zero failures. Mobile type checking passed. Scoped lint: zero errors, three pre-existing warnings.
- Staging: 28 authenticated integration checks and 12 browser journeys passed, including privacy, voting, publication, decision visibility, wrong-account gifts, expiry, cancellation and repeat claims.
- Native simulator: roadmap submission/voting, light/dark appearance, gift active/expired states, offline messaging and retry passed in staging.
- Build 83 JavaScript extracted from the inspected IPA ran in an iPhone 17 Pro simulator with the same native dependency fingerprint. Production review-account checks passed for Home, Bills, Vault, Care, Notifications, Expenses artwork, expense groups, bulk Care dismissal and Undo, membership, live roadmap and its submission form.
- Three cold launches reached populated Home data without refreshing in 3.254, 2.838 and 2.855 seconds (median 2.855). These XCTest measurements include launch/quiescence waiting; they are simulator measurements, not physical-phone timings.
- Lifetime-Pro ownership/inheritance and cache-refresh behavior passed automated tests. The production review account has time-limited Pro; its display is not evidence of a physical lifetime-Pro purchase or restore.
- iOS and Android binary inspection passed: signatures, production API/auth endpoints, no staging database, required recovery/roadmap markers, Expenses artwork and runtime fingerprints. iOS upload finished; Apple processing VALID and internal state IN_BETA_TESTING.
- Apple draft now selects build 83 with manual release. Google Play internal testers currently have build 66 until build 67 is uploaded. Its existing production draft must not be submitted with the older build.

## Test environment correction

Local simulator exports initially retained staging transform values despite a production environment and reset-cache argument. Runs 057–074 are excluded from production and timing conclusions. They exposed a staging feature-flag response, not a proven production Notifications defect. The final production pass used the actual inspected build 83 JavaScript, whose bundle contains no staging database. Future release checks should use the inspected artifact or verify every embedded endpoint before testing.

## Remaining acceptance

Physical iPhone/Android purchase and restore, lifetime-Pro presentation on the entitled account, external provider sign-in, and physical-device startup still require installed-device acceptance. No claim of zero defects or passed physical-phone performance is made. The Mac must be unlocked for the remaining Google Play browser upload.

## Checkpoint and rollback

Evidence and resumable release scripts are retained on the connected Mac in /Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/roadmap-b2b-20261107. Do not publish that directory: it contains private test configuration and signed-artifact URLs.

The previous backend deployment is dpl_EJYXaKYwjXKgwujQef1HwXd5fHEH. If necessary, reassign rezlee.com to that known deployment after checking the current alias. Preserve the additive tables and customer submissions; do not drop migrations to roll back the application. No rebuild is needed to resume the Android 67 upload; use the inspected artifact and recheck its SHA-256 before upload.

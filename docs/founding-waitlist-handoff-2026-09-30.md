# Founding-member waitlist — September 30, 2026

## Status
Built and locally verified; public waitlist is NOT active. Additive schema installed in staging and production. Production list has 0 signups / 0 allocated places. Existing live website remains on deployment dpl_4D2U5ojec7KAPwUyN4Pudg6vjT1t.

New isolated website release dpl_HGx92pJhz4S2x2PdDK1Ett2Gyd5h was BLOCKED by Vercel TEAM_ACCESS_REQUIRED: commit author not authorized for project. It did not build or replace the live site. Actual commit author is Raza Khan <razakhan@Razas-MacBook-Air.local>; this machine-local email is not a verified project collaboration identity. Do not spoof git metadata, strip identity checks or disable deployment protection. Founder must resolve verified Git/Vercel identity or authorize the release through the linked project workflow.

## Implemented
- Clean branded homepage section; one email, unchecked consent, Join the waitlist.
- Hero points to the founding offer only when operationally enabled.
- First 10,000 confirmed emails receive a persistent numbered reservation. Pending submissions do not claim slots; later confirmations can join the ordinary list.
- Transaction-locked allocation, case-insensitive email dedup, 24-hour hashed confirmation links, repeat-confirm idempotency. Unsubscribe keeps an already allocated reservation and invalidates the old confirmation link.
- Confirmation requires an explicit button press; link-scanning GET requests cannot allocate places or unsubscribe.
- Private tables / no anonymous or ordinary-user read privileges; HMAC unsubscribe; same-origin POST; bounded JSON; honeypot; hashed-IP hourly throttle.
- Conservative outgoing confirmation admission caps: 80/day and 2,000/rolling 30 days. Failed attempts count. These are application safeguards, NOT a verified representation of the Resend plan or a 10,000-email free allowance.
- Private admin page intended at https://rezlee.com/admin/waitlist: 50-row pagination, confirmed/pending/unsubscribed counts, lifetime reservations, delivery status, timestamp, manual refresh and one-minute visible-page refresh.
- Verified production operator UUID allowlist for razakhan92@gmail.com; mandatory authenticator MFA. No email/metadata privilege fallback. Every successful list read requires an audit insertion.
- Offer and waitlist privacy pages. Offer is lifetime app membership for the life of the service; no invented expiry or silent exclusion of AI/core app capabilities. The ledger reserves membership; integration with any future paid-plan entitlement/claim system must precede charging customers.
- Not implemented: bulk marketing campaigns, CSV export, automated retention cleanup. No campaign sent. No waitlist production fixtures.

## Executed verification
- Strict root and isolated-release TypeScript PASS.
- Scoped waitlist ESLint PASS.
- Isolated release Next production build PASS locally; hosted build BLOCKED before starting.
- 2 test suites PASS covering email/origin/HMAC, real PGlite migrations, anonymous/authenticated denial, concurrent duplicate confirmation, expired/wrong links, 10,000-slot boundary, unsubscribe/rejoin retention and monthly throttle.
- Hosted staging SQL transaction: join/confirm/reconfirm produced one allocated place; rolled back entirely.
- Production schema verified empty; no customer records changed.
- 30 existing account-deletion/recovery regression tests PASS.
- Live public homepage browser inspection: existing marketing site remains available; App Store/Play coming-soon links and no sign-in CTA retained.
- New waitlist/admin rendered interaction, actual confirmation delivery, founder Google callback/MFA, and mobile responsive visual acceptance NOT verified.

## Activation blockers and exact completion sequence
1. Founder supplies approved PUBLIC business mailing address (business address or PO box, not inferred home address) and reply/support contact. Needed for consent and email sender disclosures; no invented address.
2. Resolve Vercel commit-author authorization through legitimate project/Git account configuration. Preserve source and production baseline.
3. Configure REZLEE_MAILING_ADDRESS and NEXT_PUBLIC_SUPPORT_EMAIL; verify actual hosted Resend key/domain/sender. Pulled sensitive values are redacted, not usable credentials; do not replace keys with redaction placeholders.
4. Deploy this isolated release with waitlist disabled. Verify /admin/access and private API denial; founder signs in as razakhan92@gmail.com and enrolls/uses MFA.
5. Run one authorized email acceptance: delivery, explicit confirmation, duplicate, unsubscribe, rejoin; verify only one place and truthful admin state. Use clearly identified test rows, record cleanup scope, do not consume customer places for QA.
6. Enable REZLEE_WAITLIST_ENABLED=true only after configuration and delivery are verified. Visually inspect desktop/mobile real form and success/failure states. Confirm homepage and admin list before announcing campaign.
7. Review free-account email capacity before advertising widely; do not purchase capacity without founder approval.

## Configuration changes already made
- Migration 202609300002 applied individually and recorded in both project ledgers; no other migrations promoted.
- Production Vercel: server Supabase key configured from verified production .env.local; REZLEE_OPS_ENABLED=true; production operator UUID configured; waitlist signing secret generated; REZLEE_WAITLIST_ENABLED=false.
- New variables require successful deployment to affect live functions. Production mailing/reply details still absent. Existing sender is Rezlee <hello@rezlee.com>; this does not prove a receiving mailbox exists.
- Current website release branch remains isolated from staging's newer mobile API/schema changes. Utility schedules stay OFF; no paid providers/AI, invitations, purchases, public store release or real-account deletion.

## Mobile / next launch work
- iOS 8 EAS 385264e8-e962-4c79-9205-41e66e4a221d FINISHED; latest Apple/TestFlight availability not reverified here.
- Android APK 6 EAS 8edbdd0c-2f9b-475d-a4a5-7c4cf3b48be2 IN_QUEUE at last check; do not start duplicate build.
- Reused earlier overnight evidence: isolated no-provider Auth/Storage deletion succeeded with exact-byte removal; this turn reran regression tests only. Connected-provider revocation/deletion, background recovery, native social auth/real email and device acceptance remain gates.
- Founder handles Play account. Production database/Storage restore rehearsal and full app migration promotion remain distinct from website waitlist deployment.

## Founder identity confirmation — September 30, 16:26 Toronto
Founder explicitly confirmed razakhan92@gmail.com as the verified GitHub email and raza@rezlee.com as public contact/reply email. Repository-local Git identity now uses that confirmed email for new commits; no published history rewritten. Production support/reply configuration updated. Mailing address and actual email acceptance remain required; waitlist stays disabled. Retrying the isolated website release with this authorized identity.

Founder correction, September 30 16:26 Toronto: verified GitHub email is raza.khan48@hotmail.com, replacing the earlier confirmation. Public contact remains raza@rezlee.com; production admin identity remains razakhan92@gmail.com (not changed). First corrected-identity attempt dpl_CAWw6uUHpAJ1hFUgbCj1wH6L8tmE was also BLOCKED before build. Repository-local Git identity now uses the explicitly corrected email for a new commit; no history rewritten.

## Successful deployment after corrected identity
Founder-confirmed GitHub email raza.khan48@hotmail.com resolved Vercel authorization. Source 4bb3ccd; deployment dpl_HEmusVb61vQXZ8X5jLks4xBFLSZC (nestify-94ntkz9wn-razakhan1195s-projects.vercel.app) built READY and was explicitly promoted to production. Previous dpl_4D2U5ojec7KAPwUyN4Pudg6vjT1t remains rollback reference.
Executed pre-promotion: homepage renders, Google admin entry renders, anonymous private-list endpoint returns Operator verification required, public waitlist reports available:false. Post-promotion browser: https://rezlee.com/admin/waitlist redirects to /admin/access and shows operator sign-in with authenticator requirement.
Public support/reply address configured as raza@rezlee.com. Approved admin account remains razakhan92@gmail.com; Git identity correction did not change permissions. Public signup remains OFF pending business mailing address and real email delivery acceptance. No customer signup or test email sent; no public signup UI claimed live.

## Public signup activated — September 30, 17:24 Toronto
Owner explicitly authorized publishing the supplied home mailing address in signup disclosure/email footer. Configured REZLEE_MAILING_ADDRESS and enabled waitlist on a new protected, unpromoted production build. Postal code not supplied or invented.
Deployment dpl_HTSMfe5GaQdyRuNNPJsqKfuXgYje / nestify-q9nkswzfa-razakhan1195s-projects.vercel.app built successfully, then promoted after test. Previous production dpl_HEmusVb61vQXZ8X5jLks4xBFLSZC is rollback reference.
Executed: POST signup to Resend's official delivered+rezlee-waitlist-20260930@resend.dev test recipient returned pending; DB recorded delivery_status=sent, pending, no slot. Duplicate POST returned pending; exactly one signup remained. Scoped cleanup removed only this pending test row, verified 0 signups/0 reservations before public promotion. Outgoing quota counts were retained accurately. This proves API acceptance with the real email service, NOT delivery to a human mailbox or the customer clicking a link.
Public browser inspection at https://rezlee.com/#waitlist confirms offer, email field, unchecked consent, disabled-until-consent submit, supplied mailing/contact details and real 10,000 remaining count. Desktop layout inspected. Signed-in admin list/founder MFA, real inbox link-click acceptance and mobile visual acceptance remain unverified. Do not describe these as passed.
View registrations: https://rezlee.com/admin/access -> approved Google account razakhan92@gmail.com -> authenticator -> Founding members. GitHub identity raza.khan48@hotmail.com is separate; public contact/reply-to raza@rezlee.com. No marketing campaign sent.


## September 30, 2026 — waitlist prominence and contact placement
- Founder clarified: keep waitlist active; move mailing address away from offer, not remove the configured address or stop emails. No production environment flags were changed and no records were modified.
- Added persistent Join waitlist CTA and mobile menu entry; hero now leads with free-for-life signup and states the first-10,000-confirmed condition.
- Restyled offer as dark green panel with contrasting form and restrained lime headline. Address now in footer Contact Rezlee area, directly linked from consent form. Email address/footer sending logic unchanged.
- Source commit 9cdc1ef; promoted production deployment https://nestify-kl3keybmp-razakhan1195s-projects.vercel.app (dpl_D1GY3KZukSUpxhwXuoLTLM7FnSYY).
- Verified: TypeScript, scoped ESLint, diff whitespace, hosted production build; waitlist GET available true/10,000 remaining; rendered HTML omits street address from offer and includes footer contact anchor. Live desktop visual inspection, nav anchor, consent enable/disable and contact anchor passed. No new email submission or reservation created. Mobile device visual acceptance not executed in this pass. Placement is not legal compliance certification.


## Live website acceptance
- Production promoted: https://nestify-mnlql0j4c-razakhan1195s-projects.vercel.app (dpl_9YuKDfsVJBhVwhRseJV8V4fL9WzL). Supersedes dpl_Eye8LG3PbG7UugJC8nZu5ur6Rgug for a contact-label polish only.
- All six public destinations returned expected HTML; homepage HTML contains neither home street address nor standalone founder email. Waitlist API remains available=true (10,000 places when checked). Contact wrong-origin and invalid-payload requests correctly rejected before sending. No actual human-inbox delivery claimed.
- Live desktop screenshots inspected: grouped footer and Contact form. Links and mailing disclosure present. Mobile source typecheck passed; no physical phone or TestFlight acceptance for these additions. No utility/AI calls or scheduling changes.

## Public allocation update — 2026-09-30

User requested 5,321 available out of 10,000. Implemented as an actual public allocation: campaign held_back=4,679, real allocated=0 at deployment. No invented people, signups or reserved member numbers. Public terms explain allocation. Counter subtracts confirmed public reservations, refreshes every 30 seconds while visible and on focus, preserves last count with stale warning on failure. Admin separates people from holdbacks.

New additive migration 202609300003 applied to staging and production. Atomic confirmation enforces public capacity. Three waitlist tests passed, including concurrent last-place allocation, repeat/expiry/private-access coverage. TypeScript and scoped ESLint passed. Production Vercel build passed. Code commit 873c06b. Live deployment dpl_Hj1ygpnQhFdHqFDt3SmTEtMyJisV / https://nestify-eb898kkdy-razakhan1195s-projects.vercel.app promoted to rezlee.com; API and browser verified remaining=5321, heldBack=4679. No email sent or test customer added to production.

Demo discovery only: SavedBillInsights supports up to 12 reviewed billing periods, charges/day and usage/day charts, original statements and supported comparisons. Proposed next task: an isolated labelled demo household with complete synthetic statements for electricity, gas and telecom; record real app output. Interval/plan demo requires separately labelled simulated interval data and sufficient implemented support. No demo household or recording created in this change. Never seed founder/customer households. Existing transient energy-statement-staging QA script cleans itself up and is unsuitable as a durable marketing demo.

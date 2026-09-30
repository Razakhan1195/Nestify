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

# Household and shared-expense invitation recovery — 2026-10-08

## Root cause and correction
The existing TestFlight app uses staging.rezlee.com. Both the Household invite and shared-expense participant invite POST to `/api/mobile/v1/household`.
A disposable staging self-invitation probe reproduced HTTP 503, `Household invitations are temporarily unavailable.` The retained deployment settings explicitly supplied an empty RESEND_API_KEY, overriding the secret already configured in Vercel. No invitation member or email is created at that readiness gate.

Deployed the exact prior staging source snapshot with that empty override removed. Vercel's existing email secret and sender are inherited. An isolated build-time SMTP authentication check passed without sending MAIL, RCPT or DATA. The Next production build passed. Removed only empty email overrides from five retained staging settings files so future deployments inherit the project settings; mode-0600 configuration backups remain beside their originals. No credentials were rotated or printed.

Staging now points to https://nestify-pl2jzc8bt-razakhan1195s-projects.vercel.app. The first check immediately after alias assignment still reached the old unavailable state; after propagation the same API check passed. Shared-expense invitation also passed readiness and correctly rejected an invalid participant before any email was sent.

## Preserved
No changes to mobile screens, app navigation, membership permissions, expense calculations, private Bills/Vault access, provider connections, database schema, customer records or production website. No new TestFlight binary is required. Existing acceptance/expiry/cancellation behaviour remains intact. Scheduled provider pulls remain off.

## Verification
- Seven focused invitation/email/database unit tests passed.
- 31 hosted household-invitation checks passed using disposable staging accounts: new and existing recipients, explicit acceptance, original name preservation, invalid/expired/reused links, cross-origin rejection, wrong-recipient denial, household-conflict protection, concurrent acceptance and cleanup.
- 30 hosted shared-expense checks passed: guest balance before joining, pending access denial, stable participant identity, no duplicate person on acceptance, retained history/balances, cancellation/reinvite, recorded repayment, removal and revoked access.
- Invitation SMTP authentication passed; this is credential verification, not inbox delivery.
- Live readiness probes passed for both entry points. No messages, paid provider calls or AI calls were made. Disposable fixtures were removed.
- Physical TestFlight taps, recipient inbox delivery, email client behaviour and the final app deep link were not newly verified.

## Customer acceptance
In the existing TestFlight build, open Household → Invite someone, or Bills → Expenses → People and invite the intended person. Send once. Recipient opens the Rezlee invitation, reviews it, explicitly joins and returns to Rezlee. The sender should see Joined after refresh. Existing shared-expense balances should remain with the same participant. Inviting alone never grants access.

Phone invitations retain the existing Messages compose/owner-approval journey; no SMS delivery service was enabled by this correction. An existing owner of another household still cannot silently join a second household.

## Rollback and checkpoint
Previous staging deployment: https://nestify-3tg9w0v69-razakhan1195s-projects.vercel.app. Reassign only staging.rezlee.com to that deployment to roll back. It restores the prior invitation outage too. Source HEAD at start: a621d32edfda2e695f5081872a0c9991db799805; 792 pre-existing dirty/untracked entries were preserved, not reset or swept into this change.
Scoped artifacts and acceptance evidence: `docs/checkpoints/household-invites-20261008/`. Operational checks: `scripts/qa/invitation-email-auth.mjs` (no email sends) and `scripts/qa/invitation-readiness-staging.mjs` (disposable staging-only validation). The isolated release folder is `/tmp/rezlee-household-invites-staging-20261008`.

Future staging deployments must not explicitly override RESEND_API_KEY or RESEND_FROM_EMAIL with empty/redacted placeholders. Run the sender check in the protected build environment and the no-send staging readiness check after alias propagation.

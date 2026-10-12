# Rezlee — operational readiness, October 12

This is a staging readiness record, not production approval. Current checkpoint: overnight-finish-20261012.

## Verified now

- Staging backend: https://nestify-5fhilaf3o-razakhan1195s-projects.vercel.app, aliased to https://staging.rezlee.com.
- Immediate backend rollback: https://nestify-gzvrtlzne-razakhan1195s-projects.vercel.app. Earlier pre-overnight backend: https://nestify-o77apow4z-razakhan1195s-projects.vercel.app.
- Installed staging migrations: 202610120002 (recovery dispatcher), 202610120003 (newer-feature deletion guards), 202610120004 (bill-history cleanup during deletion).
- The cloud scheduler runs accepted deletion recovery every five minutes. Live app-closed acceptance removed a disposable identity, home and uploaded bytes without mobile status polling; its saved receipt remained usable afterward.
- Scheduling uses a short-lived, purpose-bound signature. Raw scheduler credentials are not placed in the HTTP queue. Customer roles cannot invoke the dispatcher. Unauthenticated worker, deletion and operations endpoints return 401.
- Two deletion jobs at most are processed concurrently. Known expiry waits preserve the retry budget. Ambiguous provider ownership/revocation stays pending for support; it never counts as completed.
- Operations still requires the existing enabled flag, exact operator allowlist, MFA and access audit. Diagnostic projections omit credentials and customer bill/mail content. Expected future deletion waits no longer trigger false failure attention.
- Durable shared AI admission is enabled with **200 requests/day and 3,000/month**. Existing ordinary per-user limits are 40/rolling day and 500/rolling month; Gmail's separate allowance is 100/day and 500/month within the shared cap. Missing admission state fails closed. The in-memory limiter is only an additional guard.
- AI and statement reading are enabled in staging. This pass made no paid model/provider requests and did not raise any limit.
- Recurring utility pulls and recurring Gmail discovery remain off. Existing pending Gmail/Deck import recovery, notifications and the new accepted-deletion dispatcher are distinct from recurring discovery.
- iOS 25 is VALID / IN_BETA_TESTING for internal testers; Android 19 APK is built. Neither is a public production release.

## Operating an interrupted deletion

1. Start from the customer's safe request reference and the MFA-protected operations console. Do not request passwords, OAuth tokens, mailbox content or full bill payloads.
2. Check whether the job is a scheduled wait, transient retry, active lease or needs_attention. A future expiry wait should continue automatically; do not reconnect or reset the journal.
3. For a stale queue, check the staging scheduler's last execution, HTTP status and sanitized worker logs. A scheduler SQL success only proves dispatch; the live worker result and job state establish completion.
4. For ambiguous grant/session ownership or vendor revocation, verify the matching resource with the provider under the approved support process. Never mark it revoked solely because a local row is disconnected or a vendor response is ambiguous.
5. Preserve the original job/receipt identity when resuming. Do not delete the identity or files before the worker's connection and storage gates. Completion receipts expire after 14 days.
6. For a widespread defect, pause new deletion entry with the deployment gate while preserving the journals, investigate in staging, and resume the same accepted work. Do not reset customer data or treat a backend rollback as a database restore.

## Concrete public-launch gates

| Gate | What must be evidenced | Current boundary |
|---|---|---|
| Apple identity | Configure the correct service/client IDs and signing secret; accept native return, private relay, duplicate-account linking and revoke-on-deletion lifecycle | Staging Apple provider is disabled; observed Client IDs and OAuth secret fields are empty. Existing App Store submission credentials are not Sign in with Apple setup. |
| Device communications | Real confirmation/reset/welcome/security mail, push registration/delivery, locked/signed-out destinations, two-device invitations | Branded templates and no-send checks exist. Founder/device/inbox acceptance remains. Password-changed security email is ON in staging; the other six security-event switches remain OFF. |
| Provider pilot | Consenting customers validate login/MFA, first and repeated data, freshness, reconnect and revocation for each offered provider | 29 Deck entries are configured for testing; Rogers paused. Configuration is not reliability proof. Green Button remains preferred for eligible Ontario energy services. |
| Cost decision | Owner-approved monthly and per-feature dollar budgets, provider/model price assumptions, hard stops and an escalation owner | Request caps are verified. They are not dollar budgets. No spending authorization or unreviewed limit increase is inferred. |
| Monitoring/support | An owner watches failed/stalled jobs, knows escalation and rollback, verifies alert delivery and crash redaction | Safe operations console and bounded recovery exist. A successful anonymous 401 check does not prove an operator MFA session or external alert delivery. |
| Backup/restore | Restore a production-shaped backup into a separate environment; verify migrations, RLS, auth/storage metadata, uploaded bytes and cross-household isolation; record recovery time and acceptable loss | Full-schema local replay passes, but an actual managed backup/restore rehearsal is not recorded. Do not call migration replay a restore. |
| Store/privacy/OAuth | Final disclosures match actual data access/retention; reviewer account and store materials work; Google verification and Apple/Play identity requirements accepted | Requires owner/console/reviewer evidence. No public submission was performed. |
| Promotion | Complete device checklist, record known limits, approve production settings/migrations, release a production-pointing candidate, then monitor a bounded cohort | These builds point to staging. Do not publish them as production binaries or repoint existing testers silently. |

## Rollback and preservation

Re-alias staging to the immediate rollback above if the final operations-only increment regresses. The earlier deletion deployment remains available. Additive database guards stay installed; removing them would weaken the account freeze, so use a tested forward correction if necessary. Do not automatically unschedule cleanup for already accepted deletions.

Source recovery uses the scoped before/after archives, manifest and diff under docs/checkpoints/overnight-finish-20261012. The inherited dirty tree is intentionally preserved; no blanket reset, stash or source commit. Public website/production were not changed.

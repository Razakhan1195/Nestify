# Bill record review and revision history — 2026-10-09

## Outcome
Complete bounded milestone: customers can compare potentially repeated historical statements, explicitly choose a comparable record for history or retain both, revisit that choice, and inspect financial changes captured from now on. This is not automatic account merging or universal semantic deduplication.

## Changed
- Added an optional **Originals & changes** entry on individual bill details. It becomes **Review statement copies** when records may overlap or a prior choice becomes stale. The main bill remains useful while this lookup loads or fails.
- Matching requires the same recorded provider identity and exact period/currency, with conservative account checks. Similar names or four trailing digits never automatically merge records. Both originals and source rows remain available.
- Only archived historical records with the same known amount basis may count once. Current bills/payment obligations, unknown amount bases, and Green Button amount due versus uploaded period charges cannot be collapsed. Keeping both preserves complementary data.
- A confirmed choice changes canonical read results consistently for Home, Bills, provider views, usage/plan history, bill intelligence, assistant context and outcome history. Ingestion and saved source records remain unchanged. A direct record lookup preserves access to the other copy in the updated mobile client.
- Material saved-statement updates retain the previous snapshot: amount, currency, period, issue/due date, account/provider/source, usage, units, line items, original-document reference and selected statement evidence. Changes invalidate prior counting choices until reviewed. Unchanged refresh timestamps create no version noise.
- Retry/reload preserves the saved server choice after a lost response. Changed-record conflicts return promptly; a hosted test caught PostgREST retrying the original serialization error. A follow-up additive migration changes the expected conflict to PT409. Observed stale-choice response after the fix: 177 ms (one synthetic staging sample, not a latency percentile).

## Preserved / removed
Preserved existing design tokens and components, tabs/navigation, bill review and correction, uploaded originals, payment status, shared expenses and settlements, household permissions, Gmail discovery/import, Deck and EZGB retrieval, Care, Vault, authentication, invitations, website and waitlist. No working feature, source bill or customer record removed. No dependency added. No automatic bill merging, switching, payments, sending or provider retrieval.

## Technical impact
Two additive staging migrations: 202610090001_bill_record_review and 202610090002_bill_record_conflict. Owner-private version/choice tables, material-change trigger, security-invoker effective-bills view, authenticated review/choice RPCs. New authenticated GET/POST /api/mobile/v1/bills/[id]/records and optional direct recordId collection lookup. Reads are gated by REZLEE_BILL_RECORD_REVIEW, enabled only in retained staging settings and Vercel Preview. No production migration/configuration/deployment. No cron schedules introduced; scheduled utility pulls remain off.

## Verified
- 26 targeted automated tests passed, including database/RLS integration, idempotency, changed-record conflicts, conflicting choices, mixed financial bases, exact receipt email/upload dedup, original retention, historical corrections and existing bill explanations.
- 18 actual-component React Native Web scenarios passed at 320/390 CSS px: select, keep both, unlike bases, lost response, stale choice, offline/retry, history, no matches and disabled flag. API/router/native boundaries use controlled synthetic fixtures. No horizontal overflow or browser runtime errors.
- Visually inspected comparison at 390 and mixed-basis comparison at 320. Uses existing surfaces/actions/type; comparison labels separate charges from amount due. Native shell/icons are mocked in this harness.
- 30 hosted staging assertions passed: receipt/bill save and replay, exact-byte originals, duplicate uploads, effective view/provider relationship, direct access to an excluded copy, Home/attention/provider reads, version retention, stale-choice recovery, unlike-basis rejection and cross-user denial. Disposable fixture users and originals removed; zero real customer records modified.
- Invitation readiness still passes self-invite and invalid expense-participant validation. No emails/invites sent. This is configuration/validation evidence, not delivery/deep-link acceptance.
- Root/mobile TypeScript, scoped lint, deployed Next build and iOS/Android JS/Hermes exports passed. Initial export mistakenly included unsupported web; rerun restricted to both native targets succeeded without adding packages.
- No live AI extraction, Gmail discovery, paid provider call, store submission or physical-device acceptance in this milestone.

## Availability / testing
Staging backend: https://staging.rezlee.com → https://nestify-facnlgftm-razakhan1195s-projects.vercel.app
Mobile development source updated; Metro 8082 reports running. Reload the existing staging development app. Open Bills → an account → a saved statement → Originals & changes (or Review statement copies when relevant). Compare the account, period, source and amount labels; select a comparable record or keep both; reopen to confirm persistence. Existing correction paths record subsequent changes. Do not alter genuine statements merely to create test cases.
TestFlight UI was not rebuilt/submitted; it does not contain the new review screen. Production website and app backend were not deployed.

## Limits / next milestone
Native iOS/Android touch, large text, original viewer and background/reopen acceptance remain. Older overwritten values cannot be reconstructed. Version snapshots are not a complete audit of every raw payload field or payment activity. Deleted originals are not resurrected. Review checks at most 50 same-period candidate records and shows 20 latest versions; older stored versions remain retained. Provider alias matching is deliberately strict. Different periods, incomplete metadata, different financial bases and new file encodings are not universally deduplicated. Current balances/payment obligations are outside this historical-choice flow. Email/provider ingestion remains unchanged and may still require existing correction routes for revised imports. Provider rows in hosted tests were synthetic; no new provider reliability is established.
Next bounded build: existing shared-expense completion/recovery, including invited and non-member participants, correction/settlement states, while keeping balances and household permissions intact. Physical capture and statement-review acceptance remain release gates.

## Rollback / checkpoint
Previous HEAD: 7fa766215273bacc9168ba05c2ba327746746a3f. Task checkpoint: docs/checkpoints/bill-record-review-20261009. before.zip/hash manifest preserve the actual entry working files; after.zip, changes.patch and manifest.json contain only this task's source delta. The extensive pre-existing dirty work was not staged, reset or rewritten. The checkpoint commit stores scoped source archives/patch plus QA/report, not the unrelated working tree.
Restore only unchanged task files after verifying hashes; remove only task-added files that still match their saved hashes. Restore staging alias to https://nestify-o7lv2nlz4-razakhan1195s-projects.vercel.app and disable/remove only REZLEE_BILL_RECORD_REVIEW in retained staging settings and Vercel Preview. Keep additive database version/choice data; do not drop tables or delete customer evidence for rollback. Leave the non-retrying conflict correction applied. Secret settings backup is outside git at ~/Library/Application Support/Rezlee/settings-before-bill-record-review-20261009.json; never overwrite unrelated current settings from it.

Reference for the verified hosted conflict behavior: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
Evidence: docs/qa/bill-record-review-20261009.

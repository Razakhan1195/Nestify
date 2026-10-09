# Capture and recovery — 2026-10-09

## Milestone and outcome
Targeted continuation of upload → review → save → return to the saved record/account. This completes the receipt/file-recovery slice, not a claim that every email/provider import or physical-device journey is accepted. Existing bill review, calculations and account-insight routing remain intact.

## Changed
- Receipt batches persist cached local original references and explicit read states alongside the existing request IDs. Legacy drafts still load; file bytes are never serialized into the draft. Bounds accommodate five detailed drafts.
- New batch selections read automatically when extraction is enabled, after the visible disclosure. Failed/interrupted reading only retries on customer action. Retry fills missing fields and preserves corrections.
- A focused receipt review replaces simultaneous list/form/confirmation clutter. Original/re-read actions use the existing action sheet; one Save action confirms the review. Skipped items retain edits and can return to review.
- Bill and receipt batch photo selections reuse the existing local resize/compression helper. PDFs pass through. In-flight saves retain immutable fingerprints and are never re-encoded during replay.
- A confirmed single Vault save remains successful if local recovery-reference cleanup fails; reopening can reconcile the same request.
- Live staging exposed a disabled REZLEE_RECEIPT_DEDUP gate: identical renamed receipts returned a new record. The installed database RPC was verified before enabling the existing flag in staging deployment settings and Vercel Preview. Rerun returns the existing record. No migration was required.

## Preserved / removed / technical impact
Preserved design tokens, navigation, original preview/download, bill review and correction, household permissions, receipt extraction schema, account/insight destinations, Gmail acceptance, EZGB/Deck, sharing, Care, auth, invitations and customer data. No working capability removed. Removed only the redundant second confirmation control in receipt review; Save is the explicit confirmation. No new dependency, database/schema or API change. Draft additions are optional and backward-compatible. Production settings and website are untouched. Scheduled pulls remain off.

## Verification
- 70 targeted automated tests passed: receipt drafts/corrections, photo preparation, historical statements, deterministic save/replay, duplicate prevention, migrations/RLS and original retention.
- Database integration proves exact original deduplication upload→email and email→upload, distinct originals remaining separate, and household isolation. This is not universal fuzzy receipt/bill deduplication.
- 14 actual-component React Native Web interaction scenarios passed at 320/390 CSS px: save, extraction failure/retry with corrections after reload, lost-response recovery, duplicate, offline recovery, skip/restore, and confirmed single save despite cleanup failure. API/router/native boundaries use clearly synthetic fixtures.
- Visually inspected receipt review at 390 and failed/retry review at 320; reduced competing controls and retained existing typography/buttons/surfaces. Native icons and navigation shell are mocked in the render harness.
- 13 hosted staging assertions passed: enabled receipt batch, save, replay, signed-original download, byte hash integrity, renamed receipt duplicate, historical bill save/replay/duplicate, original access, recorded charges without asserting payment, cross-account download denial. Disposable QA accounts and their uploads were removed; zero customer records modified.
- Invitation readiness still passes the existing self-invite and invalid expense-participant checks. Zero invitations/emails sent; actual delivery/deep links remain a separate acceptance gate.
- Root and mobile TypeScript, scoped lint and iOS/Android JS/Hermes exports passed. The mobile check uses its own compiler; a root-compiler attempt was rejected by the existing mobile ignoreDeprecations setting and was rerun correctly without config changes.
- No live AI extraction or paid provider call was executed in this slice.

## Availability / how to test
Backend: https://staging.rezlee.com → https://nestify-o7lv2nlz4-razakhan1195s-projects.vercel.app
Development Metro server on port 8082 reports running. Reload the staging development build. In Vault, choose the existing multiple-receipt entry, select files, review and save. Reopen a partial batch, try retry after failure, and open the saved original. Bills → upload statements retains the existing review/save/account journey with the same photo-preparation improvement.
TestFlight binary was not rebuilt/submitted in this slice; its UI is unchanged. The backend duplicate fix applies to existing staging clients. Production was not deployed.

## Remaining risks / next milestone
Physical iOS/Android camera, gallery, native preview, large text, permission denial and real network interruption still need acceptance. OS cache eviction can require selecting an original again. Prepared photographs retain the uploaded copy, not guaranteed full-resolution source bytes. Different scans/crops/encodings are not guaranteed exact duplicates. A missing processed original on an in-flight photo save can require explicit recovery rather than silently replacing the fingerprint. Cross-provider/manual bill revisions and semantic email duplicates need a focused remaining review; no broad deduplication claim is made. No new provider reliability is established here.
Next: cross-source bill duplicate/revision review and physical capture acceptance, then existing shared-expense and repair completion journeys.

## Rollback / checkpoint
Previous HEAD: 66292bdcf5afab6f11ee6a515d9310510628d1b9. Task checkpoint: docs/checkpoints/capture-recovery-20261008. before.zip and before.json capture the actual entry working files; after.zip, changes.patch and manifest.json contain only this task's source delta. roadmap-before.md preserves the prior progress note.
The repository has extensive unrelated working changes. The checkpoint commit stores the scoped patch/archives and evidence; it intentionally does not stage all dirty source files or reset the repository. Verify current hashes against the manifest before restoring the seven changed pre-existing files from before.zip; remove the one new test only if unchanged.
Staging rollback alias: https://nestify-j30htf3jw-razakhan1195s-projects.vercel.app. Settings backup (contains secrets; excluded from git): ~/Library/Application Support/Rezlee/rogers-hosted-staging-settings.before-capture-20261008.json. For a precise config rollback remove only REZLEE_RECEIPT_DEDUP from retained staging settings and Vercel Preview, then restore the prior alias. Do not replace other current credentials/settings from the backup. Existing deployed snapshots are immutable.

Evidence: docs/qa/capture-recovery-20261008. No real customer data cleanup, provider retrieval, production deployment or store submission occurred.

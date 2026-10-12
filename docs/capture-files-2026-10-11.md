> Follow-up: [Live file evaluation](quote-files-live-validation-2026-10-11.md) records completed file reads, evidence fixes and current staging. Physical-phone acceptance remains open.

# Capture file acceptance — October 11, 2026

## Customer problems fixed
- Vault/quote, statement upload and receipt/bill batch pickers excluded HEIC/HEIF although local preparation supports them. New selections now allow these phone formats; prepared uploads still obey the existing JPEG/PNG/WebP/PDF policy and size limit.
- Failed native image decoding now gives a useful, nontechnical recovery message. A failed photo within a batch identifies its filename, says no files were added and offers another photo/PDF instead of blaming draft storage.
- A reselected original for a pending single-statement save is no longer re-encoded. Recovery must retain the original upload fingerprint. Batch recovery already had this guard and retains it. Cache eviction can still require the exact prepared original; no promise of automatic reconstruction.

## Verification and boundaries
- 878/878 full regression tests passed. Root/mobile TypeScript, scoped lint and Next build passed.
- 20 new rendered interactions at 320/390 px use actual Vault/receipt components and the actual preparation/size code with native picker/decoder/filesystem and API boundaries controlled: PDF save, HEIC preparation, conversion failure/retry with preserved corrections, oversized photo, empty/oversized PDF, cancellation, camera denial with file fallback, lost response/same-request retry, and a failed photo after a valid PDF in a batch.
- Existing 14 receipt capture/recovery rendered scenarios passed against current source. Inspected successful corrected quote at 320 px and failed-batch guidance at 390 px. No layout overflow or page errors.
- 40 authenticated hosted file checks passed: two valid two-page PDFs and two PNGs upload through Vault, replay the same request, recover without bytes, reopen, privately download byte-for-byte, deny another household, open the quote without automatic AI, and save/reopen a title correction without replacing the original.
- Both disposable accounts and storage files were removed. Zero model/provider calls, messages or customer-data changes.
- The first hosted run had an incomplete second-account fixture (no home); the home was added and the ownership assertion passed without loosening accepted denial statuses.
- iOS and Android Hermes exports passed. An initial optional all-platform export attempted mobile web and failed on the existing missing react-native-web dependency; rerun explicitly targeted the two native platforms without changing dependencies.
- This verifies file transport/recovery and controlled UI behavior. It does not validate physical HEIC decoding, camera quality, OS permissions/termination or AI understanding of file contents.

## Prepared live reading evaluation — NOT RUN
scripts/qa/quote-file-cases.json and quote-files-live-staging.mjs hold four immutable hashed fixtures and observable criteria:
1. Complete two-page PDF: equipment, prices and work on page 1; exclusions, dates, deposit and warranty on page 2.
2. Conflicting two-page PDF: CAD 1000 subtotal versus CAD 900 total, CAD 50 allowance and unresolved terms. Preserve conflict, never invent a corrected amount.
3. Clear image of the first page only: extract visible wording without inventing absent second-page terms.
4. Plain gray image with no readable text: return no supported facts or reading failure; preserve manual review and original. This is a synthetic no-evidence case, not a realistic camera-blur test.
PDF pages were rendered and visually checked; the complete PDF embeds fonts. Image/PDF fixture files are under scripts/qa/fixtures/quote-files.
Proposed maximum: four calls under a new US$1 total authorization. No automatic retries; a persisted reservation ledger prevents blind reruns. Existing model output limit: 4,500 tokens/call.
Conservative token estimate: US$0.165 total using 100,000 input tokens per tiny fixture and 4,500 output, at Gemini 2.5 Flash input $0.30/output $2.50 per million (https://vercel.com/ai-gateway/models/gemini-2.5-flash, checked October 11). Not billed usage or a billing-platform enforcement setting. Each file is under 50 KB and at most two pages. Review actual results before any additional read.
The earlier approval explicitly covered the four text scenarios; file reads have not been run under that approval.

## Physical acceptance still required
On both iOS and Android record device/build/version and expected/actual:
- Files HEIC/HEIF and camera capture; permission denial then file fallback; clear, skewed and blurry photos.
- A real multi-page quote/bill, password-protected or corrupt PDF, and a file over 4 MB. Keep original/manual entry useful on reading failure.
- Correct a field, lose connectivity during upload, return/restart, recover once and open the exact original. Try missing/evicted local cache without creating a duplicate.
- Check large text, native preview, returning from background, and the quote's later-page terms.
These gates remain open. Do not substitute browser mocks or bundle exports for physical acceptance.

## Availability, checkpoint and rollback
Client changes are in the existing Expo workspace. No backend change, migration, Vercel promotion, native store release or scheduled job is needed for this patch.
Hosted checks used the existing https://staging.rezlee.com deployment (nestify-my9qxnr1u-razakhan1195s-projects.vercel.app).
Checkpoint: docs/checkpoints/capture-files-20261011 stores before/after, scoped patch/manifest, logs and selected screenshots. Restore only this scoped delta after checking hashes; do not reset the extensively modified repository.
Reload the Expo development app for client changes. Existing TestFlight binaries do not acquire these changes automatically.

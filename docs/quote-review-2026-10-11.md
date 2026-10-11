> Follow-up: [Live quote validation and fixes](quote-live-validation-2026-10-11.md) supersedes the pending paid-evaluation status below and records the newer staging deployment. Original engineering evidence below is historical.

# Before I spend — one-quote engineering increment
Date: 2026-10-11. Scope: first step of the approved September 25 AI/entry proposal. This is not sign-off for the entire Before I spend roadmap.

## What customers can do
- Enter from Vault, Care, Ask Rezlee, a repair issue or a saved home item. Use a saved Vault record or add a quote with a photo, file or pasted text. Original capture/save recovery reuses Vault; the quote entry avoids a redundant generic AI scan before saving.
- Explicitly request AI reading of the saved original/text. Suggestions carry a printed excerpt and page when available; customers choose to use and correct them. Missing fields stay blank. Automatic reading failure leaves manual review available.
- Review company/reference, scope, parts/labour, printed price/currency, taxes/fees, exclusions/allowances, schedule/expiry, payment and warranty. The app does not calculate a market price, validate compatibility or infer completed work/payment.
- Get deterministic clarification questions for sections not recorded in the review, with landlord/building questions when selected. Missing from a review does not mean excluded from the quote. Keep answers and a selectable question sheet without sending a message.
- Record considering/waiting for answers/planning to proceed/not proceeding, notes and later outcome. Link private saved item/repair/final-invoice records and reopen them. Recording a plan does not accept a contract or contact anyone.
- Reopen saved reviews. Original changes invalidate review confirmation; user corrections replace suggestions only when explicitly saved. Two-device version conflicts fail safely. Lost-response retries reuse the same request and store their private intent in account-scoped SecureStore. Unsaved edits show a leave warning; this is not a claim that every unsubmitted keystroke survives an OS termination.

## Engineering and evidence
- Additive staging migration 202610110004: owner-only quote review records, source/revision checks, serialized request replay, bounded payloads, read claim/result lifecycle and links. Direct authenticated writes are revoked; authenticated functions re-check original ownership and home.
- Persist read status before bounded background work; keep existing global/user AI admission caps, no automatic model retries, 45-second model timeout and 120-second stale-work cutoff. Cancellation or a changed source prevents late results from overwriting the current review. A read already sent to a model may still consume its allowance.
- Originals stay in existing private storage and open through the existing authenticated 60-second signed URL route. Deleting a source quote cascades its review; deleting a linked invoice/item/issue clears the link. User/home deletion cascades private quote rows.
- Full regression: 865/865 pass. The new seven quote suites include a full-schema database scenario for replay/conflicts, ownership, stale work, cancellation and deletion; rechecked after final migration privilege changes.
- Authenticated staging: 30 checks passed, including actual RLS/direct-write denial, simultaneous saves, corrected originals, stored worker fixtures and cleanup. Two disposable households were removed. Worker-result fixtures do not prove live model accuracy.
- Rendered interactions: 36 scenarios at 320, 390 and 900 px through actual React Native components in React Native Web. Synthetic API/router/native boundaries; screenshots inspected and technical field labels corrected. Root/mobile types, scoped lint, Next build and native iOS/Android Hermes exports pass.
- No paid model calls, paid provider retrievals, real emails/messages or customer-record mutations in verification. No scheduled retrieval enabled.

## Delivery and rollback
Staging: https://staging.rezlee.com → https://nestify-4e9dwjkvs-razakhan1195s-projects.vercel.app.
Staging source snapshot: /tmp/rezlee-quote-review-staging-20261011. Mobile source is available through the existing Expo project; Metro 8082 was observed running. No TestFlight, store or production release.
Checkpoint: docs/checkpoints/quote-review-20261011; before/after archives, scoped manifest/patch, test logs and deployment record. Other working-tree changes are preserved.
Rollback backend alias to https://nestify-p28dodx8l-razakhan1195s-projects.vercel.app and restore only the scoped client files from before.zip. Keep quote_reviews data/migration; the previous backend will not expose this new journey. Prefer a forward fix. Do not blanket-reset the repository.

## Exact remaining acceptance
1. Live AI accuracy: four synthetic text cases prepared in scripts/qa/quote-live-cases.json (complete terms, sparse estimate, conflicting amounts, injected instructions). Not run. The approved September 25 proposal requires explicit approval of a bounded paid-model evaluation budget; no authorization is inferred from general staging work. Real photo/PDF quality is a separate acceptance case.
2. Physical Expo iOS/Android: quote file/photo or pasted text → original save → explicit Read quote → inspect excerpts → correct scope/tax/exclusions → save → record an answer/decision → return after restart. Open the private original, cancel a read, test offline/lost response and a two-device conflict. Try the related issue/item/final-invoice links and source correction.
3. Customer usefulness: one actual quote with a homeowner and one tenant; verify the questions identify a meaningful uncertainty without inventing missing terms. Do not grade extraction accuracy using deterministic fixtures alone.
4. Broader Before I spend still open: evidence-linked multiple-quote comparison/revisions/shortlisting, manufacturer-backed compatibility, and supported repair-versus-replace scenarios. This increment supplies a saved one-quote review and linked decision/outcome notes, not those broader comparisons.
5. All prior physical/provider/invitation/native capture/repair and operational release gates remain on audit-completion-status-2026-10-11.md. This increment does not make the app launch-ready.

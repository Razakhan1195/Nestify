# Quote review — live customer-scenario evaluation and fixes
Date: October 11, 2026. Follows quote-review-2026-10-11.md. User approved the four prepared scenarios under a $1 total budget and directed future work to use real customer scenarios and relevant edge cases. That standing requirement is now in AGENTS.md.

## What the live reads found
Four synthetic pasted-text quotes went through the actual authenticated staging API, existing AI admission controls, persisted background worker and saved results. A successful response was not treated as a successful customer outcome.

| Scenario | Initial observed gap | Correction and evidence |
|---|---|---|
| Complete installation quote | Clear work scope was absent from accepted suggestions | Text extraction now selects numbered original passages, rather than rewriting excerpts; the live recheck retained the model/work scope. Deterministic source preservation also retains explicit included disposal and the printed totals. |
| Vague plumbing estimate | Labour $180, extra parts and date to be agreed appeared as filled sections, suppressing necessary questions | Clarification now includes unnamed currency/incomplete price, additional parts and unresolved dates. Live recheck showed those questions. CAD is never inferred from a bare dollar sign. |
| Conflicting quote amounts | Printed subtotal CAD 1000, total CAD 900 and a CAD 50 allowance were omitted or partially selected, including on the live recheck | Explicit printed subtotal/total references and allowances are retained directly from original text. Both amounts remain visible; clarification is requested without declaring an accounting error or inventing a corrected total. Final deterministic logic passed replays against the actual live outputs. |
| Instructions embedded in a quote | AI ignored instructions to invent a warranty/verify compatibility/accept the quote, but before-tax wording did not trigger clarification | Before-tax and unknown model wording now remain unresolved. Reader-directed injected instructions cannot become selected text facts; no sending, purchase or acceptance action exists in this route. Live injection reads and final replay checks passed the stated bounds. |

## Evidence and limits
- Eight live model reads total: the same four scenarios, then one deliberate post-fix recheck of those four within the original $1 total budget. No automatic model retries. First round approximately 7–9 seconds per read; recheck approximately 7–15 seconds. These are small text fixtures, not a performance guarantee.
- Both rounds completed and persisted; recheck also saved and reopened each reviewed result through the real staging API. Disposable accounts and their quote records were removed.
- The recheck still exposed a conflicting-price omission. The final source-preservation correction was then verified with **eight recorded live-output replays**, without another model call. These are deterministic replays, not eight new live reads and not a claim of perfect extraction.
- Printed passages remain verbatim and bounded. Invalid ranges, obvious reader-directed instructions and oversized critical evidence spans fail closed to manual review. Repeated selected fields retain their combined evidence. Widely separated totals must not leave a misleading partial price.
- Full regression: **877/877 passed**. Rendered interaction scenarios: **42** at 320/390/900 px, including unresolved terms and conflicting totals. Root/mobile types, scoped lint, hosted Next build and both native Hermes exports passed. Final deployment also passed the 30 authenticated staging ownership/recovery checks.
- Cost: conservative token-price bound **US$0.112 for all eight calls**, not a provider invoice or measured billing total. Bound assumes up to 20,000 input and 4,500 output tokens per call at the configured GPT-5 mini rates (US$0.25 / US$2 per million); these fixtures have less than 2,000 input characters each plus instructions/schema. Published provider pricing and output-cap behaviour were checked at https://vercel.com/ai-gateway/models/gpt-5-mini. No provider retrievals, outgoing messages or customer documents were used.
- Remaining: actual quote photos/PDFs, real customer usefulness, physical iOS/Android capture/backgrounding/restart, and broader multilingual/complex-document acceptance. Multiple-quote comparison, manufacturer-backed compatibility and repair-versus-replace remain separate unfinished roadmap work.

## Deployment and recovery
Staging alias: https://staging.rezlee.com → https://nestify-my9qxnr1u-razakhan1195s-projects.vercel.app.
Source snapshot: /tmp/rezlee-quote-live-fix-staging-20261011.
No production, TestFlight or store release; existing Expo source has the client changes.
Checkpoint: docs/checkpoints/quote-live-20261011, with the recheck ledger in docs/checkpoints/quote-live-retest-20261011. Contains the actual observations, replays, bounded-budget rationale, source archive/patch and verification records.
If necessary, return the staging alias to https://nestify-4e9dwjkvs-razakhan1195s-projects.vercel.app and restore only the scoped client/backend files. Keep the existing quote_reviews data/migration; no new database migration was needed. Prefer a forward fix.

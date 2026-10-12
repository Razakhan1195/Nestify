# Live quote-file evaluation and evidence fix — October 11, 2026

## Outcome
The four approved synthetic file cases ran on the actual authenticated staging quote worker. The first round exposed omitted critical evidence and spliced excerpts. The extractor and review UI now retain multiple passages for the same section, with each passage's page reference. One deliberate recheck of the same four cases confirmed the intended outcomes. This is bounded file-reading acceptance for these fixtures, not physical-camera or general quote accuracy sign-off.

| Customer scenario | First live observation | Post-fix live observation |
|---|---|---|
| Two-page installation quote | Second-page exclusions, dates, deposit and warranty read correctly; separated scope passages joined into an apparent single excerpt | Nine sections retained; separate original passages and page references; model, both amounts, disposal and second-page terms retained |
| Conflicting totals across pages | CAD 900 total on page 2 and CAD 50 allowance omitted; only CAD 1000 subtotal retained | Both amounts and allowance retained, each with its page; clarification includes price and exclusions, without inventing a corrected total |
| Image of page 1 only | No invented warranty, dates or deposit | No invented missing-page terms. Printed “Terms continue on page 2” was captured; final deterministic clarification logic now treats that as unresolved rather than completed exclusions |
| Plain gray image with no readable quote | Zero facts | Zero facts; existing manual-review path available. This is a no-evidence fixture, not realistic camera blur |

## What changed
- File extraction returns separate contiguous passages, permits repeated section keys and asks explicitly for every subtotal, total and allowance across pages. It no longer requests model-written summaries for file facts.
- Deterministic aggregation preserves all returned passages, removes exact duplicates, retains total/allowance wording even when filed under another section, and never truncates a conflicting amount to fit a field. Oversized sections fall back to manual review.
- Optional citations coexist with the legacy excerpt/page fields. The UI shows each excerpt separately. Existing saved reviews/text extraction remain compatible. No schema migration or new dependency.
- References to additional pages/attached terms stay unresolved in clarification questions. This last small client clarification change was verified against the actual recheck outputs without another model call.

## Evidence and limits
- Eight live file reads total: four original cases plus one deliberate post-fix recheck of the same cases, under the approved US$1 total budget. No automatic model retries or new scenarios.
- First round approximately 2.8–7.3 seconds/read; recheck approximately 3–5 seconds/read on these small synthetic files, not a latency guarantee.
- Conservative combined token-cost estimate US$0.33 at the previously verified Gemini 2.5 Flash rates; not measured billing. Two rounds each capped at four requests with persisted ledgers, immutable hashed fixtures, output limit 4,500 tokens/call and existing application admission limits.
- Every recheck excerpt was checked against the known text on its cited fixture page; expected customer outcomes passed in scripts/qa/evaluate-quote-files.ts. This checks those actual outputs, not future model reliability. Supplier reference identifiers were not consistently included; the original remains necessary.
- 884/884 full regression tests passed; root/mobile TypeScript and scoped lint passed. 48 rendered quote scenarios at 320/390/900 px passed, including separate-page evidence, corrections, saved review and manual recovery from an empty read. Three additional views of the same multi-page scenario captured the evidence display; 390 px visually inspected.
- 30 authenticated staging ownership/recovery checks passed with multiple page citations saved and reopened. An initial test compared serialized JSON object-key order; changed the assertion to exact page/excerpt values and array order, not a weaker content requirement.
- Hosted Next build and final iOS/Android Hermes exports passed.
- Both paid rounds' disposable users, documents and storage objects were cleaned. Hosted verification fixtures also cleaned. No customer records, messages, provider retrievals or scheduled updates.
- Real document photos/skew/lighting, physical iOS/Android HEIC/camera/permissions/backgrounding/restart and customer usefulness still need acceptance. The model can still omit or misread evidence; there is no independent OCR verification of arbitrary customer files.

## Delivery and recovery
Staging: https://staging.rezlee.com → https://nestify-liyhyo0kl-razakhan1195s-projects.vercel.app.
Source snapshot: /tmp/rezlee-quote-files-staging-20261011. Final missing-page clarification follow-up is client-side in the Expo workspace; server extraction is the live-rechecked deployment.
Reload Expo for the current review UI and questions. No TestFlight/Play/public release.
Rollback alias: https://nestify-my9qxnr1u-razakhan1195s-projects.vercel.app. Restore only scoped files after comparing manifest hashes; keep quote data. Existing legacy fields remain available. Do not reset unrelated working changes.

## Next confirmed engineering gap
A source review of apps/mobile/app/inventory-item.tsx and src/app/api/mobile/v1/inventory/route.ts confirms that new home-item POSTs have no durable request identity: a repeated request performs another insert. The UI retains fields after ambiguous failure but cannot reconcile a completed create after restart. This is a source-confirmed risk, not a live duplicate reproduction in this milestone.
Next increment: account-scoped durable create intent, atomic server replay, preserved corrections, cancellation/deletion semantics and safe recovery after restart. Verify lost response, repeated taps, app restart, changed account, deleted item and concurrent replay. Do not mask this with fuzzy name/model deduplication; customers can own two identical appliances.

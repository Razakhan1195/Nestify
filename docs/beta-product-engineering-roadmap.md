> Latest update, October 2: see [Import experience, feedback and sign-in](import-experience-2026-10-02.md). Its deployment/status and remaining limits supersede older Gmail counts below.

# Rezlee product and engineering roadmap — 2026-09-24

## Approved sequence update — 2026-09-25

Founder approved the expanded AI/entry sequence in docs/roadmap-ai-and-entry-proposal-2026-09-25.md: welcome/auth and outstanding phone gate; reviewed bill/receipt intake; bill intelligence with outcome tracking from the start; structured home fixes; spending decisions; broader capture; collaboration/profile/release completion. Existing integration, preservation, permission and cost constraints remain. EZGB/Deck work can advance when external dependencies are available. This changes sequencing without dropping earlier roadmap items or falsely marking the split ledger complete.

Latest delivered source increment: docs/welcome-email-entry-2026-09-25.md. Google/Apple configuration, native social flow and phone/email-delivery verification remain outstanding. Read the newest checkpoint for current evidence; older dated progress sections below are historical.

This is the working delivery plan following the audit and founder discussion. Audit findings remain evidence, not a decision to abandon utility intelligence or Deck. No working feature, record, permission or integration is approved for removal.

## Product promise and scope

Help customers understand household costs, deal with a home problem, and keep records/tasks under control. Utility intelligence remains a central differentiator, with both connected data and manually uploaded history. Ask Rezlee must use saved household context and support a complete next action.

Initial cohort hypothesis: Canadian household organizers, starting with Ontario homeowners for validated electricity comparisons. Renters retain records, bills, tenant-appropriate fixes and shared Care; the first cohort does not justify owner-only copy across the app.

## Bill sharing: explicit decision

Bill sharing remains on the roadmap. The audit recommendation deferred a full Splitwise-style ledger; it did not implement bill sharing or authorize silently removing it from the roadmap.

- Stage A, proposed for the core beta: owner explicitly shares an individual bill with selected active household members; recipients can inspect the shared fields and see who is responsible for paying the provider. Private account identifiers and original statement files stay private unless separately authorized. This is shared responsibility, not a debt ledger.
- Stage B, planned beta expansion: equal/custom amount splits, record who paid the provider, calculate each person's share and outstanding balance, record an external settlement, handle corrections and departure. Customer validation and a reviewed ledger design precede implementation; this is not a blocker for the first organizer beta.
- Later: recurring split rules and controllable reminders only after one-off splits/settlements are correct.
- Out of scope: moving money, payment processing, debt collection or a complete Splitwise clone.

Do not describe Stage A as "Splitwise-like balances". If the founder wants full balances/settlements in the first beta, explicitly revise scope/timing rather than silently changing these gates.

Technical boundary: bill visibility grants are separate from provider credentials, raw retrieval data and file access. RLS must constrain every shared read. Payment-to-provider status and member reimbursement status are separate. Stage B needs integer minor units per currency, exact rounding, immutable ledger events/reversals, idempotency keys, correction rules, participant visibility, settled-bill edit rules, partial settlements and member-exit history. Repeated client requests must not duplicate a debt or settlement; members cannot mark another person's payment as verified.

## Delivery order and acceptance

| Order | Customer journey | Engineering dependencies | Acceptance / release gate |
|---|---|---|---|
| 1. Trust and complete core lifecycles | Recover account; create/find/edit/delete records/items; safe attachments; finish and revisit Care work | Owner authorization, storage cleanup, idempotency, upload limits, account deletion/revocation, error states | Positive and unauthorized paths; failed/repeated deletion; no silent data loss; core native journeys on both platforms |
| 2. Historical bill intelligence | Upload multiple bills or add manually → review extraction → correct/link provider/account → see history/explanation → choose action → revisit | Durable bounded imports, extraction confidence, original attachments, period/currency normalization, dedup/corrections, pagination, tested calculations | Mixed providers, irregular periods, credits, estimated readings, gaps and duplicate files; show evidence/freshness; no invented hourly detail from monthly totals |
| 3. EZGB lifecycle | Connect → consent → bill/reading import → useful insight → monthly update → expired consent/reconnect/disconnect | Live interval contract and sample, incremental cursor, timezone/units, estimated values, durable jobs, retries, reconciliation, provider/account identity | Saved-data fixtures first; then explicitly budgeted live lifecycle and new-data event; no schedule enabled by default |
| 3b. Deck continuing work | Select validated provider → authentication/MFA → first useful data → leave/resume → refresh/history/disconnect | Task/capability mapping, atomic active-run claim, challenge identity, webhook replay, cost/concurrency controls | Provider-specific bounded pilot; portal reconciliation; separately measure MFA/user response/data latency and historical completeness; release only providers meeting gates |
| 4. Ask Rezlee home fixes | Describe/photo issue → targeted questions → safe checks and sources → use relevant model/warranty → save issue/task → follow up → resolve/history | Reuse existing repair API/schema and issue logic; mobile photo/consent; context retrieval; source attribution; stateful issue workflow | Grounded useful advice, explicit uncertainty, risky-problem escalation, denied camera/offline recovery, permission-bound actions confirmed before saving |
| 5. Household collaboration | Invite/accept/revoke/leave → shared Care → explicitly shared bill → responsibility/status → return | Expiry, membership lifecycle, separate bill grants, immediate revoked access, private file/credential boundaries | Two-account end-to-end tests, wrong-email/expired invites, removed member access denial, no implicit sharing of all bills or Vault |
| 6. Beta release | Onboard to first value → real return task → support/recovery → account deletion | Tagged iOS/Android builds, staging/production separation, privacy/disclosures, crash and outcome metrics, support, restore/rollback | TestFlight/Play test tracks, physical device QA, documented observed outcomes, no open material security/data-loss defect |

Complete one useful increment at a time. Integration work can proceed when its external dependency is available; no need to block manual upload or repair-flow development while waiting for EZGB. Do not begin multiple partial customer journeys merely to show roadmap activity.

## AI feature priorities

1. Explain my bills: deterministic calculations and data quality checks, AI explanation with evidence and a useful next action.
2. Help me fix this: the structured home-issue journey above, not just a general chat response.
3. Ask about my home: retrieval from saved bills, models, manuals and warranties with source links and permission boundaries.
4. Improve existing capture and Care: reviewable extracted fields, a small relevant maintenance plan, completed history and reminders.
5. Later experiments: warranty claim preparation, repair quote comparison, repair-versus-replace planning. No invented savings, diagnoses, quote benchmarks or model-specific instructions.

The distinction from a general chatbot must be observable: known household context, reliable tools/calculations, relevant sources, saved outcomes and follow-up. Do not claim universal superiority over ChatGPT or market an untested feature.

## Historical bills and utility insight requirements

Show cost/usage per day for comparable periods; split measured bill changes into usage, period and price/fee effects where data supports it; seasonal/multi-period comparisons; confidence and missing coverage; prioritized savings actions with supported estimates; later review of what changed. No universal monthly total across currencies, incomplete sources or mismatched service periods. A customer's action is not automatically the cause of a later bill change.

Monthly collection is the planned initial cadence, aligned where practical with bill availability. It can support periodic bill review, not live anomaly alerts. Prepare configurable scheduling/cost ceilings but keep it OFF until explicitly approved. Interval ingestion is a separate requirement from billing ingestion.

Founder EZGB discussion: working interval endpoint/sample, history and incremental retrieval, provider/account IDs, timezone/units/estimates, consent expiry and revocation, delay/freshness, applicable meter/pull charges. Public vendor capability is not proof of this account's API entitlement.

Deck remains in active development. Existing provider histories and disconnect/recovery actions are preserved. Keep new-provider claims constrained to actual verified capabilities; do not remove the integration simply because the audit found failures.

## Full journey standard for every increment

Before implementation define customer job, entry, completion/confirmation, edit/return/recovery and exit. Cover loading, empty, partial/stale, offline, denied permissions, service failure and pending work. Unsaved work must be protected. Use existing navigation, understated secondary controls, accessible touch targets and source-specific status.

Backend invariants: owner/household authorization; no credential/private document logging; additive migrations and old-client compatibility; durable state and idempotency for slow work; bounded attempts, cost, concurrency, pagination and payloads. Distinguish deployed, locally tested, prior evidence, blocked and unexecuted.

For billing: never confuse statement amount, balance, provider payment and member reimbursement. For AI: separate facts/estimates/possible explanations, disclose data sharing, keep source permissions, and evaluate prompt injection/unsafe guidance.

## Beta gates and remaining dependencies

- Core account/data lifecycle and privacy fixes complete; no reachable high-impact security gap left without a mitigation.
- Full create/view/edit/complete/delete/recovery matrix appropriate to each included object, on iOS and Android.
- Home/Bills zero/one/multiple providers plus one failed provider; long names, large text, small screen, mixed manual/connected data.
- Explicit invitation and sharing tests; document/credential privacy preserved.
- Notifications delivered once, controllable and correctly linked; recall work fits promised freshness or monitoring promise is restricted.
- Instrument first useful save/reopen, task completion, connection success/time to useful data and support burden. No unnecessary daily engagement target.
- Reproducible release candidate, production credentials/account access, policy/support/deletion URLs, reviewer account, backup/restore evidence and store checklist.
- Paid provider test budget and schedule activation require explicit approval. No production deployment/submission authorized by this roadmap.

## First increment started in this turn

Record/item deletion from their existing edit screens: confirmed destructive action, owner-only DELETE routes, idempotent retry, original-file cleanup, race/error handling, return navigation and RLS regression checks. It is a prerequisite for onboarding real beta users, not a substitute for the bill-intelligence roadmap.

Availability and actual test results are recorded in the latest project checkpoint after verification. Do not infer deployment from a successful local build.

## Later roadmap retained

Split balances and settlements (Stage B); selective household record sharing; Gmail import feasibility; weather/AQHI tied to specific home tasks; warranty support and quote comparison; carefully validated perks. These remain sequenced opportunities, not all first-beta requirements. Payments and a generic marketplace remain out of scope.

## Current delivery checkpoint — 2026-09-24

Core deletion/recovery/upload/Vault-save foundations are locally implemented, not released. Test deployment authorization is now explicit; an isolated Supabase target is missing. Read-only deployment access is working. The release runbook and opt-in disposable verification runner are prepared; native/hosted execution remains outstanding.

Historical-bill work now includes local manual statements and a reviewed single-file upload journey: preserve a private original, optionally read period-charge suggestions, confirm details, prevent duplicate files/periods, attach to matching history and resume an interrupted server save. All 198 local tests and build/type/lint checks pass. The additive original-upload migration is unapplied; live Storage, extraction accuracy and native recovery remain unverified. Bounded batch work, account/connected reconciliation, usage-backed insights and pagination remain later increments. See `docs/historical-statement-upload-2026-09-24.md` and the main checkpoint for exact evidence. Finish the isolated test release/device gate before expanding import scope. Utility scheduling remains off; paid calls are not authorized.


### Manual-history value increment — 2026-09-24

Local Statement insights now provide account selection, period-length-normalized comparisons across three/four saved statements, transparent source coverage and correction/recovery paths. This strengthens manual-first value without an extra AI/provider call. All 210 tests and build/type/lint checks pass. Comparison blocks on incomplete history, credits, overlap or invalid data. Visual/native/hosted checks remain unexecuted; see `docs/manual-history-insights-2026-09-24.md`. The isolated test database is still the release gate. Do not treat this as completed usage intelligence, savings guidance or phone verification.

## Isolated foundation release follow-up — 2026-09-24

Staging Supabase is now created and migrated (33 migrations). Protected backend preview is deployed at `staging.rezlee.com`. Thirty-one foundation lifecycle checks passed through a local production backend against the actual staging Auth/database/private storage; manual cleanup passed and fixtures were removed. Hosted API and physical phone verification remain gated by Vercel SSO/access approval and device connectivity. No utility scheduling or paid provider/AI calls occurred. The isolated mobile profile is prepared; normal phone setup and saved data are unchanged.

Next action is the scoped staging-access decision described in `docs/foundation-test-release-2026-09-24.md`, followed by hosted and physical-device checks. This is release infrastructure progress, not a new shipped customer feature or proof of automation. Existing product priorities and bill-sharing commitments remain unchanged.

### Staging access and native build follow-up

Founder approved access only for staging.rezlee.com; that exception is active and all 31 hosted foundation checks pass. Phone runtime is connected to staging. SDK 57 staging environment isolation was corrected without changing the normal profile. The older client lacked ExpoCrypto; updated free development build 63d61fe7-60be-47c4-bb16-a73c7da95fe4 is now installed. Native module/UUID, scripted sign-in/hosted capability access and 7 metadata lifecycle checks passed on the iPhone. Hands-on file/camera, visual/keyboard, interruption/offline and Android verification remain. Metro stays running for the user's tests; cloud build/tests are finished. Utility schedules remain off and there are no paid provider/model calls.

## Public-launch scope decision — 2026-09-25 (latest founder direction)

Founder: proceed, but do not build things unnecessary for public launch. This supersedes the previous checkpoint's instruction to continue every advanced bill-intelligence item before launch. Existing features/data remain; this is sequencing, not removal.

### Required before public release
1. Finish and verify the existing bill journey: single/bulk upload or manual entry, review/correct, deduplicate, retain/find originals, understandable history and one useful next action. Saved follow-ups must be easy to find again.
2. Verify the promised utility connection lifecycle on supported providers, with accurate coverage/freshness and reconnect/disconnect. EZGB interval-specific claims require actual validated readings. Deck claims remain provider-specific. Manual use must work independently.
3. Complete the existing core account/household/Vault/Care lifecycles and privacy boundaries; fix observed security, data-loss and inaccessible-workflow defects rather than adding breadth.
4. Execute physical iOS/Android journeys and public-release gates: permissions, large text/keyboard, offline recovery, sharing/account deletion, crash/support/release configuration and store disclosures. A bundle/build is not execution.
5. Keep customer promises aligned to observed functionality. User-reported resolution is not verified savings.

### Defer until demand or launch evidence justifies them
Public/personalized consumption benchmarks, peer comparisons, live telecom offer discovery, advanced weather normalization, automatic causal savings attribution and additional comparison dashboards. Do not build these simply to complete the earlier exhaustive wish list. Existing written-offer comparison remains usable; no expansion is required for launch.

### Boundaries
No production release/store submission/purchase authorized. Utility schedules remain off; no paid provider retrieval without explicit approval. A future monthly cadence remains a product option, not permission to turn it on now. Preserve existing bill sharing and all other working capabilities.


## Care reliability — 2026-10-01 UTC
Maintenance generation bug fixed and deployed to staging; real 12-task AI response had been rejected by the old maximum. Hosted generate/review/save/reopen/complete accepted. Live adaptive repair still falls back, so it is NOT accepted as finished. Read docs/care-reliability-2026-10-01.md for exact evidence, native-build limitations and the next bounded repair acceptance milestone. Public production unchanged; scheduled pulls remain off.

## October 1 — tailored Care checkpoint
See docs/tailored-care-and-ads-2026-10-01.md. Maintenance now uses explicit scope and editable schedules; sourced repair and exhausted-check escalation accepted on staging. iOS 11 / Android 8 requested. Physical Care/receipt acceptance and production/store gates remain.


## Optional email → Home Memory — 2026-10-02 UTC
Manual excerpt → reviewed Vault record and complete CAD bill history implemented locally behind disabled backend/privacy gates. See docs/email-memory-2026-10-02.md for scope, tests, rollback and exact remaining work. No Gmail, forwarding, appliance enrichment or confirmed Care service history is claimed complete. No live model calls, migration application or deployment occurred. Next: staging/manual payoff acceptance and entity-linked outcomes before connected Gmail. Website/waitlist and existing integrations unchanged.


## 2026-10-02 — Gmail connection implementation (not enabled)

Supersedes manual-paste as the intended email entry: Connected email now implements Google consent, encrypted read-only access, bounded 12-month / 500-candidate discovery, persisted review findings and confirmed Bills/Vault saves with supported originals. Existing uploads, website/waitlist, utility connectors and auth remain unchanged.

64 automated tests and 38 rendered interaction checks passed; root/mobile TypeScript, scoped lint, Next build and both mobile bundles passed. No live Gmail/AI/phone acceptance or deployment was performed. Dedicated Gmail OAuth credentials and controlled staging migration/deploy are the next blocker; scheduled Gmail updates remain gated and utility schedules remain unchanged.

See `docs/gmail-memory-2026-10-02.md` for exact setup, scope limitations, acceptance tests and rollback. Before checkpoint: `docs/checkpoints/gmail-memory-20261002-before.zip`; after checkpoint: `docs/checkpoints/gmail-memory-20261002-after.zip`.


### Gmail staging activation — 2026-10-02 UTC

Dedicated OAuth JSON received and exact callback validated. Staging-only migrations 202610020001/0002 applied and ledger recorded. Scoped deployment nestify-1pvlycz3h is live on staging.rezlee.com. Gmail enabled, manual excerpt entry disabled, automatic schedules off. 21 live staging checks passed; two temporary QA users removed. Running development bundle points to staging and contains the Gmail screen. Next: user Google consent then real inbox/attachment and physical-phone acceptance. TestFlight unchanged; production website/auth/integrations unchanged. Rollback alias: nestify-cwy1f19wq. See Gmail checkpoint report for remaining gates.


### Live Gmail blocker — 2026-10-02
Google consent/search succeeded (26 candidates); extraction blocked by AI Gateway Hobby plan rejecting required ZDR. Corrected error classification/recovery copy deployed to staging (nestify-ea5ou1i07), progress preserved. No privacy downgrade or purchase. Next requires owner decision on eligible paid gateway plan or separately verified compliant alternative; do not claim Gmail import is end-to-end ready.


## Current priorities — October 2 overnight
The previous “Hobby blocks ZDR” note is superseded: founder upgraded; live extraction succeeded, then the app's usage allowance paused the search. Discovery was corrected for the missed Enercare notice; billing-notice review, safe Gmail operations visibility and Gmail deletion cleanup added. No public release. See docs/release-readiness-2026-10-02.md for the prioritized roadmap, exact observed tests, remaining gates, build IDs and rollback. Existing core features require native acceptance; do not restart them from old September roadmap descriptions. Website/waitlist remains unchanged, scheduled pulls off, paid provider tests require approval.


## Core feature quality — 2026-10-08
First bill-usefulness slice implemented: truthful connected amount basis, comparable usage/day, selected-period charts for manual and connected history. Backend on staging; mobile development source updated; TestFlight unchanged. 61 unit tests, 24 rendered scenarios, hosted smoke/invitation readiness and both native bundle exports passed. Physical/provider acceptance remains. See docs/bill-usefulness-2026-10-08.md for exact scope, evidence, rollback and next import-to-insight milestone. Scheduled pulls remain off.


## Capture and recovery — 2026-10-09
The next bounded capture slice is complete: receipt originals and read state survive reopening, retries retain corrections, skipped receipts can resume, batch photos use existing local preparation, and confirmed Vault saves no longer appear failed after device-cleanup errors. Receipt duplicate protection was installed but disabled in staging; enabled it in the retained staging settings and Vercel Preview only. Hosted receipt/bill originals, exact duplicates, save replay and household isolation passed. 70 focused tests, 14 rendered interaction scenarios, 13 live staging assertions and both native bundle exports passed.

Mobile UI is in the development source (Metro 8082 running); TestFlight is unchanged. Physical camera/preview/offline acceptance remains. Exact email/manual receipt originals are covered; semantic duplicates, revised bills and cross-provider duplicates are not universally certified. Next: the remaining cross-source bill/revision review plus physical capture acceptance, then expense/repair completion. See docs/capture-recovery-2026-10-09.md. Production website, customer data and utility schedules unchanged.


## Bill record review and revisions — 2026-10-09
Historical cross-source statement review is staged: explicit count-once or keep-both, originals retained, changed evidence reopens choices and records prior values. Only comparable historical amount bases can be combined; Green Button amount due is not interchangeable with uploaded period charges. Canonical reads use confirmed choices; source imports, payment records and shared expenses remain intact.
26 tests, 18 rendered interaction scenarios and 30 live staging assertions passed, plus root/mobile types, scoped lint, Next build and both native bundle exports. Hosted testing exposed and fixed a retrying serialization conflict; stale choices now return an immediate review conflict. No provider/AI calls or emails were sent. Staging alias is nestify-facnlgftm; mobile development source updated, TestFlight unchanged. Feature flag is staging/Preview only, scheduled pulls off, production untouched.
Physical-device acceptance remains. No universal fuzzy matching, current-balance dedup or reconstruction of historical overwritten values is claimed. Next: existing shared-expense completion/recovery, then repair completion; native acceptance remains a release gate. See docs/bill-record-review-2026-10-09.md for scope, evidence and rollback.


## Shared-expense completion — 2026-10-10
Existing multi-person ledger retained and verified for 2, 3 and 5 people. Focused mobile improvements: compact people summary with explicit participant count; uncertain expense/repayment save locks the attempted details and offers direct idempotent check; stale corrections/settlements can explicitly reload current state; confirmed person creation followed by failed refresh retries the refresh rather than creating another person. Pending-save entry now identifies the attempted expense/repayment. Missing edit records cannot turn into new expenses. Repayment completion has correct success wording.
16 targeted automated tests, 26 actual-component React Native Web scenarios and 104 hosted staging assertions passed, including invitation identity/acceptance/expiry/removal, permissions, group subsets, exact cents, partial repayments and replay. Types, scoped lint and iOS/Android bundle exports passed. Development Metro source updated; no backend/deployment change required. TestFlight unchanged. Native touch/keyboard/app-relaunch and real invitation email/deep-link delivery remain acceptance gates; no messages or paid calls sent. Next: bounded repair/maintenance completion using existing implementation, alongside physical capture/sharing acceptance. See docs/shared-completion-2026-10-10.md.

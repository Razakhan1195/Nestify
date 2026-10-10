# Repair completion and recovery — 2026-10-10

## Changed
- Repair photos now use Rezlee's existing local image preparation instead of immediately rejecting oversized/HEIC phone images. Photo entry uses the established ActionCard; errors preserve the written description.
- Cleared a stale read flag when saving invalidates a refresh. This prevents a pending read/save race from silently stopping subsequent guidance polling.
- Stop and get help opens the saved editable request directly. Brief save/share and resolution controls stay focused; competing step actions are hidden while entering a resolution.
- Resolved and reopened cases no longer advertise unavailable AI retries. A recurring renter issue returns to landlord help rather than changing to professional-only status.
- AI output schema now constrains step/source/passage identifiers to the supplied set. Independent safety, matching-source and exact-evidence validators are unchanged. Runtime failure diagnostics include only a source count and bounded code, not symptoms, prompts or model output.

## Preserved / removed / technical impact
Existing navigation, visual system, safe guide catalogue, customer-reported outcomes, saved history, brief editing/sharing, version guards, idempotent retry store and owner-only repair permissions remain. No features removed. Four scoped source files changed; no schema, new dependency, auth/integration or infrastructure changes. Photo originals remain explicitly not retained in repair cases, as before. Receipt storage is unrelated and unchanged.

## Executed verification
- 36 targeted unit tests passed: repair state machine, adaptive safety, exact citations, constrained identifiers, renter/owner recurrence and existing photo-preparation logic.
- 26 actual repair-screen interaction scenarios at 320/390 CSS pixels passed: empty/load retry, creation, immediate hazard response, photo preparation/cancel/failure, resolution, reopening, direct escalation, edited briefs, lost-response replay and reload, and the refresh/save/poll race. Real retry storage/state-machine code exercised with controlled API/native boundaries. No horizontal overflow in those states.
- Visual inspection: photo entry, service-request review and reopened issue at narrow/standard widths. Native header/icons are substituted in the browser harness; this is not physical iPhone design acceptance.
- 22 hosted staging assertions passed: hazard create, no unsafe step, replay, mismatched request, household isolation, useful unknown-model fallback, resolution, retained check evidence, stale action rejection, renter recurrence, brief edit/resume and final outcome. One controlled fallback case was seeded to avoid uncontrolled AI calls. Two disposable accounts and fixtures cleaned.
- Root/mobile TypeScript, scoped ESLint, isolated Vercel build and iOS/Android exports passed.

## Live AI result — unresolved release gate
Two bounded initial-guidance requests, each in a disposable household, were executed through existing AI limits. Both returned useful rule-based fridge guidance rather than accepted AI guidance. First hosted warning: Unsupported citation. The response schema was hardened to valid supplied IDs. Second hosted warning: guidance_failed, evidenceCount=0. The same manufacturer article was retrievable from the connected Mac (10,930 characters), but hosted retrieval returned no evidence; the precise deployment-side source failure is not established. The schema correction did NOT prove the live AI path fixed. No further model retries were made, and no live follow-up AI response is certified. All live-test accounts/fixtures were removed. This is a real outstanding limitation, not a passing AI acceptance result. The safe fallback remains usable and labelled.

## Availability and remaining gates
Expo Go Metro 8082: reload → Care → Help me fix this. Backend staged at https://staging.rezlee.com, nestify-1qlicksv4. Production, website and TestFlight unchanged. No paid utility pulls, schedules or customer messages. Two live AI generation attempts may consume the existing allowance; no cost amount was measured.
Physical image picker/HEIC conversion/sharing, native interruption and two-device invitation/push delivery remain unverified. Paired iPhone detected, but no second tester session or native interaction surface used.

## Rollback
Base HEAD 2a0594a. Scoped before.zip/after.zip and hashes contain the exact four source files; changes.patch supports review/reversal without disturbing the substantial existing dirty tree. Restore only those files. Previous staging alias: https://nestify-3bc38zyjn-razakhan1195s-projects.vercel.app. No database rollback needed.

## Next
Resolve hosted repair-source retrieval with bounded diagnostics and repeat live AI acceptance; then real-device repair/photo and two-device invite/settlement/push acceptance. Do not describe AI troubleshooting as launch-verified until the hosted evidence issue is resolved. No new feature expansion.

# Repair evidence and customer-outcome fix — 2026-10-10

## Changed
- `src/lib/issues/repair-evidence.ts`: bounded, privacy-safe retrieval diagnostics; title participates in source selection; hourly caching of success and failure; short reviewed manufacturer excerpt available when live retrieval is refused. Exact source URL and original review date preserved; reviewed copy expires after 30 days and is never represented as a newly retrieved exact-model manual.
- `src/lib/issues/adaptive-guidance.ts`: fixed Gemini-incompatible empty enum members using a `none` transport sentinel, normalized back to the existing internal format. Independent citation/safety checks preserved. At most one separately budget-reserved model fallback for a transient 5xx/timeout, within a shared 22-second deadline; no retries for invalid/unsafe content, authentication, schema rejection or quota errors.
- `src/lib/issues/repair-guides.ts`: door-only symptoms no longer get unrelated airflow checks or a warm-fridge headline. Cooling cases retain airflow checks.
- `src/app/api/mobile/v1/repairs/route.ts`: safe failure classification and fallback admission; a rejected answer during preparation no longer falsely says it was saved.

## Confirmed cause and result
Whirlpool returns HTTP 403 from staging; the same public article was readable on the connected Mac. We did not bypass that refusal. The model failure was separately misnamed by the SDK: GatewayInternalServerError with HTTP 400 / structured-output rejection. Replacing empty enum members fixed live generation. Two strict live tests returned AI guidance with actual source snippets, rather than accepting fallback as a pass.

Customer outcomes:
1. Unknown-model fridge door obstruction → relevant step → customer-reported resolution → recurrence preserves evidence and landlord path.
2. Warm fridge with an already-closing door → vents step without repeating door check → cannot perform safely → saved, editable professional brief.
Initial guidance observed after 3.074s and 2.879s of polling following case creation. Sample size two, both refrigerator scenarios; not a general latency or success-rate claim. No manufactured diagnosis, warranty coverage or automatic external contact.

## Preserved / removed / technical impact
Existing Care entry, mobile design, one-step interaction, saved history, photo workflow, permissions, safety stop, original progress format and completion/escalation flows preserved. No screens/features removed. No schema, authentication, integration, dependencies, production settings, website or schedules changed. Existing failed cases retain their history and can use Try preparing guidance again. Mobile/TestFlight binary unchanged; server update is on staging.

## Verification
- 44 focused unit tests passed, including source refusal/expiry, privacy-safe diagnostics, sentinel compatibility, no invented citations, relevant steps, hazards, replay and recurrence.
- 22 real staging regression assertions passed: save, resolution, reopen, brief, permissions, idempotency and cleanup.
- 18 strict live AI journey assertions passed across two disposable households. Five initial generation requests total during investigation, including three failed diagnostic attempts; no provider retrievals/emails.
- Root TypeScript, scoped ESLint and isolated Next/Vercel build passed.
- Every disposable account and repair record cleaned up.
- No native phone interaction or new screenshot/visual acceptance claimed this turn. Existing screen layout is unchanged.

## Remaining limits
This proves the two tested refrigerator journeys, not every fault/manufacturer. The reviewed fallback currently covers the refrigerator reference only. Other publisher retrievals need category-specific live acceptance before broad reliability claims. The reviewed excerpt expires after 30 days; revisit the primary guidance before renewal. Exact-model/disassembly work remains outside these safe checks. If a reference cannot be validated, use supported observations or the saved service brief, never invented citations. Native touch/background/resume acceptance remains.

## Availability and rollback
Staging: https://staging.rezlee.com → https://nestify-5j44ckwxo-razakhan1195s-projects.vercel.app.
Previous alias: https://nestify-1qlicksv4-razakhan1195s-projects.vercel.app.
Before-edit commit: 0562b6d. Exact four-file prior state is in `docs/checkpoints/repair-evidence-20261010/before.zip`; after.zip, hashes and changes.patch preserve the scoped source change despite the pre-existing untracked worktree. Do not reset/clean the repository. To roll back, restore only those four files from before.zip and repoint staging to the previous alias target. No database rollback required.

Next: native repair acceptance plus live validation of the remaining existing source categories; no new feature expansion.

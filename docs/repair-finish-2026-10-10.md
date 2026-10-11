# Repair finish checkpoint — 2026-10-10 / 11 UTC

## Outcome and boundaries
The existing Help me fix this engineering increment is complete and staged. Customer payoff: a relevant safe check, a saved resolution, or an editable landlord/professional request containing symptoms and attempted checks. Known limits lead directly to help, not arbitrary questions. This is not universal model-specific repair coverage. Native-device and real-user acceptance remain explicitly pending.

## Changed
- Kept one-device Wi-Fi and known tap scope from being asked again; explicit unknown models are no longer requested repeatedly.
- Centralized stop conditions across AI and fallback: known provider outage, wider supply problem, inability to compare taps, under-sink/unknown leak location, and a specifically described unsupported repair.
- Reused official Rogers/Moen/Whirlpool guidance with exact reviewed excerpts, dates, 30-day expiry and bounded live retrieval. Evidence is fetched only for eligible checks. No arbitrary URL fetching or unsupported new repair categories.
- Fallback physical checks now require actual supporting evidence. Safe observations remain useful without an exact model or article; unsupported cases produce a help request. No fabricated model, diagnosis, warranty or repair success.
- A model cannot choose a sourced check when no eligible supporting passage exists. Exact citation URL alone is insufficient: the passage must also support the selected check.
- Added a read-only public reference-health command and a finite native/customer acceptance sheet.

## Live findings fixed during this increment
1. Heating selected a sourced check without source evidence. Independent validation rejected it and fell back safely. Restricted model outcomes for observation-only requests; the same heating scenario then passed with AI and no misleading citation.
2. “All taps have weak flow” missed the singular-only tap classifier. It unnecessarily asked an already answered question. Added plural recognition and regression coverage; the final hosted case terminates promptly with a useful wider-supply explanation and no AI request.
These failed runs are retained in QA evidence rather than hidden.

## Executed and inspected
- 59 focused unit tests passed: selection, source acceptance/expiry, hazard/stop gates, no repeated checks, outcomes and recovery.
- 26 actual mobile-component RNWeb scenarios at 320/390 widths passed, including loading/create, photo failure/cancel, hazard, resolution, editable brief, uncertain save, return/race and offline. Visually inspected editable-request renders at both widths. Native image/router/header boundaries are mocked; no claim of actual physical safe-area, keyboard or share-sheet acceptance.
- 22 authenticated hosted staging regression assertions passed on the final deployment: create replay/conflict, household isolation, signed-out denial, resolution/recurrence, editable brief, stale actions and cleanup.
- 48 unique acceptance assertions across eight hosted journeys: single-device internet, unknown-model low faucet flow, heating display, leak location, known provider outage, wider water supply, unsupported microwave symptom and hazard stop. Four distinct successful AI journeys; initial guidance observed about 2.9–3.1 seconds including polling. One observation per case is not a reliability percentile or category-wide certification. Six AI-triggering cases including two diagnosed failures; no paid utility retrievals or customer messages. All disposable QA users/data cleaned.
- Public source-health check verified all three reviewed excerpts against actual articles from the connected Mac. This is separate from host availability; the reviewed fallback remains necessary when a publisher denies server retrieval. Root TypeScript, scoped ESLint and isolated deployment build passed.
- Previous refrigerator acceptance remains documented in docs/repair-evidence-2026-10-10.md. It was not needlessly rerun with additional paid AI calls.

## Preserved / removed / technical impact
Preserved the existing mobile screens, visual system, saved issues, response controls, editable briefs, reopening, household permissions, authentication, uploads, integrations, bill logic, maintenance, website and current Bell/telecom staging work. No feature removed. No schema, migration, dependency, mobile navigation, credentials or production change. Existing source files are untracked baseline in this working tree; exact before/after archives and a scoped patch capture their state without sweeping unrelated work into Git.

## Test access and remaining gate
Use the current staging app → Care → Help me fix this. Server fixes are live; no new TestFlight binary was built. Device pairing was visible, but no available native automation surface could interact with the phone. Do not claim physical acceptance. Follow docs/repair-finish-phone-acceptance-2026-10-10.md for the bounded iOS/Android touch, keyboard, share, interruption and recovery checks, then three uncoached users with real non-hazardous issues. These are the remaining sign-off gates, not a mandate for additional features or endless source expansion.

Known limitation: photo analysis does not retain the original photo with the issue; preserved disclosure says so. Heating and unknown-equipment support is observation/escalation, not exact-model repairs. Older conservative hazard matching can over-classify negated danger descriptions; no safety downgrade was made. If source access and reviewed references both fail, supported observation/help remains available. No source-review scheduler was enabled.

## Source operation
Run `npx tsx scripts/qa/check-repair-references.ts --online` weekly and before release. This makes only public reads, no AI/provider retrieval. Changed/unavailable articles and references within seven days of expiry need manual review; never auto-renew dates. Current reviewed references expire after 30 days. Dates and access type remain explicit.

## Deployment and rollback
Final staging: https://nestify-qq6i35bb7-razakhan1195s-projects.vercel.app
Before staging: https://nestify-cd505kme8-razakhan1195s-projects.vercel.app
Source rollback point: 6a87a96 plus docs/checkpoints/repair-finish-20261010/before.zip and before.json. Use the exact four-file snapshot (or reverse the reviewed scoped patch); never reset/clean the shared worktree. Confirm no later unrelated staging deployment before restoring an alias. Final source is in after.zip with SHA256 manifest; changes.patch is reviewable. Production, public website and scheduled utility pulls remain unchanged/off.

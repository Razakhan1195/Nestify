# Bill usefulness — 2026-10-08 checkpoint

## Scope and result
First milestone in the founder’s approved core-quality priorities: trustworthy bill comparisons and usable history charts. Implemented in the mobile working tree and backend deployed to staging. This does not certify every provider or complete the remaining roadmap.

## Changed
- EZGB amounts are explicitly identified as amount due when issued. They are not normalized as current-period spending or called savings.
- Connected comparisons show billing days and comparable provider-reported usage per day. Matching units, valid completed periods and coverage are required; overlapping revisions, mixed currencies/services, estimated readings and unverified electricity scale do not manufacture comparisons.
- One bill, partial history, missing amounts/usage and credit states retain useful saved facts and specific explanations.
- Manual and connected histories share selectable bars, exact selected values/periods, accessible previous/next controls and an action opening that statement ID. Existing manual charge-per-day calculations are reused.
- Connected electricity plan cards follow the bill history; gas/water remain outside electricity-only requests and comparisons.

## Preserved
Existing design tokens, account routing, uploads/review/originals, household permissions, utility retrieval and reconnection, interval calculations, integrations and customer data. Invitation configuration and its deployment check retained. Website, authentication, database schema, notifications and scheduled pulls untouched. No working feature removed.

## Verification
- 61 focused unit tests passed (period arithmetic, missing/overlap/partial/credit data, service gating, manual stories).
- Root and mobile TypeScript plus scoped lint passed.
- 24 actual-component React Native Web scenarios passed: manual, connected gas/electricity, one bill, partial history, empty, loading and failure/retry at 320/390/430 widths. Verified bar selection opens the selected ID; gas makes no electricity request. Synthetic data and mocked API/router/native boundaries only.
- Visually inspected gas overview at 320, connected chart at 390, manual chart at 390 and error state at 390. Screenshots retain the existing design. Native icons are mocked in this harness.
- iOS and Android production JS/Hermes exports passed. These are bundle checks, not physical-device acceptance or new TestFlight binaries.
- Hosted staging empty-household Bills response passed. Invitation readiness still rejects self-invites and invalid split participants correctly; zero emails sent, disposable test user cleaned up.
- Existing staging development server on port 8082 reports running; no phone session was attached at final check.

## Availability
Backend: https://staging.rezlee.com -> https://nestify-j30htf3jw-razakhan1195s-projects.vercel.app
Mobile changes: current development source. Reload the staging development build to inspect Bills > Insights/account, then tap a history bar. Existing TestFlight binary is unchanged and will need the next native release for these UI changes.

## Remaining gates
Physical iOS/Android, VoiceOver/TalkBack and enlarged native text acceptance remain. Provider-by-provider live import/refresh tests were not executed. No paid retrieval was initiated. Unknown reading-quality codes remain provider-reported, not asserted actual. No causal weather/rate/savings claims. The utility API still returns amount due, not proven period charges; reliable charge breakdown import remains a later targeted task.

## Rollback
Before: docs/checkpoints/bill-usefulness-20261008/before.zip and before.json; HEAD at entry 961a97c. After: after.zip, manifest.json and changes.patch. To undo only this task, verify current file hashes against manifest, restore seven existing files from before.zip, remove only the three newly added files listed in manifest, and restore the staging alias to https://nestify-pl2jzc8bt-razakhan1195s-projects.vercel.app. Never reset the whole repository: it contains substantial unrelated uncommitted work.

## Next milestone
Finish the import-to-insight journey: single/bulk receipt and bill capture, originals, deduplication across email/manual/provider records, corrections and interrupted-job recovery. Then shared-expense and repair completion journeys, useful returns, and release acceptance. Keep the scope incremental; no redesign or new features required.

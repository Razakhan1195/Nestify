# Shared acceptance and maintenance recovery — 2026-10-10

## Changed
- Maintenance saves persist the attempted selection before sending. If the response is uncertain, the original tasks stay locked and one “Check saved plan” action retries the same request. The state survives reopening.
- A definite rejected request allows correction. Older server uncertainty messages are recognised. Generation temporarily locks its inputs so results match the chosen setup.
- Pending draft writes are preserved on leaving. Confirmed saves clear the draft and return to Care only after the navigation save guard is released.
- The maintenance save API now distinguishes transient uncertainty (503), invalid input (400) and permission rejection (403).
- DateField gained an optional disabled state, used only where needed by this screen.

## Preserved / removed / technical impact
Preserved existing visual system, selected-area customisation, landlord/building responsibilities, source links, dates and optional recurrence, task completion, original save request identity, existing drafts and repair journeys. Shared product source was not changed in this slice. No features removed, dependencies added, schema changes, migrations, provider calls, scheduled pulls, customer messages, production or TestFlight changes.

## Verified
- 34 live staging shared-expense assertions: three participants see saved/corrected entries, author permissions, partial/full payer and recipient settlement, replay, stale-balance rejection, correct counterpart inbox notices, reminder cooldown and correction. Three disposable accounts and fixture rows cleaned.
- 19 deployed staging Care assertions: new incomplete renter household, empty list, two selected areas, sources and landlord context, save/replay without duplication, adoption, active/completed history, completion replay, changed-payload rejection, isolation and signed-out access. Two disposable accounts and fixture rows cleaned. Guided plan used no AI calls.
- 48 targeted unit tests passed across maintenance/save identity, repair safety, adaptive steps, source evidence, resolution and reopening.
- 16 actual-component rendered interaction scenarios at 320 and 390 CSS pixels: success, lost response, reopening pending save, legacy uncertain response, definite validation rejection, initial load failure/retry, generation failure/retry and local storage failure/retry. Navigation mock rejects transitions while the guard is active. Horizontal overflow checks passed on captured recovery states.
- Root/mobile TypeScript, scoped ESLint, isolated Vercel build and iOS/Android bundle exports passed.
- Recovery screenshots inspected at 320 and 390. These are React Native Web harnesses with controlled synthetic data and mocked native/API boundaries, not physical-device acceptance.

## Availability
Mobile source is available through existing Expo Go Metro 8082; reload then Care → Maintenance plan. Backend staged at https://staging.rezlee.com (nestify-3bc38zyjn). No new TestFlight binary.

## Remaining limitations
- Physical two-device notification delivery, real invitation email/deep links, native keyboard/back gesture/app termination, and live AI repair-guide quality still need acceptance.
- The earlier intermittent Expo expense display problem was reported working again by the founder. It was not reproduced or fixed here; fresh hosted list/detail reads passed. Do not claim its root cause resolved.
- Repair source was inspected and regression-tested, not rebuilt. No paid AI or provider requests were initiated.
- No universal certification of connected providers or production release readiness.

## Rollback / checkpoint
Before/after archives and SHA-256 manifests cover exactly five edited source files; changes.patch is the scoped diff. Base HEAD e5a7cc9 contained earlier checkpoint work, while the repository had substantial pre-existing uncommitted changes. The before.zip, not resetting the whole repository, is the exact pre-change recovery point. Restore only these files if needed. Repoint staging to https://nestify-1e2zkzb97-razakhan1195s-projects.vercel.app to roll back this backend release. Database unchanged.

## Next milestone
Physical shared-expense settlement/invitation/push acceptance and one complete repair journey (describe → safe guidance → response → resolve or service brief → resume/reopen). Reuse current implementation, fix only observed failures. Native capture and release acceptance remain gates.

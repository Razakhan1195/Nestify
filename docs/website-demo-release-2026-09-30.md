# Website demo release and marketing handoff — 2026-09-30

## Completed
- Published real app demos in an iPhone-style frame for Bills, shared expenses, Vault and Care.
- Reused the existing feature tabs and page layout; replaced the illustrative feature panels.
- Added explicit play/pause/replay, poster fallback, loading/error/retry, visibility pause and accessible text walkthroughs.
- Actual beta app/sample-data disclosures remain visible. Sharing records obligations; it does not move money.
- No schema changes, provider retrievals, scheduled pulls, ad pixels or outbound marketing messages.
- Waitlist, consent, offer allocation, limits and backend routes preserved.

## Release
- Worktree: /tmp/rezlee-website-production-20260930
- Branch: release/website-2026-09-30
- New deployment: dpl_2Ld1xCury9x7baqpZNofS4XT7pJ7
- Candidate: https://nestify-dv7aw6nqj-razakhan1195s-projects.vercel.app
- Promoted successfully; verified https://rezlee.com/#product in browser.
- Prior production rollback target: dpl_Hj1ygpnQhFdHqFDt3SmTEtMyJisV
- Do not merge this older release branch over newer application work. Selectively carry the marketing component changes forward.

## Verification
- npm run typecheck: passed.
- Scoped ESLint: passed.
- npm test: 18 passed, 0 failed. Local PGlite bootstrap now includes service_role bypassrls, required by existing waitlist migrations. This changes the local test harness only.
- Production build: passed.
- All four videos played to completion on the live desktop website: Bills 13.7s, sharing 11.1s, Vault 5.6s, Care 10.3s.
- Feature switching and sharing text walkthrough interacted with.
- Current waitlist count rendered and existing public/legal links remained present. No signup or email was triggered.
- Responsive CSS reviewed; physical iPhone/Android browser acceptance remains unverified.
- Video failure/retry handling implemented but network-failure injection was not performed.
- All 17 MP4 files (13 framed marketing exports + 4 web clips) decoded without errors; format/duration checks recorded in marketing pack.
- PDF page layouts inspected and spillover/blank pages corrected.

## Marketing handoff
A separate Rezlee Launch Kit contains 13 videos, 18 graphics, 13-page GTM plan, 8-page channel copybook, source files and a media-validation manifest. Covers vertical, 4:5 feed, landscape and square formats. Silent videos use actual sample app footage, restrained transitions and preserved screen data. Social posts, email drafts and ads have not been published/sent.

## Before broader promotion
- Confirm native beta installation and end-to-end release gates.
- Verify final placement previews on each publishing platform and physical phones.
- Application waitlist email caps are 80/day and 2,000/30 days; review deliberately before scaling.
- Campaign UTM links are prepared; first-party signup attribution is not implemented by this release.
- Founder needs valid sender identification/mailing information and consent scope reviewed before campaign emails.
- Optional CAD750 research budget in GTM document is a proposal, not spending authorization.

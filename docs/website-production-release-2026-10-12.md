# Rezlee website privacy and waitlist release — October 12, 2026

## Production result
- Production: https://rezlee.com
- New Vercel deployment: dpl_3qYdGkQVGrDVbcb45hJavyEKqR7r
- URL: https://nestify-4xnfgphj6-razakhan1195s-projects.vercel.app
- Previous live deployment for rollback: dpl_6ThsZuxkM7DWBHmCe86cd8WtN5gC
- Previous URL: https://nestify-2ul09f0xc-razakhan1195s-projects.vercel.app
- Scoped release branch: release/website-2026-10-12
- Production backend/database was **not migrated**. Production already supports immediate signup via rezlee_register_waitlist (202610010001). A later unmerged experimental email-only migration from the large development workspace is not part of this release.

## Changes
- Replaced lengthy technical waitlist and general privacy explanations with consumer-friendly copy. No hosting/database/email vendor names appear in those disclosures. Meaningful cross-border processing, tracking (where enabled), rights, and deletion disclosures remain.
- Removed the signup consent checkbox and public capacity polling; affirmative signup and clear marketing email disclosure remain. Single email input and button; duplicate signup still uses existing backend idempotency.
- Preserved reserved/nonreserved success messages, signup API, unsubscribes, and reservation allocation.
- Updated founding offer to avoid exposing campaign held-back allocation and updated the legacy confirmation link page.
- Homepage describes email-only membership signup and avoids redundant technical detail.
- App/mobile/backend development branch was not deployed.

## Checks performed
- Production baseline: TypeScript passed; 23/23 tests passed; focused ESLint passed.
- Vercel Preview candidate (protected URL) built successfully. Eight public routes rendered; unwanted technical disclosures absent.
- Vercel Production deployment built successfully with production env; deployment promoted.
- Live rezlee.com inspected via Vercel: mapped to new deployment; eight public routes returned HTTP 200.
- Production /api/waitlist GET returned available=true with public availability >0; invalid POST returned 400.
- Read-only database check showed the owner's existing waitlist email was confirmed and had a reserved slot; no test signup was sent or reservation changed.
- No paid provider pulls or new scheduled jobs were activated.

## Follow-up boundaries
- No legal professional has formally signed off the final privacy/CASL language. Obtain counsel review as appropriate.
- Advertising-tracker consent and actual network behaviour should be verified whenever a tracker is enabled, especially any server-side events.
- A live *successful* POST with a new disposable email was not performed to avoid consuming or changing a production membership. Do not claim it was tested.
- For rollback, promote the previous deployment ID, then verify rezlee.com pages and signup.

## Live responsive QA
- Actual rezlee.com rendered through Chrome device emulation at 360px, 390px and 1280px without horizontal overflow.
- Visually inspected the live mobile waitlist: one email field, one primary button, no checkbox, and working visible links to offer terms and privacy.

## Homepage admin redirect hotfix
- The homepage previously checked `operatorAccess()` and redirected authorized admin sessions to `/admin`, which in turn redirected to `/admin/waitlist`. This caused the public domain to behave like an admin bookmark for signed-in operators.
- `src/app/page.tsx` now always renders the public landing page. Admin routes retain independent authorization via `operatorAccess()`. The customer web feature gate remains unchanged.
- Added a regression test verifying the homepage no longer redirects to admin and the admin dashboard still checks authorization.
- TypeScript, targeted lint and all 24 production-baseline tests passed.
- Host deployment: dpl_6HyuyJGdKq9YGJ7SuzAQimocAL2i (https://nestify-nraugrkde-razakhan1195s-projects.vercel.app). Promoted to rezlee.com. Previous deployment dpl_3qYdGkQVGrDVbcb45hJavyEKqR7r remains available for rollback.
- Live smoke checks: / returns 200 with "Less home admin" public hero; unauthenticated /admin/waitlist redirects to /admin/access; /privacy and /waitlist/privacy return 200.

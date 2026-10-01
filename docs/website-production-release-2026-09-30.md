# Website production release — 2026-09-30

User explicitly authorized publishing all latest website changes and removing sign-in in favour of Apple/Android links.

Live: https://rezlee.com/ . Deployment dpl_4D2U5ojec7KAPwUyN4Pudg6vjT1t / nestify-1m1ll9r3k-razakhan1195s-projects.vercel.app. Previous production dpl_F4tQT3aSz8pdKZBzpqyAV6oS3Exk / nestify-c3f4qpc8y-razakhan1195s-projects.vercel.app retained for rollback.

Production source branch release/website-2026-09-30, commit 7007314. Isolated worktree /tmp/rezlee-website-production-20260930 starts from exact production SHA 6c79a00 and overlays new landing page/CSS/provider assets/root render plus existing dependency security patch 1186ffa. No staging backend migrations or features promoted. No DB/settings mutations. Empty deployment cron list preserved. Main development worktree untouched except latest landing component/CSS changes and these notes. Do not merge the old release baseline over current development.

Removed header/mobile/footer sign-in and web-signup calls to action. Header App Store and Google Play controls navigate to explicit iPhone/Android availability sections. Both public store URLs returned HTTP404; do not invent public downloads. Labels say Coming soon. Replace anchors with verified listings after store publication.

Checks: release TypeScript/scoped ESLint passed; all 11 production-baseline regression tests passed; cloud Next16.3.3 production build passed; candidate HTML had new content/platform anchors/no login or signup CTA/no noindex. Public homepage/login/assets HTTP checks passed; anonymous /app redirects to login. Live desktop homepage visually inspected; both store controls clicked and correct platform section observed. Latest mobile-width changes not physically verified. Auth functionality preserved rather than removed with its marketing link.

Next: complete deletion/recovery/social sign-in lifecycle; native iOS/Android acceptance of bills, sharing, care, repair AI and utility freshness; production schema/backup rehearsal and controlled promotion; monitoring/limits/privacy/store declarations; production-backed builds, invited cohort, then public store review. No new feature expansion required first. Quote comparison/expanded capture/benchmarks remain after these gates.

Build8: iOS EAS FINISHED, submission 8961543f-79c0-454e-ab71-cc6c3fb50f40 IN_QUEUE at check. Do not equate cloud build with TestFlight visibility.


## Follow-up: actual app demo release
The real iPhone-framed demo update is now live. See `docs/website-demo-release-2026-09-30.md` for deployment, verification, rollback and marketing handoff. This supersedes the prior website deployment only; application work and waitlist behavior remain preserved.

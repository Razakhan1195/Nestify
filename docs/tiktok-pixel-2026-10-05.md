# TikTok pixel release — October 4, 2026 (Toronto)

User requested installation of Rezlee pixel DB1FAO3C77U1PLPL6HHG on rezlee.com. Published the existing production site using its Vercel project; no new site or mobile/backend promotion.

Live: https://rezlee.com/
Deployment: https://nestify-kw4kvlkh6-razakhan1195s-projects.vercel.app
Source: a89c1b7 on feat/tiktok-pixel-2026-10-05, pushed to origin.
Pre-change source: 96d5670.
Pre-change deployment retained for rollback: dpl_AYsdjsnL7URg8fNZkdjkkzyZoVWt, https://nestify-m1uf49f36-razakhan1195s-projects.vercel.app.

The official TikTok bootstrap loads after optional marketing consent on the production homepage only. Unknown URL query parameters, staging, auth, admin and private routes do not initialize it. PageView is queued once per initialization. Successful waitlist API responses queue CompleteRegistration, except honeypot submissions. No manual identify call or customer data is supplied in the event. Tracking is at most once per browser session, not a server-side count of unique people. Existing duplicate-email responses remain intentionally non-enumerating, so a returning signup from a different session can still produce another event. The Events API is not installed.

The email-only waitlist signup remains unchanged. Marketing-cookie choice is independent of waitlist email consent. Decline works without blocking signup. Cookie settings permit withdrawal; revocation unloads SDK observers by refreshing, clears known first-party pixel cookies, and keeps consent declined. Homepage links to other pages use full navigation so the SDK cannot persist into contact, support or private pages. Privacy and waitlist notices describe this optional integration.

Validation:
- Full ESLint and TypeScript passed.
- All 25 regression tests passed, including production/private route gating, no SDK before consent, single initialization, session event deduplication, SDK failure isolation and withdrawal.
- Final small consent-panel hash correction passed scoped ESLint and TypeScript.
- Vercel production builds passed and final release aliased to rezlee.com.
- Live browser: no TikTok scripts before acceptance; exact supplied pixel URL and TikTok main/identify scripts loaded after acceptance; navigation to privacy unloads scripts; withdrawal removes scripts; final settings decline closes panel and restores homepage URL. Desktop notice visually inspected.
- Did not submit a fake signup to production, create a fake conversion, test native mobile layouts, or verify receipt inside TikTok Events Manager.

Carry these public-site changes forward deliberately if the separate mobile/backend checkout is later promoted. Do not overwrite newer application work with this older production baseline. No database, cron, authentication or mobile code changes.

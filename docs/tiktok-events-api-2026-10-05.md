# TikTok Events API preparation — October 4, 2026 (Toronto)

Continues the user's request to install TikTok tracking on rezlee.com. Pixel ID DB1FAO3C77U1PLPL6HHG. This follow-up adds server-side CompleteRegistration for the existing waitlist only. Shopping/payment/search events from the generic TikTok setup sheet do not match the site's actual waitlist actions.

Source: 380246b on feat/tiktok-events-api-2026-10-05, pushed to origin.
Production deployment (successful build, aliased to https://rezlee.com): https://nestify-8ts1g9pyo-razakhan1195s-projects.vercel.app
Rollback: prior source a89c1b7 and deployment https://nestify-kw4kvlkh6-razakhan1195s-projects.vercel.app.
No database, authentication, cron, mobile or dependency changes.

## Activation blocker

No Events API token was provided by the user and Vercel production environment names showed no TikTok token. The browser pixel remains operational; server transmission stays disabled until TIKTOK_EVENTS_ACCESS_TOKEN is configured.

Generate the token from TikTok Events Manager for Rezlee pixel and enter it directly as a sensitive Production environment variable named TIKTOK_EVENTS_ACCESS_TOKEN in the existing Vercel nestify project. Never use a NEXT_PUBLIC_ variable, commit the token, echo it, or include it in chat/logs. Redeploy the same verified source after setting it. Then use TikTok's Test Events workflow to verify accepted receipt and matching browser/server event IDs. Do not send fabricated conversions as real production events.

## Implementation

The client sends optional marketing consent plus available TikTok click/cookie identifiers with the existing registration request, only on the production homepage and while tracking is permitted. It sends nothing for opted-out or already-tracked browser sessions. No email or phone number is forwarded by the server adapter.

Only after a successful database registration, the production route creates a UUID event ID and returns it with the normal success response. The browser passes the ID as the third argument to ttq.track. The server uses that same ID, pixel and CompleteRegistration event. The background callback uses Next.js after so analytics latency/failure cannot block signup. With no token it schedules no network request.

Server payloads contain the canonical homepage URL, timestamp, event ID and allowlisted ttp/ttclid identifiers plus validated Vercel-forwarded IP and bounded user agent when available. They exclude raw URLs, referrers, other cookies, email, phone and household details. Invalid/missing consent and non-production hosts are rejected. No order value or invented purchase event is sent.

Requests target the fixed TikTok Events API 2.0 endpoint with a server-side Access-Token header. There are at most two attempts, each bounded to 2.5 seconds; transient retries reuse the original event ID and timestamp. Success requires both HTTP success and TikTok code 0. Warnings contain status/code only. Delivery is best effort, with no durable queue or retrospective replay.

As with the prior pixel implementation, session-level suppression is not a database count of unique people: a repeat email in a new browser session can still produce a new conversion. No new database schema or enumeration-prone duplicate email response was added.

## Verification

Full ESLint, TypeScript and 28 regression tests passed. Added tests cover consent, production route gating, exclusion of email/tokens/private cookies, disabled-token zero-request behavior, correct endpoint/auth header, stable retry IDs, API rejection/network isolation, and shared browser event ID. No real signup or fake production event was submitted. Actual TikTok API acceptance and attribution remain unverified until the token is configured.

Official references:
- https://business-api.tiktok.com/gateway/docs/index?doc_id=1771100779668482
- https://ads.tiktok.com/help/article/event-deduplication?lang=en
- https://ads.tiktok.com/help/article/tiktok-adobe-eapi-implementation-guide?lang=en
- https://nextjs.org/docs/app/api-reference/functions/after

Production Vercel build passed. Live homepage, privacy notice and read-only waitlist availability checks passed. Server events remain disabled pending the token.

## Activation follow-up

The user confirmed adding the token. Vercel environment metadata confirmed TIKTOK_EVENTS_ACCESS_TOKEN as a sensitive Production variable; its value was neither read nor printed. Redeployed source ebcf78f to https://nestify-2ul09f0xc-razakhan1195s-projects.vercel.app and Vercel confirmed READY/aliased to https://rezlee.com. The new deployment picks up the Production secret, enabling the existing server send path. Build and live homepage/waitlist availability checks passed. No additional application code changed.

This supersedes the missing-token blocker above. Actual TikTok token validity/event acceptance has not been exercised. Controlled verification still needs the pixel's Test Events code, available in TikTok Events Manager. No existing TikTok tab was available in the connected browser. Do not equate successful deployment with confirmed TikTok receipt, send fake production signups, or expose the token to test it.

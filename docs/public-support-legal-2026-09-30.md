# Public support and legal rollout — September 30, 2026

## Scope and status
Built public /contact, /privacy, /terms, /disclosures and /delete-account; grouped homepage footer into Explore, Support and Legal. Existing founding offer and waitlist privacy remain linked. No fabricated Press, Jobs, Status, API or payment pages. Removed home street address and standalone email from homepage footer and client props. Mailing details remain in a contact-page disclosure linked directly from waitlist consent, and in confirmation emails. Waitlist stays enabled; no registration/counter/config changes.

Contact form: fixed server-side recipient from NEXT_PUBLIC_SUPPORT_EMAIL (raza@rezlee.com); optional name, email, topic and message. Topics include privacy and account deletion; no login required. Support email is visible on Contact. This creates an email request, not an automatic deletion or support-database ticket. Recipient/provider acceptance is distinct from human inbox delivery. Verify ownership before account data disclosures or destructive operations. No auto-reply/marketing subscription, no attachments. Messages remain in-page after failure, but not after closing/reloading.

Abuse controls reuse private atomic waitlist limit RPC: 4/hour keyed IP hash, contact 20/day and 300/rolling30days, plus existing shared outbound 80/day and 2000/rolling30days. Counters include failed attempts. Body size bounded16KB, message10–3000 chars, fixed topic subject, normalized email, recipient not user-controlled, plain-text email only, honeypot, same-origin. Resend idempotency key hashes request ID/content; normal retries retain it. This is provider-window deduplication, not a persistent support queue. Contact requests can consume shared mail allowance; direct email fallback remains visible. No new database migrations.

## Verified
Six contact/waitlist tests pass: input bounds/header-injection rejection, fixed recipient, deterministic delivery key, waitlist signed links and private database/race/idempotency/expiry/final-slot controls. Root and mobile type checks pass. Scoped website lint passes. Hosted/UI acceptance to append after deployment. No real support message or paid provider/AI call was sent in tests.

## App links
Added Help and legal rows in app Settings, plus Privacy/Terms/Help links in AuthFrame, using existing typography and error alerts when opening fails. Existing in-app Delete account preserved. Source changes typechecked, not device-tested or released in a new binary. Exact scoped patch in mobile-public-links-2026-09-30.patch preserves these changes without committing unrelated dirty mobile work.

## Founder/legal/operations review before public app launch
- Confirm the contracting legal entity/operator name and required business contact information. No incorporated entity was invented.
- Review privacy and terms with Canadian counsel, including applicable provincial rules, consumer rights and CASL consent identification/placement. Keeping contact details one click away is not a compliance certification. Replace residential mailing details with a business address/PO box when available.
- Confirm current AI provider commercial configuration, training use, retention and cross-border processing. Code permits direct Google plus Vercel Gateway/Google/OpenAI models. No zero-retention or no-training guarantee published. Complete appropriate in-app AI data-sharing disclosures/consent before launch; a policy page alone is not sufficient.
- Decide/document retention by data class, support-message retention, backup expiry and processors. Existing deletion tests do not prove all provider artifacts/backups are erased. No invented fixed erasure deadline published.
- Assign/monitor support/privacy inbox; verify actual receipt and reply, handle verified deletion requests and retain evidence. Manual contact request is not automatic deletion completion. Provider-revocation acceptance remains separate.
- Fill Apple privacy disclosures, Google Data Safety, account deletion URL and support URL using actual shipping SDK/data inventory. Native links need compatible release/device acceptance. Do not submit staging-connected binaries as production.
- Founding membership reservations are not yet paid-plan entitlement enforcement; honour before enabling monetisation.

## Official reference sources inspected
- OPC consent: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/
- CRTC consent guidance: https://web.crtc.gc.ca/eng/archive/2012/2012-549.htm
- Google deletion resource: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Apple privacy/review: https://developer.apple.com/app-store/review/guidelines/#privacy

Stable destinations: https://rezlee.com/contact (support), /privacy (website/app policy), /terms, /disclosures, /delete-account (web deletion requests), /waitlist/terms and /waitlist/privacy.


## Live website acceptance
- Production promoted: https://nestify-mnlql0j4c-razakhan1195s-projects.vercel.app (dpl_9YuKDfsVJBhVwhRseJV8V4fL9WzL). Supersedes dpl_Eye8LG3PbG7UugJC8nZu5ur6Rgug for a contact-label polish only.
- All six public destinations returned expected HTML; homepage HTML contains neither home street address nor standalone founder email. Waitlist API remains available=true (10,000 places when checked). Contact wrong-origin and invalid-payload requests correctly rejected before sending. No actual human-inbox delivery claimed.
- Live desktop screenshots inspected: grouped footer and Contact form. Links and mailing disclosure present. Mobile source typecheck passed; no physical phone or TestFlight acceptance for these additions. No utility/AI calls or scheduling changes.

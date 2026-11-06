# Rezlee AI processing policy and operating procedure

Owner: Rezlee founder / engineering owner

Decision date: November 6, 2026

Authority: Raza's instruction to implement useful OpenAI processing with proportionate safeguards.

Status: implementation candidate; activation and live provider acceptance pending a dedicated API key. This document does not record ZDR approval.

## Policy

Rezlee may use the OpenAI API for a requested product feature when the information's source, user permission, provider terms and retention are appropriate. ZDR is not a blanket requirement for every feature. Use the least information needed, preserve access controls, and keep model training/data-sharing incentives disabled for customer content.

| Input and purpose | Route in this implementation |
| --- | --- |
| Fresh uploaded bill, statement, receipt, appliance photo, warranty or document | Direct OpenAI when configured; otherwise existing protected Gateway |
| Fresh standalone web repair description / upload; mobile repair photo | Same direct option |
| Gmail messages, attachments, derived records and email-import processing | Protected Gateway with ZDR and no prompt training |
| Saved bills, quotes, warranties, inventory context, repair history, maintenance context and assistant conversations | Protected Gateway because present records do not reliably exclude Gmail-derived context |
| Passwords, API keys, OAuth credentials or authentication codes | Never intentionally include in an AI request |
| Missing AI permission, failed ownership check, disabled AI or exhausted budget | No AI request |

The source classification is assigned in reviewed server code, not accepted from request parameters. Merely disconnecting Gmail, deleting a connection, renaming a record, or calling it a summary does not remove its provenance. A customer independently selecting a local file is different from the server retrieving an imported record. Do not re-upload an imported record programmatically to bypass its route.

This is an initial implementation boundary, not a permanent prohibition on using OpenAI for saved records. Expand a route when reliable provenance proves it is eligible, or when the provider configuration satisfies the applicable commitment. Record the evidence and test it; no new committee or routine customer approval is needed for every request.

## Direct OpenAI controls

- Dedicated server secret REZLEE_OPENAI_API_KEY; no mobile/web bundle secret. Require REZLEE_OPENAI_DIRECT_ENABLED=true as well.
- Fixed official Responses endpoint and gpt-5-mini. No arbitrary base URL, model, API-key or routing override from a request.
- store:false; no previous response/conversation, hosted tools, remote file references or Files API uploads. PDF/image data is sent inline and filenames are generic.
- Standard API processing is not ZDR. OpenAI does not train on API content by default; standard abuse-monitoring content may be retained for up to 30 days, with applicable legal exceptions. Service metadata is distinct from response storage.
- Existing authenticated consent, ownership, daily allowances, rate controls and dollar reservations remain in effect. Every provider attempt must reserve before disclosure and settle using reported input/output totals, including reasoning tokens.
- Direct gpt-5-mini maps to the existing openai/gpt-5-mini price record. No unpriced model is admitted. Unknown failures keep their reservation.
- No automatic fallback from protected data to standard-retention OpenAI. Missing direct configuration preserves protected routing. A failed configured direct request returns the existing recoverable customer error; it does not silently fan out to another provider.
- Do not log prompt, original, response body, customer filename, credential or detailed provider error. Existing fixed failure classifications remain.

## Consent and disclosure

AI remains optional, with revocation in Settings → AI privacy and manual entry/review available. This change keeps the existing named providers, purposes and server-enforced permission. The shared disclosure and website policy now explicitly explain standard OpenAI retention versus protected Gmail processing.

The existing consent version is retained because the published policy already distinguished independently supplied information from Google data and did not promise universal zero retention. Do not claim renewed consent was collected. Publish the matching privacy notice before activating direct traffic; include the revised in-app explanation in the next native build. If the purpose, recipients or material commitments change beyond this scope, update the consent version and deployment together.

## Activation procedure

1. In the OpenAI organization that owns Rezlee's credits, create a dedicated project/key with the necessary model/Responses access. Verify usable balance and expiry there; credits and ZDR approval are separate.
2. Confirm input/output sharing and training incentives are off. Do not enable “share data for free tokens” for production customer data.
3. Put the key in Vercel as a sensitive server environment variable named REZLEE_OPENAI_API_KEY, scoped to the intended environment. Never paste the key into chat, source control or a runbook.
4. In a protected preview, set REZLEE_OPENAI_DIRECT_ENABLED=true. Confirm existing DB consent and budget controls with an authorized test account.
5. Run synthetic text, PDF and image requests. Verify extracted facts, null/uncertainty handling, schema validation, latency within route deadlines, direct organization usage, dollar settlement, denial when consent/budget is absent, and protected routing for saved/Gmail data.
6. Deploy the tested source and matching privacy notice together. Enable production direct routing only after those checks succeed. Do not treat this source-only work as proof of live provider acceptance.
7. Check aggregate errors, latency, usage and credits after activation. Set the flag false and redeploy to return fresh requests to the existing protected route if quality or capacity regresses. Keep the prior deployment available for rollback.

No database migration is needed for this implementation. Do not raise spending limits, enable public Gmail, submit stores or turn on data sharing as a side effect.

## ZDR and alternative arrangements

A paid balance or promotional credit is not evidence of ZDR approval. Confirm approval and the effective organization/project setting before using that key for a ZDR-required route. Check the exact model, endpoint and feature eligibility, including storage exceptions; store:false alone is insufficient.

Vercel-managed ZDR can use OpenAI without this personal organization's approval, but bills through Vercel. A BYOK request uses the supplied account and does not inherit Vercel's provider agreement. Modified Abuse Monitoring is a separate approval-based option, not a synonym for ZDR and not permission to change an existing Gmail commitment silently.

If ZDR approval remains pending, eligible independent requests can still use standard OpenAI under this policy. Do not delay all AI work solely for that approval.

## Evidence and review

The implementation includes transport-level tests using the real SDK and a synthetic HTTP responder, protected-route tests, and the existing consent/spend regressions. Mocked transport proves request construction and enforcement, not production model quality or live billing.

Review when adding a data source, provider, model, persistent AI feature or new purpose; when provider terms materially change; and after a privacy incident. Keep the scope, tests and factual approval/configuration evidence in the release record. Routine feature use does not require a new review.

Official references checked during the decision:
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/chatgpt-api-credits
- https://vercel.com/docs/ai-gateway/security-and-compliance/zdr
- https://developers.google.com/terms/api-services-user-data-policy

# AI privacy coverage review

Reviewed November 6, 2026 (Toronto). Scope: Rezlee's existing household features using connected bills, uploads and saved records. This is an evidence-based implementation review, not a regulator's approval or a certification of every provider contract.

## Decision

Keep the existing AI features and permission flow. The published policy already covered connected-account collection, bill explanations, questions, relevant household information, named AI providers, optional AI, international processing and deletion. Clarify that connected records, uploads and saved information can be used together for these purposes. Do not introduce per-bill permission prompts, force a universal ZDR requirement, or restrict AI to newly uploaded files.

The existing build-80 permission description names Google/OpenAI, selected files/email content and relevant saved household details for document reading, answers and suggestions. The source clarification gives concrete bill examples without adding a purpose, recipient or automatic feature. Keep consent version 2026-10-13. Material purpose/sharing changes still require a fresh assessment and consent where required.

## Evidence from the application

| Scenario | Verified implementation | Coverage decision |
| --- | --- | --- |
| Connected utility bills | Assistant home context includes saved bill amount, currency, service period, due date and source, with Green Button history comparisons | Explicitly identify connected bills and period comparisons |
| Customer-uploaded bills and documents | Authenticated scan endpoints obtain AI permission; fresh content can use direct OpenAI | Keep upload disclosure and accurately describe standard retention |
| Questions spanning records | Assistant receives a compact home snapshot and conversation messages; bill references ground answers | Say relevant sources may be used together |
| Reading a saved statement original | Statement reader reserves AI permission before extraction on the protected route | Distinguish reading from ordinary record storage |
| Gmail-derived saved records | Extraction and saved context use protected Gateway routing; saving does not remove provenance | Explain subsequent answers as well as initial extraction |
| Household member access | Shared context excludes private bills, documents, warranties and owner-only records | Preserve existing access boundaries; no new sharing |
| Consent | Existing client prompt and server reservation checks; revocation supported | Retain the existing flow, no additional routine gate |
| Retention | Direct Responses requests use store:false; saved records have separate retention | Correct the exception to include legal and safety retention |

Code reviewed: src/lib/assistant/home-context.ts; mobile and web assistant routes; src/lib/product/statement-reader.ts; src/lib/ai/reservation.ts; independent-input.ts; privacy-policy.ts; shared AI permission code; Gmail extraction and entry points. The prior release's live consent-denial and direct-provider tests remain evidence for runtime enforcement; this change only modifies wording and documentation.

## Research findings

1. Canadian meaningful-consent guidance calls for understandable information about data, purposes, recipients and consequences. A privacy-policy sentence alone is insufficient, but an understandable existing in-app choice can cover ongoing use within its scope. Significant new purposes or sharing need renewed attention. [OPC consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/)

2. PIPEDA permits outsourcing and cross-border processing with accountability, appropriate protection and transparency. Processing for the original purpose does not automatically require another consent solely because a processor is involved. This does not override stricter app-store or source-specific rules. [OPC cross-border guidance](https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/) and [2026 processor guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/gd_third-party_202609/)

3. Apple's 5.1.2(i) specifically requires disclosure and explicit permission before sharing personal data with third-party AI. Google Play requires accurate privacy disclosure and prominent in-app disclosure/consent for sensitive processing outside reasonable expectations. Retain Rezlee's existing affirmative AI permission rather than relying only on the website. [Apple](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing); [Google Play](https://support.google.com/googleplay/android-developer/answer/10144311)

4. Google Workspace permits consented transfers for appropriate, visible user-facing features. Limited Use follows derived data and prohibits unrelated uses, including general-model training outside the permitted personalized use case. These policies do not state a universal requirement called OpenAI ZDR. Rezlee's existing protected routing also reflects its own published commitment. [Google Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

5. OpenAI API data is not used for training by default. Standard abuse logs can contain content and last up to 30 days, with legal and safety exceptions. store:false does not itself remove those logs. The policy previously mentioned only the legal exception; this review corrects that factual omission. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)

6. Ontario's energy regulator expressly describes third-party analysis as a Green Button use, with customer authorization and clear terms for use, sharing, retention and deletion. This supports useful bill analysis rather than a blanket prohibition. [Ontario Energy Board](https://www.oeb.ca/consumer-information-and-protection/green-button)

## Provider documents and limits

Read the EZGB signup package delivered September 21: Privacy Policy and Terms of Service dated June 4, 2026, and the Master Services Agreement dated February 21, 2025. The privacy policy discusses third-party AI processing for selected AI features; the terms allocate end-user consent responsibilities to the customer. This is not specific approval for every downstream use. Preserve authorization and applicable service terms. Do not claim every integration provider has zero retention or never performs its own permitted aggregate analysis.

Deck's current public terms were reviewed, including customer data rights and responsibilities. They describe a Computer Use platform; no Rezlee-specific signed order form was located in the targeted search. Do not treat public terms as proof of the complete contract for Rezlee's existing connector. This review does not change connector use or enable new data sharing. [Deck public terms](https://www.deck.co/terms)

## Change and release scope

Clarify combined data sources, concrete AI purposes, saved Gmail-derived answers, international lawful access and OpenAI retention exceptions. Update the shared web/native disclosure text and processing procedure. Keep routing, consent version, budgets, provider connections, collection scopes and features unchanged. Native wording is source-only until the next native build; do not claim it is already in installed binaries. No external messages or store submission are part of this review.

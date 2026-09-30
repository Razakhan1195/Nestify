# Durable demo household — 2026-09-30

Created at founder request, separate from all real households, in staging only (gjwvalpxnfbvryosmcbj). The beta/TestFlight profile uses the preview/staging environment. Production was not seeded. No app binary or design change was necessary.

- Login: demo.home@rezlee.com (email/password; preconfirmed demo identity, not a new mailbox).
- Household: Demo Home · Sample data; profile Alex Demo; general Pickering, Ontario location, no real street address.
- Credentials and resumable seed state: private local `~/Documents/Rezlee-Demo-Access/demo-home.json` (0600; parent 0700). Password and session tokens are excluded from this repository and logs.
- Durable sample data: 36 reviewed historical bills, September 2025–August 2026, with 36 genuine readable PDF files in private Vault storage. Each PDF, statement name, account nickname and household identifies sample/demo data. Providers are used for recognisable app identities, not claims of endorsement, real prices or live connection.
- Accounts: Elexicon Energy (electricity/time-band allocations), Enbridge Gas (gas usage and charge lines), Rogers (internet). Twelve valid non-overlapping completed periods each.
- Two upcoming sample Care reminders, October 5 and October 19. No notifications were sent or push tokens registered by this task.

## Where to inspect

Sign out of the current beta session, then use email/password sign-in. Home shows latest saved accounts and upcoming tasks. Bills > Insights > choose the account: This bill, Where the charges go (energy), Usage by time band (electricity), History (charges/day and usage/day), What changed. Details & original opens the real synthetic PDF. Vault contains those originals; Care contains the two sample reminders.

Latest electricity charges $180.29, gas $45.45, internet $101.70. Rogers' latest increase is $22.60: loss of a $20 credit plus $2.60 tax. The sample PDF documents the promotion ending July 31. All prices and usage are illustrative. No interval readings, live connection, weather attribution, peer benchmark, payment confirmation or guaranteed savings is fabricated. This is a manual-upload intelligence demo. Any current electricity-price scenario remains subject to the app's existing rate freshness and data checks.

## Executed verification

- New account email/password sign-in; owner/home association checked.
- All 36 records saved through the real authenticated mobile upload endpoint, with evidence validated using current app parsers.
- Actual Bills API response passed through current `manualHistoryAccounts` and `buildSavedBillStory`: exactly three accounts, 12 graph points each, no excluded/overlapping periods or gaps, matching subtotal/tax/credit arithmetic. All 24 energy readings usable; energy charge lines reconcile and compare. Electricity has three matching time bands.
- Rogers credit/tax change reconciles exactly to $22.60.
- Saved original presence checked on every bill; latest private PDF from each provider downloaded and byte-compared with source. Representative electricity/gas/internet PDF pages rendered and visually reviewed; no clipping or overlap.
- Home, Care and Vault APIs load; exactly two tasks and 36 documents. No providers or provider integrations created. Unauthenticated original access returns 401.
- Seed rerun completed successfully without duplicate bills, households or reminders. Stable request IDs and locally persisted user/home IDs support interruption recovery. Existing customer data is not queried or modified.
- No paid AI/provider calls and no scheduling changes.

Phone rendering and taps under this demo login have NOT yet been visually accepted. API/calculation verification does not substitute for native design acceptance. Do not record login credentials in marketing footage. Keep the sample-data label in published demos.

## Reproduce/resume

From the main repository, run:

`REZLEE_CREATE_DEMO=yes REZLEE_STAGING_QA_SETTINGS=/tmp/rezlee-staging-deploy-settings.json node --import tsx scripts/demo/create-household.mjs`

Guarded to staging and this marked demo identity; it refuses mismatches and never resets an existing password or deletes another household. Fixture definitions are fixed to Sep 2025–Aug 2026; a future marketing refresh requires an explicit new fixture version/date review. Do not delete local state or repoint this script at production.

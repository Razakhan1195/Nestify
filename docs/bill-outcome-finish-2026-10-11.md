# Bills to actions to later evidence — October 11, 2026

## Delivered
Customers can save a planned change, mark it implemented, choose later saved evidence, finish/reopen or stop, and find active actions under Bills → Insights → Your follow-ups.
- Uploaded telecom: existing agreed-period-charge checks preserved.
- Deck telecom with the current import contract and identified account: compare the imported statement total with a confirmed amount. Copy explicitly distinguishes statement totals from recurring period charges, prior balances, payment and continuing savings.
- Green Button electricity and gas, plus reviewed manual energy bills: track a usage change and compare consumption per day across completed service periods. Results say lower, higher, unchanged or inconclusive. Billing lengths are shown; weather, occupancy and other changes are not controlled. Provider-reported reading quality is qualified.
- Missing or unsuitable readings, estimated usage, different units/accounts/services/currencies, transition or unfinished periods, overlapping baseline/evidence, excluded copies and incomplete history cannot establish a result. Electricity retains a conservative scale guard; no new meter normalization is claimed.
- Changed evidence is recalculated, including after a check is completed. Changed baseline requires explicit review. Unsupported changed bill details retain the saved action and permit stopping.
- Follow-ups are stored independently of imported provider metadata. Refreshing a bill cannot erase the action. Owner RLS, version checks, atomic saves and baseline-deletion cascade apply. Existing manual actions in bill metadata are read without changing them and move to the new store when next saved.
- Actions remain discoverable even when their baseline is excluded as another copy. Follow-up load failures display a warning. Notes and agreed amounts are excluded from the list summary.
- Existing bill originals, provider routing, Rogers pause, public admission gates and all other customer records remain.

## Verification
- 53 focused calculation, source-adapter, database and related bill-story tests passed.
- Complete repository suite: 858/858 passed after correcting an obsolete AI-admission test fixture. The fixture now returns the current named RPC result, asserts the RPC name and verifies HTTP 429 on a user limit. AI controls and runtime behavior were not weakened.
- 60 actual-component React Native Web scenarios across telecom, gas and electricity at 320/390 widths: create, wait/select evidence, finish/reopen, correction acknowledgement, stopped action, lost response saved/unchanged/conflict, definite rejection, load failure. No overflow or page errors. Selected rendered views inspected. Native/router/API boundaries are mocked; these are not phone screenshots.
- 94 authenticated staging checks passed using two disposable households and synthetic bills/providers. Included precise amounts/units, source-aware list entries, corrections, overlaps, missing evidence, refresh preservation, concurrent writes, privacy and deletion cleanup. Final fixture cleanup confirmed.
- Three additional direct concurrent RPC pairs returned one success and one HTTP 409, observed 59–109 ms per response in that small diagnostic. This is not a latency guarantee.
- Root/mobile TypeScript, scoped ESLint, hosted Next build and iOS/Android Hermes exports passed.
- No paid provider retrieval, live AI request, customer message, scheduled pull or public release was initiated.

## Defect found and repaired during acceptance
Initial hosted concurrency tests timed out on the losing save. Direct RPC reproduction isolated the problem to manually raising SQLSTATE 40001 for an expected version conflict. Supabase documents a PostgREST retry-loop issue for that code. A forward migration changes the business-conflict response to PT409, and the API handles it as a conflict requiring reload. The original applied migration was left immutable. Direct and full hosted checks passed afterward.
Reference checked October 11: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
The final staging public function scan found no remaining function bodies containing 40001. Historical migration text is not a current-function inventory.

## Delivery and rollback
Staging: https://staging.rezlee.com → https://nestify-p28dodx8l-razakhan1195s-projects.vercel.app
Previous staging: https://nestify-mte7i2zb0-razakhan1195s-projects.vercel.app
Additive staging migrations: 202610110002_bill_outcome_actions and 202610110003_bill_outcome_conflicts. RLS confirmed enabled. Production migrations and public/native-store releases were not performed.
Mobile: current Expo development source; reload the existing staging development app. Native exports are in /tmp/rezlee-outcome-native-export-20261011; exports are not installed or distributed binaries.
Scoped before/after source archives, manifests, patch, rendered results and verification logs: docs/checkpoints/bill-outcome-finish-20261011.
Rollback the application alias and scoped source only after checking hashes. Keep the additive action table and saved customer actions; do not drop the table or reset the repository. Earlier server code will not expose newly stored actions, so prefer a forward fix if customers have begun using this increment.

## Finite phone acceptance
Use a QA household in current Expo; repeat on iOS and Android.
1. Uploaded telecom: save a confirmed agreed amount after the baseline ends, mark implemented, select a later full period, open originals, finish/reopen. Verify the follow-up list on return.
2. Electricity: open a saved Green Button bill or utility insights → Track a usage change. Save a concrete change and date; choose eligible later evidence. Confirm daily units and periods, plus the no-causation explanation.
3. Gas: repeat; gas must retain gas units and must not enter electricity-plan requests.
4. Simulate a lost save response or airplane mode; check saved state before repeating. Verify one action, preserved saved notes, correct conflict guidance, back navigation, keyboard and large text. App termination and assistive technology remain unverified.
5. Correct the selected evidence and baseline separately. A changed result or required review must appear. Remove evidence; no completed-result claim may survive it.
No new provider pull is needed to test saved evidence. Real import/MFA/provider acceptance remains a separate bounded pilot.

## Scope still open
This completes this engineering increment, not all bill intelligence or the full audit. It does not establish causal savings, weather-normalized effects, tariff-switch savings, multi-action attribution or cross-source account equivalence. Manual/connected copies are not assumed to identify the same account. A lower amount due is not current-period savings. Water/insurance/other Deck outcome types are not added.
Next engineering/acceptance order is recorded in audit-completion-status-2026-10-11.md.

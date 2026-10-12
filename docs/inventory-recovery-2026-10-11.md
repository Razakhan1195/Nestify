# Home-item save recovery — October 11–12, 2026

## Status
Implemented in the local Expo/server workspace. NOT deployed or signed off on hosted staging. Migration access is the remaining rollout blocker. The prior quote-file staging deployment remains in place.

## Customer outcome
When a new home-item save is interrupted, the device retains the exact corrected details and request identity in account-scoped SecureStore chunks before sending anything. Returning to Add home item restores the pending request without automatically submitting it. Customers can check the saved result, retry the same request, or cancel before editing.

The server migration inserts the item and its receipt atomically and serializes create/cancel/replay by owned home. Repeated requests return the original item. Later item corrections are not overwritten by replay. Cancellation records a tombstone; item deletion keeps a receipt without the item reference. Neither case allows an old request to recreate an item. A deliberate new request can create an identical appliance.

Account changes remount the form and suppress stale save results. Recovery checks current home ownership. Private intent storage fails closed when missing/corrupt, and a failed durable write sends no request. Local cleanup failure does not turn a confirmed save into a failed save.

## Compatibility and limits
- New endpoint: /api/mobile/v1/inventory/create. Existing inventory routes remain intact.
- An old server's 404 permits legacy create only when there is no pending durable request. This preserves current app use but does NOT provide recovery until the migration and new API are deployed.
- A 503, pending-request mismatch, or unreadable stored request blocks a fresh create. Pending requests never silently fall back to the old insert endpoint.
- No saved photo is retained by this recovery feature; it preserves reviewed item fields.
- SecureStore persistence is device-local. Reinstall/device replacement recovery is not claimed.
- Ownership is checked against the existing first owned-home model. This does not introduce member inventory access or a new multi-home selection feature.
- Existing edit concurrency and old-client create behavior are unchanged.

## Validation
- 890/890 full regression tests passed, including local PostgreSQL-compatible PGlite tests for replay, corrections, intentional identical items, cancel/delete behavior, RLS account isolation and input validation.
- Five storage tests cover restart, account scope, repeated taps, persistence failure, damaged chunks/fields and Unicode chunking.
- 22 rendered actual-component scenarios at 320/390 px passed. API/auth/native boundaries are controlled fixtures. Cases: success, lost response/reopen, offline retry with unchanged identity, cancel unsent request, cancel already-completed request, deleted item, storage failure, cleanup failure, account change without reload, backend unavailable/retry and old-server compatibility.
- Pending recovery screenshot visually inspected at 390 px. No detected horizontal overflow or runtime page errors.
- Root and mobile TypeScript, scoped lint and Next build checked; final results are in the checkpoint validation files.
- iOS/Android Hermes exports passed. These are bundle checks, not physical-phone acceptance.
- Hosted runner scripts/qa/inventory-recovery-staging.mjs prepared and syntax checked, NOT executed. It uses disposable staging accounts and checks concurrent requests, retained edits, cancellation/deletion, direct RLS and ownership.
- No hosted API/RLS/concurrency result is claimed for this migration. No paid AI/provider call, customer data change, scheduled pull, production release or store release.

## Concrete rollout steps
1. Apply supabase/migrations/202610110005_inventory_create_recovery.sql to staging project gjwvalpxnfbvryosmcbj using its authorized SQL administrator connection. It is additive; no existing schema is dropped or renamed.
2. Deploy the scoped server snapshot to staging only, preserving unrelated working changes and existing runtime environment. Run the prepared authenticated hosted checks and clean disposable fixtures.
3. Reload/build the matching Expo client and perform physical iOS/Android acceptance: kill/reopen during save, airplane mode, delayed server completion, repeated taps, sign-out/account switch, deleted saved item, real device storage behavior.
4. Record actual outcomes before marking the gap closed. Do not infer hosted or physical acceptance from local tests.
5. Resume the remaining launch audit with recorded evidence: utility-provider acceptance and freshness, bill → recommended action → subsequent evidence, household two-device invitation/notification behavior, and physical authentication/deep-link/privacy/operational checks. Reconcile existing implementations before adding features.

## Access blocker
This session can read the repo and use staging app credentials but has no discovered Supabase SQL administrator/management connection. App anon/service-role REST credentials do not grant arbitrary DDL. The earlier chat retrieval does not preserve its migration method. No Supabase CLI, database URL/password, management token or SQL tool was available in the inspected authorized project/tool settings. Do not ask the user to paste secrets into chat; restore the authorized database tool/connection or apply the named SQL in the staging Supabase SQL editor.

## Checkpoint
docs/checkpoints/inventory-recovery-20261011 contains before/after source archives, a scoped patch, source hashes, local validation logs and status. The repository has extensive unrelated working changes; restore only these scoped files after comparing hashes. Do not reset/stash the whole repository.

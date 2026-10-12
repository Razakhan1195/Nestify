# Home-item save recovery — October 11–12, 2026

## Status
Implemented and deployed to staging. Migration 202610110005 was applied and recorded through the authenticated Supabase SQL editor for project gjwvalpxnfbvryosmcbj. All 19 authenticated hosted checks passed; disposable accounts were cleaned. Physical iOS/Android acceptance remains open. No production/store release.

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
- Hosted runner scripts/qa/inventory-recovery-staging.mjs executed successfully: 19 checks passed, including four concurrent requests producing exactly one item, later edits surviving replay, deliberate identical items, cancellation/deletion, direct RLS and account ownership. Both disposable staging accounts were cleaned.
- Hosted API/RLS/concurrency verified for the recorded cases. No paid AI/provider call, customer data change, scheduled pull, production release or store release.

## Concrete rollout steps
1. DONE: Applied supabase/migrations/202610110005_inventory_create_recovery.sql to staging project gjwvalpxnfbvryosmcbj and recorded its version/name/SQL in migration history. Read-only verification confirmed RLS enabled, authenticated SELECT allowed, authenticated DELETE denied and anonymous create RPC denied.
2. DONE: Built isolated /tmp/rezlee-inventory-recovery-staging-20261011 from the prior deployed quote-file snapshot, adding only the new server route and migration. Deployed https://nestify-jc17bwdp2-razakhan1195s-projects.vercel.app and assigned https://staging.rezlee.com. Hosted checks and fixture cleanup passed. Rollback alias target: https://nestify-liyhyo0kl-razakhan1195s-projects.vercel.app; keep the additive migration/data.
3. Reload/build the matching Expo client and perform physical iOS/Android acceptance: kill/reopen during save, airplane mode, delayed server completion, repeated taps, sign-out/account switch, deleted saved item, real device storage behavior.
4. Record actual outcomes before marking the gap closed. Do not infer hosted or physical acceptance from local tests.
5. Resume the remaining launch audit with recorded evidence: utility-provider acceptance and freshness, bill → recommended action → subsequent evidence, household two-device invitation/notification behavior, and physical authentication/deep-link/privacy/operational checks. Reconcile existing implementations before adding features.

## Access recovery and Expo selection
The earlier SQL access blocker is resolved. The user completed secure GitHub sign-in to the Supabase dashboard; the migration was applied through the authenticated SQL editor, without creating or exposing a management token. No password or verification-code value was read or stored in this checkpoint.

Expo session corrected after the user could only see port 8081. Stopped the two scoped Metro processes (8081 development-client and 8082 staging), then started one Expo Go LAN server on port 8081 with explicit staging API/Supabase overrides. Verified manifest hostUri 10.0.0.13:8081 and staging process URLs. Open exp://10.0.0.13:8081 on the same Wi-Fi. The .env file is unchanged; these are process overrides. Prior instructions to use 8082 are superseded.

## Physical acceptance still required
Use a disposable home item in the staging Expo session. Check ordinary save/reopen, force-close immediately after confirming and reopen Add home item, network loss and recovery, cancellation while the original request may still be completing, later deletion followed by recovery, and account switch. Confirm that corrected brand/model/serial fields survive and exactly one item exists. Repeated taps should be tested on the device. Do not count a successful Hermes export or browser reload as an OS-kill/secure-storage test.

## Checkpoint
docs/checkpoints/inventory-recovery-20261011 contains before/after source archives, a scoped patch, source hashes, local validation logs and status. The repository has extensive unrelated working changes; restore only these scoped files after comparing hashes. Do not reset/stash the whole repository.

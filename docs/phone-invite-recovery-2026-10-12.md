# Household phone invitation recovery — October 12, 2026

Engineering increment complete. Physical delivery and two-device acceptance remain open.

## Customer problem and changes

An owner preparing a household invitation could lose the original request identity and secret after an HTTP timeout. Restarting could then encounter an existing invitation without recovering its link. The form also permitted edits before saved recovery state loaded, and did not isolate its fields when the signed-in account changed.

- Preserve the exact input, request ID and secret across uncertain network outcomes, including 408, rate limiting, network/server errors and older servers' ambiguous 400 responses. Retry returns the same membership.
- Persist the intent before calling the server; retain it if saving the returned link or removing the pending record fails. A confirmed server conflict releases the rejected intent.
- Gate form editing and preparation on successful restoration. Offer an explicit restoration retry, freeze uncertain details and retain the original relationship and expense participant.
- Reset invitation and joining screens when the account changes. Pin POST authentication to the initiating account before capturing its bearer token. Recheck the account before opening the stored SMS link.
- Prevent simultaneous prepare taps. Opening Messages remains an explicit owner action; the screen says Rezlee cannot confirm whether a text was sent.
- Keep existing routes and the server's explicit recipient-request / owner-approval contract. No schema or backend deployment required.

## Verification performed

- 13 recovery logic tests: uncertain responses, restart identity, reordered input fields, changed details, account isolation, storage failure before/after the server, corrupt storage, double taps and confirmed conflict.
- 16 rendered checks using actual invitation/join components and API authentication guard, at 320 and 390 px. Covered restore failure/retry, slow restoration, lost response/restart, storage failure, account changes, session race and recipient screen reset. Native storage, authentication, network and Messages were simulated. Screenshots inspected; no horizontal overflow.
- 23 hosted checks against staging.rezlee.com using four disposable accounts: create/replay/duplicate, recipient restrictions, preview without joining, explicit request, owner approval of exact requester, wrong-account rejection, replay, expiry and removal. All fixtures cleaned.
- Full regression: 903 passed. Scoped lint, mobile TypeScript, root TypeScript and Next build passed. Initial root typecheck overlapped Next's generated-type regeneration; rerunning after the successful build passed.
- iOS and Android bundle exports passed. These are compilation checks, not device acceptance.

No emails, SMS, paid provider calls or AI calls were made.

## Availability and rollback

Client changes are in the existing mobile workspace. Reload the staging Expo Go session on port 8081. The existing TestFlight binary does not automatically receive these changes. Staging backend and alias remain unchanged.

Scoped before/after source archives, SHA manifest, diff and QA evidence: docs/checkpoints/phone-invite-recovery-20261012. As established for this heavily modified workspace, only the checkpoint documents and archives are committed; unrelated working changes are preserved. Restore individual scoped files from before.zip only after checking subsequent work; new files are listed in the manifest.

## Remaining acceptance / next work

1. On two physical phones, explicitly choose a recipient and send one invite. Verify SMS composition, the delivered link, app/browser handoff, sign-in and return to the saved invitation, owner approval and refreshed household access.
2. Repeat with expiry/revocation and an already signed-in different account. Confirm private Bills/Vault stay private, including after removal.
3. Exercise actual email delivery separately. Prior no-send email invite evidence remains in household-invitation-recovery-2026-10-08.md; it was not rerun or called inbox delivery here.
4. Continue the release audit with authentication/deep-link recovery, notifications and connected-account deletion/revocation. No public launch sign-off.
5. Ambiguous server failures deliberately keep the unfinished invitation. Persistent failures require recovery/investigation, not deletion of the sole saved secret or creation of a different request.

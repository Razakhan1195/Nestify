# Connection introductions — October 12, 2026

## Status

The Hark-inspired benefit-before-permission pass is implemented in the mobile app for Green Button, hosted Deck connections and Gmail. This is an engineering checkpoint, not physical-phone or provider acceptance. It follows the previously agreed Hark review; the recording was not re-reviewed in this increment.

Reload the staging Expo development server on **8081**. Its status endpoint was checked and is running. The existing TestFlight binary does not contain these edits. The backend remains at the customer-communications staging deployment; no backend, database, provider configuration or production change was needed.

## What changed

- A consistent introduction explains the useful outcome, two clear next steps, the actual access granted and how to stop sharing.
- Green Button stays the recommended route for supported Ontario electricity and natural gas. The existing unified provider finder still chooses the route. Water/provider classifications and availability were not changed.
- Deck explains whose login to use, who receives/stores the credentials, verification, and when the customer can leave. The default six-month history is now a compact, editable choice; all one-to-six-month options remain. Upload keeps the selected provider and category.
- Gmail explicitly separates Google mailbox permission from Rezlee sign-in. Read-only mailbox access is visible before continuing; category choices, manual upload, detailed privacy information and “Not now” remain available.
- Connected Gmail accounts keep their progress/review screen instead of seeing onboarding again. Reconnection retains the existing search categories and explains which Gmail account to choose.
- Viewing an introduction does not start authorization. Deck cancellation preserves the chosen history and offers a clear notice. Green Button preparation failures offer an explicit return to the introduction; reopening does not silently start authorization.
- Deck reconnection waits for existing-account details before showing a form, with a retry state on failure. Account/route changes reset the relevant screen instance; stale fetch and OAuth results cannot update the next account’s screen.
- Automatic monthly utility updates remain explicitly unavailable. Existing paused/ongoing Gmail controls and runtime gates remain intact.

## Verification

- **36 rendered interaction scenarios passed** using the actual three screens, DeckHostedAuth, shared components and navigation helper, at 320 and 390 pixel phone widths.
- Checked: no authorization before continuing; Deck hosted sign-in, cancellation, chosen history, successful handoff, reconnection ID, unavailable Rogers, offline retry, no credential-form flash, upload provider preservation, and late account-switch completion.
- Checked: Green Button manual upload without authorization, consent-to-pending-import handoff, preparation failure/retry, returning to an unfinished import without reauthorization, and late account-switch completion.
- Checked: Gmail category selection, disabled empty selection, cancellation, skip, unavailable service, saved reconnection categories, connected/empty-result view, offline retry, and late account-switch completion.
- **924 regression tests passed**; scoped lint, mobile/web TypeScript, Next build, iOS export and Android export passed. Final UI changes were followed by a fresh 36-scenario render pass, lint/mobile types and both native exports.
- Rendered layouts were visually reviewed and the copy was shortened afterward so the main action is visible sooner.
- Network, auth/OAuth, native WebView, router, haptics and icon rendering were controlled test boundaries. This verifies screen behavior, not actual Google/Deck/EZGB authorization, MFA, background OS behavior or native accessibility.
- No live provider retrievals, paid calls, outgoing email/push, new schedules or production release occurred.

Evidence: `docs/qa/connection-intros-20261012/results.json` and screenshots. Runnable screen harness: `scripts/qa/render-connection-intros.cjs`.

## Phone checks to combine with the earlier checklist

1. Reload staging Expo on **8081**. In Bills, open the provider finder. Select your supported Ontario electricity/gas utility: confirm the introduction shows the correct name, recommends Green Button, explains consent, and offers upload/back.
2. Select an available Deck provider such as Bell. Open “Bill history · 6 months,” choose a shorter period, continue, then close sign-in. Confirm the choice remains and the cancellation notice appears. “Upload a bill instead” should carry the provider/category forward.
3. In Vault → Add → Import from email, inspect the Gmail introduction. Change categories, cancel Google sign-in and return. Confirm the app remains signed in and your choices remain. On an already connected account, expect progress/review controls instead of the intro.
4. During an approved real provider/Gmail test, verify the actual account chooser, credentials/MFA, consent refusal, native return and result destination. A successful bundled export does not establish these.
5. Check large system text and screen-reader order on a phone. Confirm all copy, close/skip controls and primary actions remain reachable.

## Remaining work and next priority

This closes only the connection-introduction engineering pass. Apple sign-in/native auth, actual inbox/push/deep-link acceptance, connected-account deletion/revocation and operational readiness remain open. So do the recorded physical/provider/customer gates elsewhere in the audit. The next independent engineering pass returns to connected-account deletion/revocation, with Apple/native auth still pending.

## Preservation and rollback

Inherited source changes remain untouched outside this scope. The checkpoint contains before/after archives, SHA-256 manifest, scoped diff and evidence. Task docs/checkpoints are committed separately; source files retain the established working-tree layout. Do not reset or overwrite the inherited dirty tree.

For rollback, review `docs/checkpoints/connection-intros-20261012/scoped.diff` and restore only the three screen files from `before.zip`; remove the newly introduced component only after reverting its imports. No backend rollback is required.

# Bill-to-action journey review — October 11, 2026

## Outcome
Reviewed existing bill insight/action entry points, the saved-change screen, later-evidence controls and actual staging action persistence. Two focused client fixes delivered; no new provider retrieval or AI features added. Engineering checks passed. Physical-phone and customer-usefulness acceptance remain open.

## Customer-facing fixes
1. A mismatched telecom amount now states the exact difference from the agreed amount. Example: baseline CAD 100, agreed CAD 80, later bill CAD 90 shows “Recorded charges are $10.00 above your agreed $80.00.” The separate baseline comparison remains minus CAD 10 and is not labelled savings. Imported Deck totals explicitly say “Saved statement total”; existing caveats about prior balances, proration and one-time adjustments remain. The existing evidence/original link opens the selected bill.
2. The follow-up form is keyed by signed-in account as well as bill ID. Switching accounts remounts the form, clears the previous account's open notes/details and loads through the new account's authorization. Previous-component asynchronous results cannot populate the new form. Existing server RLS remains unchanged.

The pre-fix rendered account-change scenario failed to transition away from the existing account view; after the fix it displays the other account's unavailable-bill response with no previous notes. This is component-level evidence, not a claim that the native app's entire sign-out/navigation lifecycle leaked data.

## Verification and real-world scenarios
- 106 actual-component React Native Web scenarios at 320/390 px passed: manual telecom, Deck-style telecom, gas and electricity; create, planned/implemented, select later evidence, finish/reopen, corrected baseline acknowledgement, stop/reopen, ambiguous saved/unchanged/conflicting responses, definite rejection, load failure, differing amounts, no eligible evidence and live account change. API/auth/router/native boundaries are controlled fixtures.
- Two of those scenarios start at the actual SavedBillInsights component with an older tracked baseline and newer statement. They confirm the explanation is visible, the tracked-change entry opens the correct older baseline, and the customer can select the later statement and finish the check. This is not full native tab navigation acceptance.
- Mismatch rendering visually inspected at 390 px. No detected horizontal overflow or page errors. Selected screenshots and full rendered results are checkpointed.
- Re-ran all 94 authenticated staging checks against staging.rezlee.com with two disposable households. They cover exact amount/usage results, multiple accounts, corrections, missing/deleted evidence, overlapping periods, provider metadata refresh preserving actions, concurrency, RLS and cleanup. All passed; fixtures cleaned.
- 890/890 regression tests passed. Root/mobile typecheck, scoped lint, Next build and iOS/Android Hermes exports passed.
- No paid provider/AI calls, scheduled pulls, customer records, outgoing messages or production/store releases.

## Delivery
Client-only change in apps/mobile/app/bill/outcome.tsx. Reload staging Expo Go on port 8081 (explicit staging API and Supabase overrides). No backend/schema deployment was needed; existing staging remains https://nestify-jc17bwdp2-razakhan1195s-projects.vercel.app.
Checkpoint docs/checkpoints/bill-journey-20261011 includes before/after source archives, hashes, scoped patch, regression/hosted/render/build evidence. Preserve unrelated working changes. Roll back only the scoped client file after comparing hashes; leave saved actions and database tables intact.

## Remaining acceptance and next gate
Physical iOS/Android checks remain: keyboard/large text/back navigation, OS interruption, account switch, actual original-file opening, and whether customers can understand the result without explanation. Provider reliability remains provider-specific; synthetic Deck/Green Button data is not live retrieval proof. Scheduled retrieval remains off.
The next audit workstream is household invitation/deep-link/two-account behavior, followed by notification delivery, connected-account deletion/revocation and release operations. Actual invitation delivery needs explicitly authorized recipients; do not send messages based solely on this checklist. No full launch sign-off is recorded.

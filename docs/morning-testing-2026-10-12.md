# Rezlee — morning testing, October 12

## Use these versions

- **iPhone:** TestFlight → Rezlee → **0.1.0 (25)**. Apple confirmed VALID / IN_BETA_TESTING for internal testers. External/public release has not been submitted.
- **Android:** install **0.1.0 (19)** from [this APK](https://expo.dev/artifacts/eas/bHT7BG7MlUEwir2zAZQTpZNiZiF7347QmYkix_1heS8.apk).
- **Expo Go:** **8081**, not 8082. The server was restarted with staging settings. On the same Wi-Fi, use `exp://10.0.0.13:8081`. The Mac must remain awake. Use email sign-in; test native OAuth, notifications and OS handoffs in the installed Rezlee build.
- All three use **staging.rezlee.com** and the isolated staging database. Previous iOS 24 / Android 18 do not contain the accumulated October 8–12 client work.

## One combined customer pass

Record the device, build, screen/action, expected result and actual result. For a failure, include a screenshot and approximate time; never send passwords or verification codes.

| Order | What to do | What should happen |
|---|---|---|
| 1. Returning account | Sign into your existing account. Open Home, Bills, Vault and Care; leave and reopen the app. | No repeated-child-key warning. Existing records remain. Loading, empty categories and failures are distinguishable. Back navigation returns somewhere useful. |
| 2. Password recovery | Sign out, choose password help and request a reset to an inbox you control. Open the email with the app closed; also try its email-code alternative. Complete the reset, then use the old and new passwords. | Rezlee-branded email. Recovery reaches the reset journey; code entry accepts the current eight-digit code. Old password stops working; the new password works. An expired/reused link offers recovery rather than trapping you. This is still a physical/inbox acceptance gate. |
| 3. New customer | Use a separate test account you control. Complete verification, return to the app, reopen it and explore the initial next steps. | Helpful onboarding and one welcome for an eligible newly verified mobile account. No repeated welcome on reopening. Your older account should not receive a retroactive welcome. |
| 4. Find a provider | Search for your Ontario electricity/gas provider, a water biller, a configured Deck provider, Rogers and an unsupported provider. Read each introduction and cancel once before continuing. | One finder routes eligible Ontario energy services to Green Button and other supported services to hosted Deck. Water is classified by service. Rogers and unvalidated providers remain Coming soon. The intro explains the benefit/access; cancellation preserves your choice. No need to choose the integration yourself. |
| 5. Real connection | On an account you own and intend to test, finish consent/sign-in, handle MFA, leave and return, then inspect the first actual saved bill/original and freshness. | Accurate connection status and recoverable verification. “Connected” alone does not mean a bill has arrived. Each provider earns its own acceptance; this build does not validate all 29 Deck entries. Retrieval can incur the existing provider cost. |
| 6. Bill and outcome | Upload a real statement, review/correct it and save. Reopen its original. Retry the same upload. Pick a supported action, then add later evidence for the same account and period basis. | One confirmed saved record; duplicates/revisions are explicit. Amount due, period charges and usage stay distinct. Outcomes explain what changed and say when evidence is insufficient; a lower bill alone is not proof of savings caused by the action. |
| 7. Camera and interruption | Photograph a bill/receipt on the phone; exercise photo/camera permission refusal. Interrupt a save by losing connectivity or closing the app, then reopen and retry. | Honest pending/recovery states, preserved review work and one saved result. HEIC/original files reopen. Try adding a home item similarly. |
| 8. Household and Care | With a second consenting account/device, accept an invitation, add an expense with explicit participants, record settlement, and edit/assign/complete/reopen a cleaning routine. | Correct household access and cent totals on both devices. Invitation retries reuse the original invitation. A recorded repayment does not move money. Assignment/recurrence and notification destinations are correct. |
| 9. Home help | Resume an existing repair. Save/review one quote, check its cited facts and missing details, add answers and reopen the decision note. | Useful, cautious repair steps and explicit escalation. Quote facts stay tied to the original; unsupported advice is not presented as certainty. Multiple-quote comparison and general compatibility/repair-versus-replace are not part of the accepted one-quote milestone. |
| 10. Notifications | Open a notification while signed out, locked and already signed in. Try one whose source record was removed. Inspect preferences. | Authentication/lock returns to the intended owned record. Obsolete updates explain what happened. Another account's private record is never shown. Real push/inbox delivery still needs this device pass. |
| 11. Disconnect | On a connection you deliberately want to remove, disconnect, leave and return. | Imports stop and saved bills remain. A vendor failure says cleanup is pending and offers Finish disconnecting. It must not claim successful revocation before confirmation. |
| 12. Delete a disposable account | **Use a separate disposable account, never your main account.** Inspect household consequences, reconfirm identity, submit, close the app, then return. | A durable receipt survives reopening; deletion continues in the cloud. Completion appears only after cleanup. Another household/member account remains. Real connected grants still need a deliberate consented revocation test. |

## What is already checked

- 951 regression tests; root/mobile types, scoped lint, hosted build and native exports.
- 36 new rendered scenarios: 28 deletion/email-code and 8 provider-disconnect cases.
- Live staging: 29 deletion/auth/storage checks, 5 unattended deletion checks and 6 operations checks.
- Fresh hosted regressions: 94 bill-outcome, 23 phone-invitation and 30 one-quote checks.
- These checks used disposable data or mocked device/vendor boundaries. They do not replace the actual customer journeys above. No manual customer test emails, SMS, push, paid model requests or provider retrievals were sent by this pass.

## Still open before launch

Apple sign-in configuration/token lifecycle; physical auth/email/push/camera/two-device acceptance; provider-by-provider pilots and real grant revocation; production migration/backup/restore rehearsal; approved dollar budgets, alert ownership, privacy/OAuth/store review and controlled release. See [the full checkpoint](overnight-finish-2026-10-12.md) and [operations gates](launch-operations-2026-10-12.md).

The wider multi-quote, compatibility and repair-versus-replace scope remains unfinished. Native sharing, voice, weather/AQHI, perks and broader benchmarks remain later scope. This is a consolidated test candidate, not an overall launch sign-off.

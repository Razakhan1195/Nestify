# Sign-in entry recovery — October 12, 2026

Completed the startup-routing portion of the authentication/deep-link audit. This is not a sign-off of native callback handling or email delivery.

## Observed gaps and fix

The root screen separately checked deletion recovery and onboarding. A failed deletion-receipt read set an error but still enabled onboarding, which could redirect to Home and hide the error. Its Try again action did not repeat the failed receipt read. Destination state also survived account changes while the component remained mounted.

Startup now checks saved deletion status, sign-in state, saved invitation, and household setup in order. Failed required reads stop navigation with a working retry. The optional onboarding draft still cannot prevent an existing household from opening Home. The entry component is keyed by signed-in user, and asynchronous reads stop affecting navigation after account change or unmount.

A saved phone invitation remains the destination after sign-in, before household onboarding. A matching deletion receipt takes priority; another signed-in account's receipt does not redirect the current user. Signed-out deletion recovery remains available.

Changed production file: apps/mobile/app/index.tsx. No authentication provider configuration, schema, server routes, schedules or deployments changed.

## Evidence

- 34 actual-component rendered scenarios: 17 cases at 320 and 390 px.
- Failed receipt, invitation and network reads with successful explicit retry; signed-out recovery failure; new/existing households; matching/foreign deletion receipts; saved invitation; optional draft failure; owner/member setup differences; auth initialization; account switch; late old-account receipt; sign-out during fetch.
- Actual startup, setup decision and loading components. Authentication, storage, network and router destinations simulated. No external network calls or outgoing messages in this runner.
- Screenshots visually inspected and horizontal overflow checked.
- The same harness against the archived pre-change startup component failed the first receipt-read recovery scenario as expected.
- Full regression: 903 passed, including existing password-recovery, SDK PKCE, email-code and social callback tests. Root and mobile TypeScript, scoped lint, Next build, iOS export and Android export passed.
- No new hosted authentication check was run. Prior hosted household evidence remains in phone-invite-recovery-2026-10-12.md.

## Availability and checkpoint

Reload the existing staging Expo Go server on 8081 for the client change. No backend deployment is needed, and existing TestFlight binaries do not receive it automatically.

docs/checkpoints/auth-entry-recovery-20261012 contains scoped before/after archives, SHA manifest, diff, rendered evidence and validation logs. Preserve unrelated working changes. The established dirty-workspace workflow commits only checkpoint documentation and archives; source remains in the working tree and is captured in after.zip.

## Remaining release gates

- Physical iOS/Android password-reset delivery, cold/warm link opening, interruption after verification, expired/reused links and successful return to household.
- Physical invitation link -> sign-in -> saved invitation -> request -> owner approval on two accounts/devices. Expo Go does not prove custom rezlee:// handoff in the installed app.
- Social sign-in remains subject to its existing release flag, provider configuration and native acceptance; this pass did not enable or validate Google/Apple OAuth.
- Continue engineering with notification destination/recovery and connected-account deletion/revocation, followed by the production-shaped release candidate and operational checks.
- No public release or overall authentication completion claim.

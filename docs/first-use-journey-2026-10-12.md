# First-use journey finish — October 12, 2026

## Result

This increment refines the existing onboarding rather than adding a second mandatory tour. The opening bill slide now shows a fictional comparison using the same statement arithmetic as the existing example. Customers can explore it before creating an account; examples never save records or initiate a connection. Existing signed-in customers still bypass the welcome.

Setup explains the upload/manual/provider choices before continuing, with an optional inline example. Home now uses the household-scoped starting preference to order unfinished suggestions. Completed tasks are not reintroduced, and another household does not inherit the preference.

The existing Add bill choices remain available. Their copy no longer promises recurring automatic updates or incorrectly says a provider connection is unavailable when a customer has simply chosen manual entry.

The provider finder and benefit-before-permission introductions remain the shared entry point: supported Ontario electricity/gas routes to Green Button; configured Deck providers use hosted sign-in; Rogers and unavailable listings offer upload. This pass did not enable new providers or change provider scopes.

Import feedback distinguishes verification, authenticated background work, no bills, one bill, partial results, failure and cancellation. Cancellation no longer says work is continuing; stopped imports expose the existing retry action. Next-step guidance never promises a comparison from one bill or an original PDF when none was saved.

## Verification actually performed

- Full regression run: 955 passed, 0 failed. After the final original-availability refinement, 19 focused journey/provider/history tests passed, including one additional test.
- 64 first-use rendered scenarios: welcome, returning account, signed-out/signed-in example, resumed setup/start/skip/save retry, provider routing/unavailable/no-match/offline retry, sign-in/MFA/background/empty/one/partial/stopped import results. Widths 320, 390 and 768; a 1.6x browser text stress pass at 390.
- 36 existing rendered connection scenarios passed, including cancelled authorization, retry, history selection, late account responses and consent boundaries.
- Root and mobile TypeScript checks passed; lint of every changed source/test/runner passed; Next.js production build passed; iOS and Android bundles exported successfully.
- Repository-wide lint did NOT pass: it includes generated QA bundles and historical CommonJS render scripts, plus existing unrelated errors in src/app/join-household/page.tsx and tests/feedback-lifecycle-database.test.ts. This is an outstanding repository cleanup/release gate. No rules were weakened globally.
- Visual inspection: welcome at regular/small/large-text sizes, setup choice, partial import. QA screenshots use fictional data only.

Rendered checks execute real React Native screen/component code through React Native Web with simulated router/account/storage/provider responses and blocked external traffic. They do not prove real provider sign-in, OAuth, MFA, push, native screen-reader or native Dynamic Type behaviour. No paid provider pulls, AI calls, or outgoing customer messages were initiated.

## Testing now

Expo Go development server 8081 was confirmed running. Reload the project to receive this source. TestFlight 0.1.0 (25) and the earlier Android artifact predate this increment; this pass did not submit a new store build.

1. Sign out and reopen Rezlee to see the welcome. Explore the example; return or create an account. Merely exploring must not request access.
2. With a fresh household, complete setup; choose bills and open the optional example. Continue into Add bill or choose Explore my Home first. Resume after an interruption.
3. In Add bill, try provider search and the upload route. Bell should explain Deck before sign-in; a supported Ontario energy utility should explain Green Button; Rogers should offer upload.
4. Check the real provider journey with your account, including verification, leaving only after authentication, reopening, and viewing saved bills. This is still physical/provider acceptance.

## Scope and checkpoint

This completes the engineering refinement of the first-use journey. It does not sign off the full launch audit, Apple sign-in, repository-wide lint, or physical-device/provider acceptance.

Scoped baseline/after archives, SHA-256 manifest, diff, rendered screenshots and verification summary are in docs/checkpoints/first-use-20261012/. The pre-existing dirty working tree was preserved. No reset, stash, broad source commit, public deployment, or scheduled provider activation was performed.

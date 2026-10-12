# Customer authentication finish — 2026-10-12

## What changed
The Home duplicate-key warning is reproducible when an owner has inventory: HomeUtilityProgress and RecallWatchSummary used the same household ID as sibling React keys. Their keys now include their component purpose while preserving household-specific remounting. The archived screen produces the warning; the fixed screen does not. This defect does not require an old or corrupt customer account.

Password help now supports entering the reset code from the email. The customer can read the email on another device, return to the requesting phone, paste the code, and continue to the existing new-password screen. This also provides a recovery path in Expo Go, where the app's custom scheme is not a substitute for a signed native build. One primary action per step, visible email destination, resend cooldown, change-email escape, useful error messages, and preserved progress are included. A wrong code stays editable. Interrupted verification restores the isolated recovery session before attempting another one-time exchange. A rejected link does not block the latest valid link. Codes/passwords never enter the progress record, route parameters, or logs. Normal app sign-in storage stays separate.

The staging recovery email now contains the code plus its original reset link. The confirmation email now welcomes the customer and suggests saving one bill, keeping one record, or setting one care reminder after confirmation. Both remain Rezlee-branded. This is not a separate post-confirmation welcome sender.

## Configuration finding and correction
The mobile .env still pointed to the older eynbuhmtxkigvqoewbwi backend and ezgb-test.rezlee.com, although the running Expo process had explicit current-staging overrides. The older backend's dashboard has Site URL https://rezlee.com/ and no native reset callback. This supports an explanation for the earlier website redirect; the exact historical email/session was not available to trace.

Current staging gjwvalpxnfbvryosmcbj already had branded confirmation/recovery templates and rezlee://reset-password allowed. It lacked the exact /auth/mobile-confirmed URL requested by mobile signup. That deployed endpoint returns HTTP 200 and a Rezlee app continuation page. The exact staging callback is now allowed; the six pre-existing entries were preserved.

The mobile public environment is now aligned with current staging; its original is backed up privately outside git at /Users/razakhan/Library/Application Support/Rezlee/customer-auth-finish-20261012/mobile-env.before. Only the three public mobile connection values changed. npm start and npm run start:clean now use the validated staging launcher in Expo Go on 8081. npm run start:dev-client retains the native development-build path. The staging launcher uses 8081 and refuses an occupied port instead of offering another port. The existing server remains on 8081. Reload Expo Go for client changes.

## Verification
- 913 regression tests passed (10 added recovery/controller/SDK cases).
- 22 actual-component rendered checks passed at 320 and 390 px: original/fixed Home with populated/empty/member states; wrong-code correction, restart, offline verification, interruption after verification, expired reset, wrong account, and email layout.
- Nine no-send hosted checks passed using disposable staging accounts: callback acceptance, actual recovery code verification, invalid/reused code rejection, password change, old/new password sign-in, and mobile signup callback acceptance. Test accounts removed.
- Scoped lint, web/mobile TypeScript, Next production build, iOS export and Android export passed.
- Occupied-port guard verified against the existing 8081 server; no second Metro was started.
- Dashboard saved previews verified for confirmation/recovery templates; redirect allowlist shows seven entries. Source templates retained for rollback.

Rendered checks use actual screen/controller code with mocked network, secure storage, router and Home child panels. Hosted tests use the real installed SDK/service but generate links through admin without delivering email. Neither is physical phone or inbox acceptance.

## Remaining acceptance
1. Authorized test inbox: check actual sender, deliverability, code, link, latest-email behavior, and confirmation return.
2. iOS/Android signed builds: native link handoff, background/kill/restart, keyboard/autofill, larger text/VoiceOver/TalkBack, signed-in and signed-out recovery.
3. Apple sign-in: finish platform/provider configuration and real-device flow, including cancel, private relay, existing-account behavior and account linking.
4. Separate once-only welcome sender and security-email set: see email-notification-inventory-2026-10-12.md. Do not claim all emails are already finished.
5. Full returning-account acceptance remains open. No customer data was migrated, cleared or rewritten to address the warning.

No backend code deployment or database migration was required here. Only the named staging auth templates and exact signup callback changed in hosted configuration; the older backend was read only. No emails/SMS, provider pulls, scheduled Gmail work, paid AI reads, production release or customer password changes were performed.

## Preservation and rollback
Scoped before/after source, diff, SHA manifest and evidence are in docs/checkpoints/customer-auth-finish-20261012. The working tree contains substantial inherited work, so the commit intentionally contains documentation/checkpoint archives only. Restore only these task files from before.zip, not the whole repository. Restore mobile .env from its private backup only if rolling back the environment correction. Restore the prior staging templates from before.zip and remove only https://staging.rezlee.com/auth/mobile-confirmed if rolling back hosted configuration. Existing callback entries and SMTP settings were not changed.

## Next engineering order
Finish the welcome/security-email lifecycle and notification destinations, then connected-account deletion/revocation and release operations. Physical delivery/device acceptance and credential-owning provider pilots remain explicit gates alongside engineering. The broader audit in audit-completion-status-2026-10-11.md remains open.

# Current audit completion status — October 11, 2026

This is the current closure checklist, reconciled against dated checkpoints. Implemented, staging verified, physical-device accepted and publicly released are separate states. Older roadmap sections are historical where they conflict with the linked checkpoints. No working feature is removed.

| Audit priority | Current evidence | Still needed |
|---|---|---|
| Home / Bills / Vault / Care | Existing improvements, rendered scenarios and authenticated staging checks; home-outcomes-2026-10-02.md and October 8–11 checkpoints | Fresh and returning households, owner/member, empty/partial data, native navigation, accessibility and actual first useful outcome on iOS/Android |
| Bill capture and saved records | capture-recovery-2026-10-09.md and bill-record-review-2026-10-09.md: originals, review/save, duplicate/revision handling and recovery implemented; capture-files-2026-10-11.md adds HEIC picker/recovery fixes and 40 hosted file-integrity checks | Real camera/HEIC, permissions, OS interruption/restart and mixed-source account acceptance; home-item recovery is now deployed and hosted-verified in inventory-recovery-2026-10-11.md; its physical interruption/restart acceptance remains pending; retain explicit copy decisions |
| Utility connections | provider-directory-2026-10-11.md: unified finder, 722 directory entries; Ontario view 54 Green Button, 29 configured Deck testing entries, 639 coming soon; Rogers paused | Green Button consent/reconnection/refresh acceptance; bounded credential-owning Deck customers validate MFA, first data and repeat retrieval per provider. No founder requirement to own all 29 accounts |
| Bill intelligence | bill-usefulness-2026-10-08.md: truthful amount basis, period/usage comparisons and selected-period graphs | Real mixed-provider usefulness; actual charge breakdown where available; energy-plan/interval claims require validated data. Amount due is not period spending |
| Did the action help? | bill-outcome-finish-2026-10-11.md: uploaded and Deck telecom amount checks; Green Button/manual energy usage follow-ups; independent action storage; 94 hosted checks and 60 rendered scenarios | bill-journey-review-2026-10-11.md adds exact agreed-price differences and account-switch form isolation, 106 rendered scenarios and a fresh 94-check hosted pass. Physical acceptance and customer usefulness; tariff-switch/dollar attribution and weather-normalized outcomes remain unproven, never implied by lower bills |
| Household coordination | phone-invite-recovery-2026-10-12.md adds durable invitation retries and account isolation with 23 hosted and 16 rendered checks; shared-completion, settle-up and care-recovery October 10; cleaning editing, schedules, fixed/rotating assignments implemented in feedback-acceptance-2026-09-29.md | Real invitation email/phone delivery and deep links; two phones; push delivery; native cleaning edit/assignment/recurrence. Recorded repayment does not move money |
| Useful home AI | Repair engineering scope completed in repair-finish-2026-10-10.md; quote-review-2026-10-11.md adds saved one-quote facts/excerpts, missing-detail questions, answers and linked decision notes, with 30 hosted and 36 rendered checks | Repair phone/usefulness gate; quote-live-validation-2026-10-11.md records eight authorized live text reads and fixes for omitted/conflicting evidence; real photo/PDF and physical/customer acceptance remain. Multiple-quote comparisons and supported compatibility/repair-versus-replace remain open |
| Capture across Rezlee | Reviewed bill/receipt intake and Gmail implemented; exact-original reuse, bounded discovery/recovery | Actual mailbox completion/attached-original and native OAuth/recovery acceptance; broader capture still requires reconciliation. Native sharing and voice remain deliberately later |
| Beta / release readiness | Staging engineering evidence and native bundle exports exist; statement-reading regression fixture corrected, 903 tests pass through phone invitation recovery; 19 additional hosted recovery checks passed | Signed production-shaped builds, auth/deep links, notifications, connected-account deletion/revocation, privacy/OAuth/store configuration, monitoring/support, explicit cost budgets, migration/backup/restore rehearsal and controlled promotion |
| Expansion | Intentionally later | Broader benchmarks, weather/AQHI, perks and wider validated coverage follow beta evidence |

## Immediate next steps
1. Accept the bill-to-action journey on physical phones using the finite checklist in bill-outcome-finish-2026-10-11.md. Fix observed usability/data defects; do not rebuild accepted arithmetic or add speculative insights.
2. Continue a bounded utility pilot with customers who own supported credentials. Provider readiness is recorded separately; configuration is not live reliability proof. Scheduled pulls remain off and further paid retrieval requires authorization.
3. Close actual invitation/two-device/notification and native capture/Care/repair gates. Cleaning editing and assignment are already built. Record exact device, version, expected/actual and observed failure; never call a bundle export device acceptance.
4. Accept the implemented one-quote Before I spend journey using quote-review-2026-10-11.md. The four approved text cases ran twice within the original budget; quote-live-validation-2026-10-11.md records defects, fixes and final deterministic replays. capture-files-2026-10-11.md verifies file transport/recovery; quote-files-live-validation-2026-10-11.md records eight live file reads, fixes and bounded fixture acceptance. Physical photo/PDF and customer usefulness remain unaccepted. Continue multiple-quote comparison and evidence-dependent compatibility/repair-versus-replace as separate increments.
5. Prepare the release candidate and complete operational gates. Founder console/identity/privacy and spending decisions must be concrete and reviewable. Public release is a separate decision.

## Delivery rules
- Current work is mobile/Expo plus the staging backend. Do not assume the existing TestFlight binary contains new client changes.
- No scheduled utility pulls or recurring Gmail searches are enabled by these milestones.
- No production release, new outgoing tester messages, paid provider tests or unrelated feature expansion is implied.
- Each new checkpoint must say what changed, its verification layer, exact remaining blocker, deployment and rollback.

## Latest closure and next priority
Home-item create recovery is implemented and deployed to staging: 890 regression tests, 22 rendered scenarios and 19 hosted checks passed. Retry identity, corrections, separate identical appliances, cancellation/deletion and account isolation have recorded evidence. See inventory-recovery-2026-10-11.md; checkpoint 5b99cac. The user has moved on, not reported physical acceptance, so phone interruption/restart checks stay open.

Staging Expo now uses port 8081 in Expo Go mode with explicit staging API/Supabase overrides (5449cd0); previous 8082 instructions are superseded.

The bill journey engineering pass is recorded in bill-journey-review-2026-10-11.md: 106 rendered scenarios and 94 hosted checks, with client changes available on staging Expo 8081. Physical usefulness acceptance remains open.

Latest household pass: phone-invite-recovery-2026-10-12.md. Invitation retries preserve their original identity and link, restoration gates editing, and account changes isolate sender/recipient screens. 903 regression tests, 16 rendered checks and 23 hosted phone-membership checks passed. No SMS/email was sent. Reload Expo 8081 for the client changes; backend unchanged.

Latest authentication entry pass: auth-entry-recovery-2026-10-12.md fixes failed required recovery reads, retries and stale-account destinations. 34 actual-component rendered scenarios and 903 regression tests pass. Client available after reload on Expo 8081; no backend deployment. Physical password-reset/link and native OAuth acceptance remain open.

Next engineering priority (revised for the user’s October 12 findings): complete the welcome/security-email lifecycle and Apple/native auth acceptance alongside notification destination/recovery, followed by connected-account deletion/revocation. Real invitation delivery and two-device access still require physical acceptance. Provider pilots and existing native capture/Care/repair gates remain open; no overall launch sign-off is implied.


## Customer authentication and experience pass — October 12
See customer-auth-finish-2026-10-12.md and email-notification-inventory-2026-10-12.md. The actual Home sibling-key warning was reproduced from the archived component and fixed. Password help now accepts email recovery codes with durable verification recovery and isolated auth storage. Staging confirmation/recovery emails were updated and the missing exact mobile signup return was added. Conflicting legacy mobile environment values were corrected; default Expo launch now validates staging and stays on 8081.

Evidence: 913 regression tests, 22 rendered checks and 9 real staging auth checks passed; lint, web/mobile types, Next build and iOS/Android exports passed. No customer messages or production release. Code verification does not certify inbox delivery or native handoff. This was the status at checkpoint 192b630; the later communications increment below implements the separate welcome and enables the staging password-change notice. The confirmation email's welcome copy is not a separate delivered welcome lifecycle.

Current order: (1) finish authentication/welcome/security communications and Apple configuration, (2) notification destinations/preferences/delivery, (3) connected-account deletion/revocation, (4) operational limits, monitoring/support and release candidate, while completing physical acceptance and bounded provider pilots. Preserve the earlier audit gates for bill usefulness/outcomes, household two-device behavior, capture and home AI; none is silently signed off by this pass.

## Customer communications pass — October 12

See customer-communications-2026-10-12.md. A one-time welcome is implemented for new verified mobile accounts after the staging rollout cutoff. All 13 Supabase auth/security templates are now branded (11 added in this increment); password-changed delivery is ON in staging, other six security switches OFF. Notification destinations now enforce current ownership/record access, retire obsolete updates, survive read-receipt failures and preserve lock/recovery/account-switch boundaries. Inbox pagination deduplicates.

Evidence: 924 regression tests, 20 actual-component rendered notification scenarios, 24 email layout checks and 23 hosted no-send checks recorded in the checkpoint. Lint, types, Next build and native exports passed. Physical inbox/push/deep-link acceptance is still pending; no production release, customer test messages, paid provider calls or recurring jobs. The combined founder checklist includes the previous Home/recovery work. Next independent engineering: connected-account deletion/revocation; Apple/native auth and actual device acceptance remain open alongside the other audit gates.


## Connection introduction pass — October 12

The user moved the Hark-inspired benefit-before-permission UX pass ahead of the next backend milestone. It is now implemented for Green Button, hosted Deck and Gmail; see connection-intros-2026-10-12.md. Each intro explains the useful result, sign-in/verification steps and access before continuing, with manual alternatives. Deck cancellation retains the selected history; reconnect loading is explicit; Gmail reconnect retains saved categories; entry screens isolate account changes. The unified provider finder and provider availability/classification are preserved.

Evidence: 36 actual-screen scenarios at 320/390 widths, 924 regression tests, lint/types/Next build and iOS/Android exports passed. Client changes are available after reloading staging Expo 8081; backend unchanged. No live paid provider calls, customer messages, scheduled jobs or production release. Native OAuth/MFA, consent refusal, phone accessibility and actual customer usefulness remain pending.

Next independent engineering returns to connected-account deletion/revocation. Apple sign-in/native auth, actual communications delivery, the release candidate and operational gates remain open alongside all earlier audit acceptance gates. This introduction pass does not sign them off.

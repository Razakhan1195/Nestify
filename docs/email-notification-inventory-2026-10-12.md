# Rezlee email and notification inventory — 2026-10-12

This records code paths and inspected staging configuration, not proof of delivery to customer inboxes or phones. A configured sender, an API success and actual customer receipt are separate evidence. All customer-facing messages should use Rezlee branding and one useful action. No messages or new notification subscriptions were sent/enabled during this review.

## Email inventory

| Message | Current implementation / trigger | Status and finish work |
|---|---|---|
| Confirm signup | Supabase email signup; confirmation.html | Branded staging template updated with welcome and optional starting ideas. Exact mobile confirmation return added. Real inbox and native return still need acceptance. |
| Reset password | Supabase recovery; recovery.html | Branded staging email now offers recovery code and link. Isolated app code-entry flow and hosted verification pass. Actual delivery and OS handoff remain open. |
| Separate welcome after verified signup | No dedicated sender found in the customer-email paths | Build one durable once-only welcome event for a newly verified account, including social signup. Existing-account sign-in must not send another welcome. One app continuation CTA and a few useful starting choices; no claim setup is complete. |
| Household invitation | Custom Resend sender in src/lib/email/household-invite.ts | Branded invitation is implemented. Joining shares Household/Care/expenses; private Bills/Vault stay separate. Actual delivery, expiry/revocation and two-device acceptance remain open. |
| Waitlist confirmation | Custom Resend sender in src/lib/waitlist/server.ts | Implemented, configuration-gated, with confirmation expiry and unsubscribe. Keep distinct from live app signup; reconcile the website's current acquisition flow before launch. |
| Support/contact submission | src/app/api/contact/route.ts sends to the configured support inbox | Internal support delivery is implemented with reference/idempotency and caps. This is not a customer acknowledgment email. |
| Support acknowledgment to customer | No automatic customer acknowledgment found | Consider a short receipt with reference and realistic response expectation. Needs a durable delivery record to prevent duplicate acknowledgments on retries. |
| Ordinary magic link/sign-in code | Supabase template; separate mobile email-code gate | Separate from recovery codes. Do not imply this sign-in method is broadly launched. Branding and delivery need acceptance if enabled. |
| Auth admin invitation | Supabase Invite user template | Distinct from household invitation. No reviewed customer household flow uses this as its delivery mechanism. Brand before any intended admin-invite rollout. |
| Change-email confirmation | Supabase Change email address template | Available auth template; customer flow and branding require reconciliation before exposing email changes. |
| Sensitive-operation reauthentication | Supabase Reauthentication template | Available auth template; configure and test only with the associated product flow. |
| Password-changed security notice | Supabase security email | Staging switch observed OFF. Recommended launch security notice, with branded copy and account-security/support guidance. Not enabled in this pass. |
| Email-address-changed security notice | Supabase security email | Staging OFF. Recommended when email change is supported. |
| Phone-number-changed security notice | Supabase security email | Staging OFF. Enable with a supported auth-phone change flow; household member contact edits are a separate concept. |
| Sign-in method linked | Supabase security email | Staging OFF. Recommended when Apple/Google linking is enabled; test intended and unexpected linking. |
| Sign-in method removed | Supabase security email | Staging OFF. Recommended with account linking/removal; verify the customer retains a working sign-in method. |
| MFA method added | Supabase security email | Staging OFF. Brand and enable with actual customer MFA enrollment. |
| MFA method removed | Supabase security email | Staging OFF. Brand and enable with actual customer MFA removal. |
| Deletion request / completion | No customer email sender found in the reviewed send paths | Reconcile with existing deletion receipt/job flow. Never say deletion is complete while provider revocation or cleanup remains pending. |
| Optional digest / feature or marketing emails | No general customer campaign sender found in reviewed code | Later, with explicit preferences and unsubscribe. Do not turn transactional auth email into a marketing subscription. |

Primary source locations: supabase/templates; apps/mobile/src/auth/email-auth.ts, email-code.ts and recovery-client.ts; src/lib/email/household-invite.ts; src/lib/waitlist/server.ts; src/app/api/contact/route.ts. Hosted staging security-email switches were inspected in Supabase. SMTP branding was previously configured; this pass did not change SMTP credentials or certify mailbox delivery. The older backend was read only.

## In-app and push inventory

| Category / event | Existing mechanism | Customer-facing finish work |
|---|---|---|
| Connection verification needed | Deck telecom verification queue and provider verification notifications | Open the current valid challenge; expired/resolved challenges should lead to useful connection status. No account credentials or codes in notifications. |
| Connection import complete | Telecom completion and provider_sync_ready notifications | Open the saved data actually available; connected status alone is not proof bills arrived. |
| Connection stopped, failed or action required | Telecom stopped; provider_action_required/provider_sync_failed paths | Explain the next step without implying unsupported automatic recovery. Reconnect/MFA/provider-specific acceptance remains open. |
| Bill reminder | Saved unpaid, nonarchived, non-autopay records; notification refresh | Existing in-app/push path. Bills preference defaults OFF. Marked paid/scheduled, revised due dates, local date and quiet-time behavior need phone acceptance. |
| Care reminder | Saved open tasks due for the responsible owner/member | Existing in-app/push path. Care preference defaults OFF. Reassignment, completion, recurrence and household switching need phone acceptance. |
| Possible product recall | Recall matching/monitor events | Existing inbox and push path. Wording is a possible match with official details, not a confirmed recall of that customer's item. |
| Recorded household repayment | shared_repayment event on recorded payment/removal | Existing inbox/push path for affected recipients. Does not move money. Notification must reflect latest ledger state. |
| Shared balance reminder | Explicit household reminder event | Existing deduplication and recipient-scoped path. Sender action, recipient preferences and stale balances need acceptance. |
| Recall test push | Explicit test-notification route | Diagnostic customer action, not a recurring campaign. Requires real device permission/delivery acceptance. |
| Capture/import background work | Progress/recovery exists in individual journeys | Reconcile which completions need an inbox item when the user leaves; notify only when useful, and never claim an interrupted upload was saved. |
| Action outcome follow-up | Saved action/evidence journey exists | Determine a useful opt-in follow-up event when subsequent evidence exists; no automatic “you saved money” claim. |
| General cleaning assignment / household membership updates | Shared Care and invitation flows exist | Do not assume every edit or membership event emits push. Reconcile desired events and recipient rules before adding more notifications. |

Default app preferences: push enabled, connections/recalls/shared expenses ON; bills/care OFF; timezone America/Toronto. OS permission and registration are still required. Actual sending also depends on runtime gates and workers. Saved-record bill/Care dispatch groups notices, applies local 09:00–20:00 quiet-time bounds and daily category caps; ambiguous sends are recorded instead of blindly retried. No worker schedule was enabled here.

Primary source locations: src/lib/notifications/{policy,service}.ts; src/lib/deck/telecom-push.ts; src/lib/recalls/monitor.ts; src/lib/sync/{provider-sync,deck-v2-runtime}.ts; notification and shared-settlement migrations; apps/mobile/src/lib/{notification-data,push-notifications}.ts.

## Implementation order and UX rules
1. Finish the authentication email family and once-only welcome lifecycle; validate one real authorized inbox end to end.
2. Finish notification tap/restore/account boundaries and preference handling against actual device delivery.
3. Tie deletion notices to true lifecycle state; complete support receipt decisions and operational ownership.
4. Add optional engagement messages only after useful transactional behavior is accepted.

Each event needs a trigger, intended recipient, deduplication identity, expiry/resolution rule, preference rule, destination, fallback and delivery status. Keep private account content out of lock-screen copy. Only ask for notification permission when the customer understands its benefit. Preserve progress, explain partial completion honestly and provide one clear next step.

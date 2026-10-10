# Shared expenses: multi-roommate completion — 2026-10-10

## What changed
- Expense selection summary scales to groups (two named people plus remaining count); the people sheet lists every selection and explains that only selected people share the expense. Defaults still select only the current user; others are explicitly selected.
- After an uncertain expense/repayment write, attempted details remain locked and the primary action checks that exact command through the existing persisted idempotent save. This prevents edits from silently changing the attempted transaction.
- Stale expense edits offer explicit latest-version review, with confirmation before discarding unsaved edits. Stale repayment balances offer refresh. Missing requested edit entries cannot fall through into creation.
- Confirmed person creation survives a subsequent failed list refresh. The customer can refresh people without sending add-person again.
- The ledger names the interrupted expense/repayment and offers Check previous save. Repayment success text accurately describes the recorded repayment.

## What already existed and was preserved
Multiple roommates (up to existing 40-share limit), equal/exact splits, arbitrary payer, subsets of household participants, invited/local/joined/former identities, explicit invitation acceptance, pairwise balances, full/partial recorded repayments, correction/removal history, private original bills, source-bill sharing, server idempotency and concurrency protection. Design system, routes, tabs and existing creation controls retained. No new payment integration, automatic invitation, debt re-routing, schema, API, permission, dependency or environment change. Production, website, stored customer data and provider integrations untouched. Scheduled pulls remain off. No functionality removed.

## Verification performed
- 16 targeted automated tests passed: integer cents, up to 40 equal shares, participant selection, group summaries, ledger presentation, saved-bill amount basis, database/RLS lifecycle and linked-invitation lifecycle.
- 26 rendered interaction scenarios at 320/390 widths using actual forms/people sheets/ledger and arithmetic: 2/3/5 people, five exact shares, subset with different payer, lost expense/repayment response, stale correction/current-version reload, partial repayment, changed-balance refresh, confirmed-person/failed-refresh recovery, initial offline/retry and existing pending-save recovery. Network, router, native/date boundaries use controlled fixtures. The exact-split harness initially targeted underlying form fields during the modal transition; fixed the test to select only the five share fields. Final suite passed with no page errors or horizontal overflow.
- Visually inspected the five-person equal form at 390px and exact form at 320px; earlier participant sheets also inspected. Native icons/header/date picker are mocked in the render harness; these are not phone screenshots.
- 43 hosted staging ledger assertions passed: isolation, payer/shares, concurrent retries, corrections, full/partial repayments, over-settlement rejection, credits, pagination and removal.
- 30 hosted staging linked-invitation assertions passed: local person, pending/no access, cancellation, expiry, recipient acceptance, stable identity/balance, retained history and revoked access. Acceptance exercised authenticated RPCs; emails were deliberately not sent.
- 31 additional hosted group assertions passed: 2/3/5 people, rounded equal splits, exact subset, different payer, partial repayment affecting only the correct pair, and one of five roommates accepting a linked invitation while others remain unjoined.
- Total 104 hosted assertions. All disposable test users and related fixture rows cleaned. No customer records modified, emails sent, AI calls or paid provider retrievals.
- Mobile TypeScript, scoped lint and iOS/Android JS/Hermes exports passed. Metro 8082 confirmed running. No backend code change or deploy needed.

## Where to test / remaining limits
Reload the staging development app; open Bills → Expenses (or the existing Split expense Home shortcut). Add/select three or five people, save equal/custom shares, inspect the expense and household balances, record a partial repayment, and correct an expense. Named participants do not get app access until an invitation is explicitly sent and accepted. People & invites retains email/phone entry and accurate status.
These mobile changes were not rebuilt/submitted to TestFlight. Physical iOS/Android touch, keyboard, screen-reader, large-text, OS termination and invitation delivery/deep links remain unverified. Existing unsaved-form leave confirmation remains; only attempted saves are persisted for recovery. No new offline drafting promise. Balances are recorded obligations; no money moves or bank verification occurs. Existing authorization rules remain: members edit their own entries; owner can manage all.
Next bounded product milestone: inspect/fix remaining existing repair and maintenance completion journeys. Physical capture/sharing acceptance stays on release checklist.

## Rollback / checkpoint
Previous checkpoint HEAD: 190eaf5. Scoped before/after archives, hashes and patch: docs/checkpoints/shared-completion-20261010. Restore only matching scoped files after checking current hashes. The repository has substantial unrelated dirty changes; never reset it wholesale. The commit stores this task's recoverable source archives and evidence rather than staging all pre-existing source changes. No server rollback required.

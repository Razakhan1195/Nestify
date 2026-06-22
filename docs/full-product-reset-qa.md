# Full Product Reset QA

## Automated Checks

Run during this sprint:

- `npm run lint`
- `npm run build`

Browser click-through QA was not run because the in-app browser execution tool was not available in this session.

## First-Time User QA

1. Open the app as a user with no bills, records, tasks, providers, or issues.
2. Expected: Dashboard explains the product clearly with the headline `Run the place you live with less chaos`.
3. Expected: only one primary setup entry point appears.
4. Open Start setup.
5. Expected: setup options are Add bill/rent, Save document, Add care reminder, Get help with issue, optional Connect provider.
6. Complete one item.
7. Expected: Dashboard changes from empty to early/active state without repeated setup CTA spam.

## Bill Flow QA

1. Go to Bills.
2. Try adding a bill without due date.
3. Expected: validation blocks save.
4. Try adding a bill without amount.
5. Expected: validation blocks save.
6. Add a complete bill with title, category, amount, and due date.
7. Expected: Bills updates.
8. Expected: Dashboard Coming Up or Things to Handle updates once if due date is relevant.
9. Mark bill paid.
10. Expected: active Dashboard item clears.
11. Expected: Recent Activity records `Bill marked paid`.

## Missing Due Date Legacy QA

1. Simulate an existing bill with no due date or no amount.
2. Expected: Bills shows it under `Incomplete`.
3. Expected: Dashboard does not show missing due date spam.
4. Complete the details from the Incomplete row.
5. Expected: bill moves into the correct active/paid group.
6. Expected: Dashboard updates cleanly.

## Document Flow QA

1. Go to Vault.
2. Try saving a document without category.
3. Expected: validation blocks save.
4. Add a document without renewal date.
5. Expected: appears in Vault.
6. Expected: no Dashboard warning.
7. Add a document with renewal date soon.
8. Expected: Coming Up or Things to Handle shows one Vault item if relevant.

## Care Flow QA

1. Go to Care.
2. Try adding a reminder without type/category.
3. Expected: validation blocks save.
4. Add a task without due date.
5. Expected: appears in Care only.
6. Expected: no Dashboard due warning.
7. Add a task with due date.
8. Expected: Dashboard Coming Up or Things to Handle updates once if relevant.
9. Complete task.
10. Expected: active item clears and Activity records `Task completed`.

## Help Flow QA

1. Go to Help.
2. Start issue check.
3. Save urgent issue.
4. Expected: safe next steps and escalation copy appear.
5. Expected: Dashboard may show one urgent issue item.
6. Create Care task from issue.
7. Expected: Care task appears in Care.
8. Expected: Dashboard does not show both issue and linked task.
9. Resolve issue.
10. Expected: issue clears from active Dashboard items.

## Provider Flow QA

1. Go to Providers.
2. Add a manual provider with category and provider name.
3. Expected: provider appears.
4. Expected: Dashboard does not show generic setup warnings.
5. Mock connect/sync if supported.
6. Expected: provider status updates.
7. Expected: Activity records provider connection when first connected.
8. Expected: provider sync issue only appears on Dashboard when connected and tied to real bill/document value.

## Mobile QA

Test on mobile width:

- Dashboard
- Bills
- Add Bill form
- Vault
- Care
- Help issue flow
- Providers

Expected:

- no horizontal overflow
- forms stack cleanly
- tap targets are usable
- nav sheet opens and closes
- dialogs/details are usable
- primary action remains visible

## Accessibility QA

Check:

- page heading order
- button labels
- form labels
- keyboard flow through forms and dialogs
- visible focus states
- status badges have text labels
- color is not the only signal for severity

## Fixed In This Sprint

- Added `docs/full-product-reset-audit.md`.
- Added `docs/product-narrative.md`.
- Added `docs/full-product-reset-qa.md`.
- Added Dashboard source helpers:
  - `src/lib/product/upcoming.ts`
  - `src/lib/product/summary.ts`
- Removed Dashboard missing-due-date next action.
- Kept Dashboard Coming Up to core loops: Bills, Vault renewals, and Care.
- Required document category server-side and in the Vault form.
- Required Care task category server-side and in the Care form.
- Reduced over-prominent secondary support CTAs in Vault and Care.

## Known Limitations

- Browser QA still needs to be run manually.
- `/app/inventory`, `/app/projects`, and `/app/timeline` remain supporting routes, not primary nav.
- Bill PDF attachment from a manual bill row still routes to Vault rather than attaching directly to the bill.
- No new database schema was added in this sprint.

# Product Integrity QA

## Bill QA

1. Open Bills and try to add a bill without a due date.
   - Expected: browser/server validation blocks save.
2. Try to add a bill without an amount.
   - Expected: browser/server validation blocks save.
3. Add a complete bill with title, category, amount, and due date.
   - Expected: bill appears in Bills.
   - Expected: Dashboard This Month updates.
   - Expected: if due date is today/soon/overdue, only one active action appears.
4. Mark the bill paid.
   - Expected: bill appears under Paid / handled.
   - Expected: Dashboard active item clears.
   - Expected: Recent Activity shows `Bill marked paid`.

## Missing Due Date / Legacy Bill QA

1. Simulate or use an old bill with no due date or no amount.
   - Expected: bill appears under Bills -> Incomplete.
   - Expected: bill does not appear as overdue or due soon.
   - Expected: Dashboard does not show repeated `Add due date` prompts.
2. Complete the missing fields from the Incomplete row.
   - Expected: bill moves to Upcoming, Needs action, or Paid based on status/date.
   - Expected: Dashboard updates once.

## Document QA

1. Add a document without a renewal/expiry date.
   - Expected: document appears in Vault.
   - Expected: Recent Activity shows `Document saved`.
   - Expected: Dashboard does not create a renewal warning.
2. Add a document with a renewal/expiry date soon or in the past.
   - Expected: Dashboard Coming Up or Things to Handle shows one Vault item.

## Care QA

1. Add a Care task without a due date.
   - Expected: task appears in Care.
   - Expected: Dashboard does not create a due warning.
2. Add a Care task due today.
   - Expected: Dashboard shows one relevant Care item.
3. Complete the task.
   - Expected: task clears from active Dashboard items.
   - Expected: Recent Activity shows `Task completed`.

## Help QA

1. Save an urgent issue.
   - Expected: Help stores the issue.
   - Expected: Dashboard may show one issue item.
2. Create a Care task from the issue.
   - Expected: Care task appears in Care.
   - Expected: Dashboard does not show both the issue and linked task.
3. Resolve the issue.
   - Expected: Dashboard clears the issue.
   - Expected: Recent Activity shows `Issue resolved`.

## Provider QA

1. Add a manual provider.
   - Expected: provider appears in Providers.
   - Expected: Dashboard does not show generic provider setup warnings.
   - Expected: Recent Activity can show `Provider added`.
2. Connect or mock sync a supported provider.
   - Expected: provider state updates.
   - Expected: Recent Activity can show `Provider connected`.
   - Expected: provider sync issues only appear on Dashboard when tied to real bill/document value.

## CTA QA

- Add bill: creates a complete active bill or blocks incomplete input.
- Complete bill details: updates legacy incomplete bills without creating duplicates.
- Mark bill paid: disables while pending, updates bill, clears active item, shows `Bill marked paid.`
- Add document: saves a Vault record and shows `Document saved.`
- Add reminder: saves a Care task and shows `Reminder added.`
- Complete task: clears active Care item and shows `Task completed.`
- Save issue: saves Help issue and shows `Issue saved.`
- Create Care task: creates one linked task and shows `Task created.`
- Mark issue resolved: clears issue and shows `Issue resolved.`
- Add provider: saves provider and shows `Provider added.`
- Dismiss / Snooze / Mark handled: updates attention resolution and removes the active item from Dashboard until applicable.

## Edge Case QA

- Due today: appears as due today/due soon once.
- Due tomorrow: appears as due soon once.
- Due yesterday: appears as overdue once.
- Paid bill with past due date: does not appear in Things to Handle.
- Duplicate bill title/date/amount: should not create duplicate Dashboard prompts for the same source id.
- Manual bill with no provider: uses bill title/category fallback.
- Connected provider bill with missing PDF: no active warning solely because PDF is missing.
- Amount changed on paid bill: should not become a payment action.
- Document without file: valid Vault record.
- Care task skipped/not relevant: should not appear in active queue when represented by resolution state.

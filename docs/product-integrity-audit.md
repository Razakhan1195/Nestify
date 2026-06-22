# Product Integrity Audit

## 1. Current Routes / Pages

- `/app`: Dashboard. Reads bills, providers, maintenance tasks, documents, issues, bill events, timeline events, and attention resolutions.
- `/app/bills`: Bills and manual bill entry. Supports add bill, add due date, mark paid, review/dismiss/snooze actions.
- `/app/documents`: Vault. Supports manual document/record creation and document renewal dates.
- `/app/maintenance`: Care. Supports reminder/task creation, starter tasks, complete task, and issue-linked tasks.
- `/app/help`: Guided issue help. Saves household issues, creates linked Care tasks, resolves issues.
- `/app/providers`: Guided provider setup. Adds provider categories and provider names.
- `/app/providers/[id]`: Provider detail, Deck connection/sync actions.
- `/app/settings`: Home profile/settings.
- Supporting routes: `/app/attention`, `/app/inventory`, `/app/projects`, `/app/timeline`, `/app/onboarding`, `/app/assistant` redirect.

## 2. Current Data Models / Tables

- `homes`: place profile and optional operating metadata.
- `providers`: provider category/name, Deck connection metadata, connection health, expected bill dates.
- `bills`: bill title, amount, due date, status, source, provider link, raw data, PDF flag, period data.
- `documents`: vault records, file metadata, source, provider link, issued/expiry dates.
- `maintenance_tasks`: Care tasks/reminders, due date, status, category, priority.
- `repair_issues`: guided Help issues, urgency, status, recommendations, related task/project/provider.
- `timeline_events`: product activity/history.
- `attention_resolutions`: dismiss/snooze/handled state for generated action items.
- `bill_events`: generated bill intelligence events and review state.
- Supporting: `inventory_items`, `projects`, `project_expenses`, `service_providers`, `reminders`, `sync_events`, `insights`.

## 3. Current Workflow Map

- Add bill -> `bills` insert -> `timeline_events.bill_added` -> bill intelligence refresh -> Dashboard may show cost, Coming Up, Things to Handle, Activity.
- Mark bill paid -> `bills.status = paid` and `paid_at` -> attention/bill events handled -> `timeline_events.bill_paid` -> Dashboard clears active bill items.
- Add document -> `documents` insert -> `timeline_events.document_added` -> Dashboard Vault count and Activity update. Renewal only matters when `expires_on` exists.
- Add reminder -> `maintenance_tasks` insert -> `timeline_events.maintenance_added` -> Dashboard Coming Up/Things to Handle when due date exists.
- Complete task -> `maintenance_tasks.status = completed` -> `timeline_events.maintenance_completed` -> Dashboard clears active Care item.
- Start issue check -> client-side guided flow in Help.
- Save issue -> `repair_issues` insert -> `timeline_events.issue_saved` -> Dashboard shows only urgent/high unresolved issue without linked task.
- Create Care task from issue -> `maintenance_tasks` insert and `repair_issues.related_task_id` update -> `timeline_events.issue_task_created` -> Dashboard should prefer the Care task over the issue.
- Add provider -> `providers` insert -> `timeline_events.provider_added` -> Dashboard should not create generic setup warnings.
- Connect/mock sync provider -> provider connection metadata/status update, bills/documents may be created, `provider_connected` activity can be created.

## 4. Broken Or Incoherent States Found

- Add Bill allows missing amount and missing due date while saving the bill as `upcoming`.
- Missing due date bills can become Dashboard action items, making Dashboard clean up invalid data created by the app.
- Bills page lacks an explicit `Incomplete` group for legacy/incomplete bills.
- Dashboard action queue can include missing due date as a normal active item instead of keeping it mainly on Bills.
- Bill status is stored as free text; existing code uses `upcoming`, `needs_attention`, `overdue`, and `paid` without a single classifier.
- Bill events can independently produce `due_date_missing`, creating duplicate missing-date prompts beside direct bill-derived prompts.
- A bill row can show multiple competing actions: mark paid/review/add due date plus PDF action plus attention menu.

## 5. Data Validation Gaps

- Manual bill amount is optional in schema and form.
- Manual bill due date is optional in schema and form.
- Manual bill status is accepted from hidden form input rather than normalized from data.
- Legacy bills with missing amount or due date are not explicitly classified as incomplete.
- `updateBillDueDate` only sets due date; it does not normalize incomplete bill status back to active/upcoming.

## 6. Duplicate Dashboard / Action Issues

- Missing due date can appear from bill data and from `bill_events`.
- One source object can influence Hero and Things to Handle at the same time because Hero uses the primary action item. This is acceptable only if the item is not repeated elsewhere as Next Best Action.
- Issue + linked Care task is mostly handled because linked issues are filtered out, but the rule should remain in the shared queue.
- Provider setup is mostly suppressed; connected-provider missing bill is allowed.

## 7. Dead Or Unclear CTAs

- `Add bill` currently creates incomplete active bills because required fields are too loose.
- `Add due date` works, but should be reserved for legacy/incomplete rows on Bills.
- `Add PDF` routes to Vault but does not attach a PDF to the bill; this is a secondary placeholder CTA, not a direct upload.
- `Connect provider` on manual bill rows is useful but should remain secondary.
- Attention overflow actions rely on `attention_resolutions`; if migration is missing, the Dashboard already shows a migration warning.

## 8. Edge Cases That Must Be Handled

- Bill missing due date or amount from legacy data: classify as incomplete; do not treat as overdue/due soon.
- Due today/tomorrow/yesterday: classify cleanly as due soon or overdue; one action item only.
- Paid bill with past due date: never appears in active queue.
- Manual bill with no provider: use bill title/category fallback.
- Connected provider bill with missing PDF: can show a secondary Vault/PDF CTA, not an action queue warning.
- Document without expiry: no Dashboard warning.
- Document renewal past/soon: one Vault action item.
- Care task without due date: stays in Care only.
- Completed/skipped/not relevant task: no active queue item.
- Urgent issue with linked task: show task, not both issue and task.
- Provider manual/added state: no Dashboard spam.
- Sync failed provider: only Dashboard-worthy when tied to connected provider/value.

## 9. Fix Plan

1. Create product rules helpers for bill completeness and status classification.
2. Require amount and due date in the default Add Bill flow.
3. Normalize new manual bills to `upcoming` or `overdue` based on due date; never create active incomplete bills by default.
4. Classify legacy bills missing amount/due date as incomplete on Bills page.
5. Add an `Incomplete` group between Needs Action and Upcoming/Paid.
6. Keep missing due date/amount out of Dashboard action queue except as a single low-priority fallback only when there are no stronger active items.
7. Suppress `due_date_missing` bill events from the primary Dashboard queue to avoid duplicate missing-date prompts.
8. Make `updateBillDueDate` normalize status when details are completed.
9. Keep documents without renewal, tasks without due dates, linked issues, and manual providers out of active Dashboard warnings.
10. Run lint/build and update QA docs.

## 10. QA Checklist

- Add bill without due date: blocked by form/server validation.
- Add bill without amount: blocked by form/server validation.
- Add complete bill: appears in Bills and Dashboard where relevant.
- Legacy missing due date/amount bill: appears once under Incomplete, not as repeated Dashboard prompts.
- Mark paid: bill moves to Paid and clears Things to Handle.
- Add document without renewal: Vault and Activity update, no warning.
- Add document with renewal: Coming Up/Things to Handle update if relevant.
- Add task without due date: appears in Care, no Dashboard warning.
- Add task due today: Dashboard updates once.
- Complete task: clears active item.
- Save urgent issue: Dashboard shows one issue if no linked task.
- Create Care task from issue: Dashboard shows task, not issue and task.
- Resolve issue: Dashboard clears issue.
- Add provider: no Dashboard setup spam.
- Mock sync provider: provider state/activity updates without repeated activity.

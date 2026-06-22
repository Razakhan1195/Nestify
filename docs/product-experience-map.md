# Nestify Product Experience Map

## Core Promise

Nestify helps homeowners understand what changed, what is due, what needs attention, and what to do next across bills, providers, records, and maintenance.

## Main Journey

Set up home -> connect providers -> capture first bill -> review dashboard -> resolve attention items -> build home history.

For returning users: land on Dashboard, review open actions, handle or snooze what matters, then use Bills, Providers, Vault, Maintenance, and Home for deeper work.

## Page Purposes

| Page | Job | Primary CTA | Secondary CTA | Main Data | Key States |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Monthly home command center | State-based: Connect first provider, I paid this, View bill, Choose provider, Review change | Open Vault, View all items | Providers, bills, bill events, attention resolutions, documents, maintenance | setup, active, no issues, error |
| Providers | Set up sources for bills, PDFs, usage, and monthly intelligence | Choose provider, Connect provider, Retry sync, Reconnect, View details | View details, snooze/dismiss setup reminders | Provider categories, providers, Deck connection state | empty, setup, connected, needs attention |
| Bills | Control home costs, due dates, PDFs, and bill changes | Row-based: I paid this, View bill, Review change, Connect provider | Add bill manually, Open PDF, dismiss/snooze | Bills, bill events, provider labels | no bills, needs review, due soon, upcoming, paid |
| Vault | Home memory for proof and records | Add record | Connect providers, open inventory | Documents, PDFs, warranties, record categories | empty, active, renewal/review needed |
| Maintenance | Home care rhythm and repair follow-ups | Add reminder, Mark complete | Snooze, Skip, Not relevant, Open projects | Maintenance tasks, starter tasks, projects | empty, starter setup, due soon, active |
| Home | Property profile and history hub | Update home details | Open timeline, inventory, providers | Home profile, providers, timeline, inventory | incomplete profile, active, history building |

## Object And Action Model

| Object | Display Rule | Primary Action | Resolution |
| --- | --- | --- | --- |
| Provider | actual provider name, then category | Choose, Connect, Retry, Reconnect, View details | handled when connected/healthy |
| Bill | provider name, bill title, category, manual label | I paid this, View bill, Review change, Connect provider | paid, reviewed, dismissed, snoozed |
| Bill event | customer-friendly title and explanation | event-specific action | open, handled, dismissed, snoozed |
| Action queue item | source + id + event type deduped | one obvious action | leaves Needs Attention when resolved |
| Vault record | title + category + source | View record, Add file, Review record | handled/snoozed/dismissed where relevant |
| Maintenance task | task title + due timing | Mark complete, Add reminder | completed, skipped, snoozed |
| Activity item | historical event copy | View related area | never appears as active warning |
| Home profile | nickname + address/context | Update home details | saved profile improves dashboard context |

## Action Queue Rules

Needs Attention shows open actionable items only. Recent Activity shows history only.

Deduplicate by source type, source id, event type, normalized title, and normalized description. Dashboard shows the top three open items and links to the full attention queue.

Every warning must include a resolution path: complete, pay, review, choose provider, connect provider, snooze, dismiss, or mark handled.

## State Rules

Empty states explain what the section does, why it matters, and what to do next. Setup states guide the next provider or first bill. Active states prioritize open actions before history. Handled, dismissed, and snoozed items stay out of active sections until snooze expires.

## Acceptance Checklist

- Dashboard answers: what needs attention, what changed, what is due, what to do next.
- Providers has exactly one obvious next action per category.
- Bills are grouped by needs review, due soon, upcoming, and paid.
- Vault explains records as home memory, not a random upload area.
- Maintenance starter tasks are actionable.
- Activity is not mixed with active warnings.
- No customer-facing headline uses "Provider not selected yet".
- Every visible CTA works, submits an action, navigates to a useful route, or is intentionally disabled with a reason.
- Success toasts are short, specific, and auto-dismiss.

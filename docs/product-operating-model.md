# Nestify Product Operating Model

## 1. Product Promise

Nestify helps households stay on top of what is due, what changed, what needs fixing, what needs storing, and what to do next.

Nestify is for renters, homeowners, couples, families, roommates, and anyone responsible for managing the place they live, whether that place is an apartment, condo, townhouse, or house.

The problem Nestify solves is household drift: bills get missed, records scatter, chores and repairs live in people’s heads, cost changes are hard to notice, and shared responsibilities become unclear. It exists to turn the messy operational work of living somewhere into a calm monthly command center.

Provider sync is an automation enhancer, not the product. Nestify must still be useful without it through manual bill/rent tracking, reminders, records, issue intake, shared context, and household history.

The first useful moment should be one of these:

- A resident adds rent, utilities, internet, or insurance and immediately sees what is due.
- A resident saves a lease, policy, receipt, warranty, or manual and knows where proof lives.
- A resident logs a home issue and gets a next step or reminder.
- A household sees one clear attention item and handles it.

The monthly return habit should be: open Nestify, see what is due, what changed, what needs attention, what was handled, and what to do next.

## 2. Core Household Moments

| Moment | User Problem | Current Support | Future Roadmap Support | Primary Module | Key CTA | Dashboard Signal |
| --- | --- | --- | --- | --- | --- | --- |
| Something is due | Bills, rent, renewals, reminders, and tasks are easy to miss. | Bills, due dates, maintenance tasks, provider sync, attention queue. | Shared bills, rental tools, payments, household budget. | Dashboard, Bills, Care | I paid this, View bill, Add reminder | Due soon, overdue, renewal soon, task due |
| Something changed | Residents rarely notice cost or usage changes until later. | Bill intelligence events, amount changes, usage changes where available. | Shared cost trends, budget alerts, rent/renewal changes. | Dashboard, Bills | Review change, Mark reviewed | What Changed |
| Something broke | People do not know what to try, who to call, or how to track the issue. | Basic assistant/repair issue logging and projects. | AI Home Assistant, photo upload, marketplace connection. | Assistant, Care | Describe issue, Create task | New issue, repair follow-up |
| I need proof | Records are scattered across email, portals, drawers, and texts. | Vault, documents, bill PDFs, inventory. | Better upload, categorization, renewal alerts, shared access. | Vault | Add record, View record | Recent records, renewal warnings |
| We need to coordinate | Partners, roommates, and families lose track of who handles what. | Tasks and reminders partially support this. | Roommate tools, shared responsibilities, shared budget. | Care, Bills | Assign/track later, Add reminder now | Shared responsibility due |
| I need to plan/pay | Big household decisions need scenario planning and payment flow. | Bills and projects give early cost context. | Mortgage calculator, payments, rewards, marketplace. | Bills, Place, future Plan/Pay surfaces | Compare scenario, Pay, Book service later | Planning prompt only when relevant |

## 3. Product Pillars

### A. Household Summary

Purpose: The monthly command center for the place the user lives.

User value: One place to know what needs attention, what is due, what changed, and what was recently handled.

Core objects: attention items, bill events, bills, reminders, provider health, records, activity.

Primary actions: I paid this, Review change, Choose provider, Connect provider, Mark complete, Open record.

Secondary actions: snooze, dismiss, mark reviewed, open related page.

Now: Dashboard, attention queue, recent activity, provider health, coming up.

Later: shared household summary, AI-generated monthly recap, household member responsibility views.

Dashboard feed: This pillar is the Dashboard. It should stay focused on status and next best action.

### B. Bills & Shared Costs

Purpose: Manage rent, bills, utilities, insurance, due dates, amount changes, and future shared costs.

User value: Residents can avoid missed due dates and understand recurring household costs even when sync is unavailable.

Core objects: bill, rent item, provider, bill event, payment/review state, shared cost participant later.

Primary actions: Add bill, Connect provider, I paid this, Add due date, Review change.

Secondary actions: Add PDF, mark reviewed, snooze, dismiss.

Now: Bills, manual fallback, provider sync, due-date intelligence, bill changes.

Later: shared budget tools, roommate splits, payments, rent-specific workflows.

Dashboard feed: due soon, overdue, changed bill, missing due date, monthly known cost.

### C. Vault

Purpose: Store proof and records for the place the user lives.

User value: Lease, insurance, warranties, receipts, manuals, PDFs, invoices, and appliance documents become easy to find.

Core objects: document, category, file metadata, provider PDF, inventory item, warranty/renewal date.

Primary actions: Add record, Add file, View record.

Secondary actions: add renewal date, mark reviewed, snooze renewal warning.

Now: document records, bill PDFs, inventory linkage.

Later: better file upload, OCR/categorization, household sharing, renewal intelligence.

Dashboard feed: recent records, missing proof prompts, renewal warnings.

### D. Care & Tasks

Purpose: Help residents keep up with recurring chores, upkeep, repairs, projects, and household follow-ups.

User value: The household does not have to remember every filter, alarm check, repair issue, or seasonal task.

Core objects: task, reminder, repair issue, project, service provider, assignment later.

Primary actions: Add reminder, Mark complete, Describe issue, Create task.

Secondary actions: snooze, skip, not relevant, open project.

Now: maintenance tasks, starter reminders, projects, repair issue logging.

Later: roommate/household assignment, landlord/property manager issue tracking, marketplace handoff.

Dashboard feed: task due, repair follow-up, project due, unresolved issue.

### E. Help / Assistant

Purpose: Guided help for common home issues.

User value: A resident can describe what is wrong and get safe next steps without needing to know the right technical terms.

Core objects: issue, photo, likely cause, recommendation, escalation path, related task/project.

Primary actions: Describe issue, Upload photo, Create task, Save issue.

Secondary actions: call landlord/professional, add note, mark resolved.

Now: basic issue capture and triage notes.

Later: AI Home Assistant, photo intake, marketplace referrals, richer safety guidance.

Dashboard feed: unresolved issue, suggested next step, repair follow-up.

This should not start as a generic chat surface. It should start as guided issue intake with structured outcomes.

### F. Providers & Services

Purpose: Manage the sources and services connected to household bills, documents, and support.

User value: Provider connections reduce manual entry, but service/provider records are still useful when sync is unavailable.

Core objects: provider, provider category, actual provider name, connection state, service provider, landlord/property manager later.

Primary actions: Choose provider, Connect provider, Retry sync, Reconnect, Add service contact.

Secondary actions: disconnect, snooze setup, dismiss, view details.

Now: utility/internet/insurance/property tax providers, Deck sync, provider health.

Later: landlord/property manager contact, service providers, marketplace.

Dashboard feed: provider setup needed, sync failed, missing expected bill, connected count.

### G. Place Profile

Purpose: Store context about where the user lives.

User value: The app becomes more relevant when it understands the place type, occupancy context, systems, appliances, records, and history.

Core objects: place profile, address/unit, occupancy type, systems, appliances, inventory, timeline.

Primary actions: Update place details, Add system/item, Review timeline.

Secondary actions: add document, add provider, add task.

Now: home profile, inventory, timeline.

Later: renter/owner/roommate-specific profile, lease dates, landlord contact, shared household members.

Dashboard feed: place context, system reminders, recent history, profile gaps.

## 4. Roadmap Sorting

| Item | Bucket | Why | Dependency | Risk | Sync-Independent Value | Audience | Core Fit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Main Dashboard Redesign | Current beta core | The dashboard is the product entry point and must express the promise. | Product operating model, action queue, bill/task/record data. | High if it becomes generic cards again. | Yes | Renters and owners | Strengthens core |
| AI Home Assistant | Near-term enhancement | “Something broke” is a universal household moment. | Structured issue intake, safety copy, repair issue model. | High if launched as vague chat. | Yes | Renters and owners | Strengthens core if guided |
| Rental Tools | Near-term enhancement | Renters must be first-class; lease/rent/landlord workflows broaden product meaning. | Place profile occupancy context, Vault lease records, Bills/rent model. | Medium scope creep. | Yes | Renters | Strengthens core |
| Shared Home Budget Tools | Phase 2 | Useful once bills/rent are reliable and shared household model exists. | Household members, shared costs, bill categories. | High if it turns Nestify into a generic budgeting app. | Yes | Renters, couples, roommates, families, owners | Strengthens if limited to household costs |
| Roommate Management Tools | Phase 2 | Coordination is a core household moment, but needs identity/permissions. | Household membership, assignment model, shared bills/tasks. | High social complexity. | Yes | Renters, roommates, families | Strengthens if scoped |
| Payments Integration | Phase 2 | Useful after bill/rent/shared cost workflows are trusted. | Payment provider, compliance, bill states, shared costs. | Very high trust/compliance risk. | Yes, but only after core actions work. | Renters and owners | Strengthens later, distracts now |
| Mortgage Scenario Calculator | Expansion track | Ownership-specific planning tool, not universal household management. | Owner profile, property finance assumptions. | Medium; can distract from universal promise. | Yes for owners only | Homeowners | Adjacent, not core beta |
| Local Handyman Marketplace | Expansion track | Natural extension from issues/projects, but supply-side marketplace is a different business. | Assistant, issue classification, service provider model, trust/safety. | Very high operational risk. | Yes | Renters and owners, different paths | Later extension |
| Home Rewards Program | Do not build yet | Unclear relationship to household command center until core habits exist. | Payments/marketplace/partner strategy. | High distraction, low trust if premature. | Maybe | Unclear | Distracts now |
| Landing Page Header & Navigation | Current beta core | Needed for acquisition and product clarity, but not app functionality. | Positioning and IA. | Low. | Yes | All users | Supports adoption |
| Trust & Social Proof Section | Current beta core | Needed because bills, records, and provider access are sensitive. | Positioning, privacy language, proof points. | Medium if overclaimed. | Yes | All users | Supports trust |
| Landing Page Footer | Current beta core | Basic release-quality surface. | Positioning, legal/privacy links. | Low. | Yes | All users | Hygiene |

## 5. Final Information Architecture

Recommended app navigation:

1. Dashboard
2. Bills
3. Vault
4. Care
5. Assistant
6. Providers
7. Place

“Care” is better than “Maintenance” because it supports renters, chores, reminders, repairs, and projects. “Place” is more inclusive than “Home” when the user may rent, share, or live in a unit they do not own. “Home” is warmer, but “Place” is clearer for the profile/context surface. A final product copy decision could use “Place” in navigation and “home” naturally in body copy.

| Nav Item | Why It Exists | User Job | Primary CTA | Secondary CTAs | Never Show | Dashboard Connection |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Command center | Know what needs attention now | State-based next action | Open related area, view all attention | Raw tables, setup admin, history as warnings | Source of monthly status |
| Bills | Costs and due dates | Track rent/bills and changes | Add bill or I paid this | Connect provider, add due date, review change | Generic budgeting unrelated to household costs | Due, changed, monthly cost |
| Vault | Proof and records | Find important documents | Add record | Add file, view record, add renewal date | Random upload-only page | Recent records, renewal warnings |
| Care | Tasks and repairs | Keep up with chores/issues | Add reminder or describe issue | Complete, snooze, skip, open project | Owner-only maintenance assumptions | Tasks due, repair follow-up |
| Assistant | Guided issue help | Figure out what to do when something breaks | Describe issue | Upload photo, create task/project | Generic open-ended AI chat as primary experience | Issues and next steps |
| Providers | Automation/source layer | Connect or record bill/service sources | Choose/connect/retry | Disconnect, view details | Raw Deck/system internals above fold | Provider health, sync status |
| Place | Context and history | Manage where you live | Update place details | Add system/item, open timeline | Mortgage-only or owner-only assumptions | Context, systems, timeline |

## 6. Page-By-Page Meaning Audit

### Dashboard

Purpose: The household command center.

It should answer what needs attention, what is due, what changed, what to do next, and what was recently handled. It should not become a grid of random cards. The order should be: status hero, Needs Attention, What Changed, Coming Up, Bills snapshot, Provider health, Home records, Recent Activity.

### Bills

Purpose: Bills, rent, utilities, due dates, amount changes, manual fallback, provider sync, and future shared costs.

Manual bills must be first-class because provider sync may be slow, incomplete, or unavailable. The page should group bills by Needs review, Due soon, Upcoming, and Paid/handled. Provider sync should be framed as automation, not as the only way to use Nestify.

### Vault

Purpose: Important proof and records for the place the user lives.

It must support renters and owners: lease, insurance, receipts, warranties, manuals, bill PDFs, property tax where applicable, appliance records, and contractor invoices. It should feel like home memory, not a random upload form.

### Care

Purpose: Maintenance, chores, recurring reminders, repairs, and projects.

It must support renters and owners: chores, recurring upkeep, filter reminders, smoke alarm checks, repair follow-ups, issue tracking, and landlord/property manager workflows later. “Care” should include projects contextually rather than making projects a disconnected primary experience.

### Assistant

Purpose: Guided home issue help.

Initial version should be structured intake: describe issue, upload photo later, likely causes, safe next steps, what to try, when to call landlord/professional, and optionally create a task/project. It should not be presented as a magical chatbot.

### Providers

Purpose: Automation/source layer.

It should include utilities, internet, insurance, landlord/property manager if renter, services, and supported sync connections. Providers should improve automation but not be required for core product value.

### Place / Home

Purpose: Profile for the place the user lives.

It should include address/unit, renter/owner/roommate context, systems/appliances, inventory, and timeline. Avoid ownership-only language unless the user identifies as an owner.

## 7. Non-Sync Value Model

Nestify provides value without provider sync through:

- Manual bill/rent due dates.
- Shared bill tracking later.
- Document Vault for leases, policies, warranties, receipts, manuals, PDFs, and invoices.
- Maintenance, chore, and renewal reminders.
- Guided issue intake.
- Repair/project tracking.
- Place systems and inventory.
- Monthly household summary.
- Activity/history.

Provider sync adds:

- Fewer manual entries.
- Automatic bills.
- PDFs captured from portals.
- Usage data where available.
- Due dates.
- Amount changes.
- Connection health.

The product should never imply “sync failed” means “Nestify failed.” Sync should be positioned as a convenience layer on top of a useful household operating system.

## 8. Final Recommendation

### Rebuild First

Rebuild the Dashboard around household moments, not provider sync. It should begin with the household status, then open action queue, what changed, coming up, bills snapshot, provider health, records, and recent activity.

Next, rebuild Bills as a renter/owner-neutral cost and due-date system. Add rent as a first-class bill type, and keep manual bills prominent enough to prove non-sync value.

### Keep

- Bill intelligence events and attention resolution model.
- Provider adapter approach.
- Vault and Care as supporting pillars.
- Place profile and timeline as context/history.
- Manual bill entry as a real workflow.

### Rename

- “Maintenance” -> “Care”.
- “Home” profile -> “Place” or “Place profile”.
- “Documents” route can remain technically, but product copy should use “Vault”.
- “Assistant” should be “Ask Nestify” or “Home issue help” depending on final tone.

### Hide Until Useful

- Projects as a primary nav item.
- Inventory as a primary nav item.
- Timeline as a primary nav item.
- Raw sync metadata and technical provider statuses.
- Any AI-chat framing until issue intake produces structured useful outcomes.

### Keep Roadmap-Only For Now

- Payments.
- Home rewards.
- Marketplace.
- Mortgage calculator.
- Roommate management beyond basic shared visibility.
- Full shared budgeting.

### Remove Or Merge

- Merge Projects into Care.
- Merge Inventory and Timeline into Place/Vault.
- Keep Providers as automation/source setup, not the core dashboard story.
- Avoid any duplicate alert or insight system outside the action queue.

### Acceptance Criteria For Next Implementation Sprint

- A renter can use Nestify without connecting a provider.
- A homeowner can connect providers but still manually fill gaps.
- Dashboard clearly shows what is due, what changed, what needs attention, and what to do next.
- Bills supports rent, utilities, internet, insurance, and manual fallback.
- Vault supports lease/policy/warranty/receipt/manual/PDF records.
- Care supports chores, reminders, repairs, and projects.
- Assistant starts as guided issue intake, not generic chat.
- Navigation language does not assume ownership.
- Provider sync is useful but not required for the first useful moment.

# Full Product Reset Audit

## 1. Routes / Pages Discovered

- `/`: marketing/entry page.
- `/login`, `/signup`, `/signup/check-email`, `/auth/callback`: authentication and email confirmation.
- `/app`: Dashboard.
- `/app/bills`: Bills and manual bill entry.
- `/app/documents`: Vault records.
- `/app/maintenance`: Care tasks/reminders and project context.
- `/app/help`: guided household issue intake and issue history.
- `/app/providers`: optional provider automation setup.
- `/app/providers/[id]`: provider details, Deck connection, sync, disconnect.
- `/app/settings`: Home/place profile.
- `/app/onboarding`: first-time home/setup flow.
- `/app/attention`: supporting attention/action management.
- `/app/inventory`, `/app/projects`, `/app/timeline`: supporting surfaces that should stay contextual, not primary nav.
- `/app/assistant`: redirects to Help.
- `/api/deck/*`: Deck adapter endpoints.

## 2. Core Components Discovered

- App shell/nav: `app-nav.tsx`, `nav-items.ts`.
- Product primitives: `design-system.tsx`, `status-badge.tsx`, `empty-state.tsx`, `page-header.tsx`, `stat-card.tsx`.
- Action UX: `action-feedback-toast.tsx`, `attention-action-menu.tsx`, `start-setup-dialog.tsx`, `open-details-on-hash.tsx`.
- Forms/workflows: `submit-button.tsx`, `home-onboarding-form.tsx`, `signup-form.tsx`, `provider-setup-card.tsx`, `guided-issue-check.tsx`.
- Provider integration: Deck action button, credential form, interaction form.

## 3. Data Models / Tables Discovered

- Core: `homes`, `providers`, `bills`, `documents`, `maintenance_tasks`, `repair_issues`.
- Operating history: `timeline_events`, `attention_resolutions`, `bill_events`, `sync_events`, `insights`.
- Supporting: `inventory_items`, `projects`, `project_expenses`, `service_providers`, `reminders`, `monthly_summaries`, `provider_categories`.

## 4. User Workflows Discovered

- First-time setup: signup -> home onboarding -> setup plan.
- Add bill: Bills form -> `createManualBill` -> bill intelligence -> activity -> Dashboard.
- Mark bill paid: bill row/dashboard action -> `markBillPaid` -> handled events -> activity.
- Add document: Vault form -> `createDocumentRecord` -> activity -> Dashboard.
- Add reminder: Care form -> `createMaintenanceTask` -> activity -> Dashboard.
- Complete task: Care/dashboard action -> `completeMaintenanceTask` -> activity.
- Start issue check: Help guided flow -> safe next steps.
- Save issue: Help -> `createRepairIssue` -> activity -> Dashboard if urgent/high.
- Create Care task from issue: Help -> `createCareTaskFromIssue` -> linked Care task.
- Add provider: Providers -> `addProvider` -> activity.
- Connect/mock sync provider: API routes/sync engine -> provider status, bills/PDFs, activity.

## 5. Broken Workflows

- Dashboard still had a missing-due-date next action path even after Add Bill was tightened.
- Vault server schema allowed missing category even though the product requires category for records.
- Care server schema allowed missing category even though the product requires type/category.
- Dashboard Coming Up included project placeholders, which conflicts with the primary core loop and can feel random.
- Supporting pages such as Inventory/Projects/Timeline exist as direct routes but are not primary product jobs.

## 6. Redundant Workflows

- Dashboard, Bills, and bill intelligence could all surface missing due date repair paths.
- Care page promoted Projects as a secondary CTA despite Projects being contextual support.
- Vault promoted Inventory as a large action card even though Inventory should be contextual, not a separate primary job.
- Dashboard setup CTAs can appear in hero, Next Best Action, and This Month unless state rules are strict.

## 7. Confusing Screens

- Dashboard still used “Household command center” as page title while the hero also explained status; the page job should be “what matters now.”
- Bills had both Add bill and Connect provider in the header; Add bill should dominate because manual workflows are first-class.
- Providers can still feel like setup is required, even though it is optional automation.
- Vault category cards are useful, but “Linked” for inventory is unclear.

## 8. Dead-End Screens

- `/app/inventory`, `/app/projects`, and `/app/timeline` are useful supporting routes but should not be positioned as primary journeys.
- “Add PDF” from bill rows routes to Vault but does not attach a PDF to that bill; it should remain secondary and not be presented as direct upload.
- Project follow-ups in Dashboard can route to Projects, but Projects is not part of the primary app nav.

## 9. Repeated CTAs

- Add bill can appear in Dashboard setup, Dashboard next best action, This Month setup link, and Bills header.
- Add document can appear in Dashboard setup, This Month setup link, and Vault header.
- Add reminder can appear in Dashboard setup, This Month setup link, and Care header.
- Provider connection can appear as optional note, setup card, bill fallback, and Providers header.

## 10. Repeated Copy

- “Not started yet” appears in all This Month pillars; acceptable as quiet copy, but it should not pair with repeated primary buttons.
- “Connect provider” copy repeats across pages; it should consistently say optional automation.
- “Household command center” appears as brand/page framing; more specific page jobs are clearer.

## 11. Data Validation Gaps

- Bill creation was tightened previously to require title/category/amount/due date.
- Document creation still needs category required at server level.
- Care task creation still needs category required at server level.
- Provider creation correctly requires category and provider name.
- Issue creation correctly requires title/category/location/urgency/description.
- Legacy invalid bills need incomplete handling rather than Dashboard spam.

## 12. Dashboard Logic Issues

- Dashboard logic is partially centralized but still builds Coming Up and summary inline.
- Missing due date still existed as a next action path.
- Project rows were included in Coming Up, which expands Dashboard beyond the core beta loop.
- Hero uses the top action item; Things to Handle now skips that top item, which reduces duplication.
- Recent Activity is centralized and allowlisted.

## 13. Navigation / IA Issues

- Primary nav matches the target IA: Dashboard, Bills, Vault, Care, Help, Providers, Home.
- Supporting routes remain reachable from contextual links.
- “Home” maps to `/app/settings`; route name is technical but nav label is correct.
- Assistant route redirects to Help, which is correct.

## 14. UI Consistency Issues

- Most pages use shared product primitives.
- Some pages still contain custom card clusters and nested action cards.
- Some secondary actions are too visually prominent.
- Badge usage is still high on Bills and Help rows.
- The design system has primitives, but Dashboard still has large inline logic and custom metric rendering.

## 15. Mobile / Responsive Issues

- Mobile nav uses a sheet and is usable in structure.
- Forms are mostly grid-based and stack on mobile.
- Bill row actions can become crowded because row action contains primary, PDF, and overflow actions together.
- Dashboard metric rail stacks, but empty-state/action repetition should remain controlled.

## 16. Accessibility Issues

- Forms generally have labels.
- Icon buttons in nav have accessible labels.
- Some details/summary sections may need clearer labels over time.
- Status badges rely on text, not color alone.
- Toast and redirect notices are visible but should continue to be short and non-sticky.

## 17. Edge Cases Currently Mishandled

- Legacy bill missing amount/date: must remain Bills -> Incomplete and not Dashboard.
- Task without due date: should stay in Care only.
- Document without expiry: should stay Vault only.
- Issue with linked task: should not duplicate issue and Care task.
- Paid bill with past date: should never be active.
- Provider added manually: should not create Dashboard warning.
- Provider sync failure: only useful if connected and tied to real value.

## 18. Highest-Impact Fixes For This Sprint

1. Remove missing-due-date as Dashboard next action.
2. Create `upcoming` and `summary` helpers so Dashboard consumes normalized state.
3. Keep Dashboard Coming Up to core loops: bills, Care, Vault renewals.
4. Require document category server-side.
5. Require Care task category server-side.
6. Reduce secondary route prominence from Vault/Care.
7. Update Dashboard copy to the product narrative: what matters now.
8. Add full QA document and run lint/build.

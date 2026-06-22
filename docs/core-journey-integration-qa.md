# Core Journey Integration QA

## Scope

This sprint connected the main product loops across Dashboard, Bills, Vault, Care, Help, and Providers without adding a new product area.

The primary changes were:

- Added a shared activity model in `src/lib/product/activity.ts`.
- Added a shared action queue model in `src/lib/product/action-queue.ts`.
- Updated Dashboard to use those shared helpers for Recent Activity and Things to Handle.
- Made manual bills visible in Dashboard action logic even when generated bill events are unavailable.
- Kept provider setup from spamming Dashboard; provider items only appear when they are tied to real value, such as a missing expected bill for an already connected provider.

## Automated Checks

Passed:

- `npm run lint`
- `npm run build`

## Product Loops To Test Manually

### Bill Journey

1. Open Bills.
2. Add a manual bill with an amount and due date.
3. Confirm it appears in Bills.
4. Confirm Dashboard This Month updates.
5. If the bill is due within 14 days, confirm it appears in Coming Up and Things to Handle.
6. Mark the bill paid.
7. Confirm the active dashboard item clears.
8. Confirm Recent Activity shows `Bill marked paid`.

### Document Journey

1. Open Vault.
2. Add a document.
3. Confirm it appears in Vault.
4. Confirm Dashboard Vault count updates.
5. Confirm Recent Activity shows `Document saved`.
6. If an expiry/renewal date is within range, confirm it appears in Dashboard Coming Up or Things to Handle.

### Care Journey

1. Open Care.
2. Add a reminder with a due date.
3. Confirm it appears in Care.
4. Confirm Dashboard Coming Up updates.
5. If due soon or overdue, confirm it appears in Things to Handle.
6. Complete the task.
7. Confirm the active dashboard item clears.
8. Confirm Recent Activity shows `Task completed`.

### Help Journey

1. Open Help.
2. Save an issue.
3. Confirm it appears in Help.
4. Confirm Dashboard only shows it if it is urgent/high or needs a follow-up.
5. Create a Care task from the issue.
6. Confirm the task appears in Care.
7. Resolve the issue.
8. Confirm Dashboard clears the unresolved issue.
9. Confirm Recent Activity shows `Issue saved`, `Issue follow-up created`, or `Issue resolved` as relevant.

### Provider Journey

1. Open Providers.
2. Add a provider manually.
3. Confirm it appears in Providers.
4. Confirm Dashboard does not show generic provider setup spam.
5. Connect or mock sync a supported provider.
6. Confirm provider status updates and Dashboard only shows provider issues when they affect real bill/document value.

## What Passed In Code Review

- Recent Activity is now allowlisted and deduped in one helper.
- Things to Handle is now generated from bills, documents, care tasks, urgent issues, bill events, and connected-provider missing-bill states in one helper.
- Dashboard hides empty operational sections for brand-new users.
- Due/overdue manual bills can now generate active Dashboard action items directly from bill data.
- Activity remains historical and does not include raw technical events or action queue items.

## Remaining Limitations

- Manual browser QA was not run in this pass.
- Provider connected activity depends on provider sync/connect flows creating the correct timeline event.
- Document renewal logic currently uses `expires_on`; documents without that date are intentionally not shown in Coming Up.
- Bill change review still depends on the bill intelligence event table and generated `bill_events`.

## Database Notes

No new schema changes were added in this sprint.

If Dashboard attention actions are unavailable, run:

`supabase/migrations/202606180001_attention_resolution_system.sql`

If bill intelligence events are unavailable, run:

`supabase/migrations/202606180002_bill_intelligence_events.sql`

If Help issue fields are unavailable, run:

`supabase/migrations/202606200001_guided_issue_help.sql`

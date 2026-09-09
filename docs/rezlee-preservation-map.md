# Rezlee feature preservation map

Baseline commit: 26e2532a9fb0b98763678235a6803aa997eaae02

All original routes, action exports, tables, migrations, and integration identifiers are compatibility contracts. No functional feature is approved for removal.

## Original routes

- `src/app/api/ai/diagnose/route.ts` — preserve route and underlying capability.
- `src/app/api/ai/maintenance-plan/route.ts` — preserve route and underlying capability.
- `src/app/api/ai/scan/route.ts` — preserve route and underlying capability.
- `src/app/api/assistant/conversations/route.ts` — preserve route and underlying capability.
- `src/app/api/assistant/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/create-connection/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/create-credential/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/disconnect-provider/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/scheduled-sync/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/submit-interaction/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/sync-provider/route.ts` — preserve route and underlying capability.
- `src/app/api/deck/webhook/route.ts` — preserve route and underlying capability.
- `src/app/app/appliances/page.tsx` — preserve route and underlying capability.
- `src/app/app/assistant/page.tsx` — preserve route and underlying capability.
- `src/app/app/attention/page.tsx` — preserve route and underlying capability.
- `src/app/app/bills/page.tsx` — preserve route and underlying capability.
- `src/app/app/documents/page.tsx` — preserve route and underlying capability.
- `src/app/app/help/page.tsx` — preserve route and underlying capability.
- `src/app/app/home/page.tsx` — preserve route and underlying capability.
- `src/app/app/inventory/page.tsx` — preserve route and underlying capability.
- `src/app/app/maintenance/page.tsx` — preserve route and underlying capability.
- `src/app/app/onboarding/page.tsx` — preserve route and underlying capability.
- `src/app/app/page.tsx` — preserve route and underlying capability.
- `src/app/app/projects/page.tsx` — preserve route and underlying capability.
- `src/app/app/providers/[id]/page.tsx` — preserve route and underlying capability.
- `src/app/app/providers/page.tsx` — preserve route and underlying capability.
- `src/app/app/repairs/page.tsx` — preserve route and underlying capability.
- `src/app/app/settings/page.tsx` — preserve route and underlying capability.
- `src/app/app/timeline/page.tsx` — preserve route and underlying capability.
- `src/app/app/warranties/page.tsx` — preserve route and underlying capability.
- `src/app/appliances/page.tsx` — preserve route and underlying capability.
- `src/app/assistant/page.tsx` — preserve route and underlying capability.
- `src/app/auth/callback/route.ts` — preserve route and underlying capability.
- `src/app/bills/page.tsx` — preserve route and underlying capability.
- `src/app/dashboard/page.tsx` — preserve route and underlying capability.
- `src/app/documents/page.tsx` — preserve route and underlying capability.
- `src/app/forgot-password/page.tsx` — preserve route and underlying capability.
- `src/app/login/page.tsx` — preserve route and underlying capability.
- `src/app/maintenance/page.tsx` — preserve route and underlying capability.
- `src/app/page.tsx` — preserve route and underlying capability.
- `src/app/repairs/page.tsx` — preserve route and underlying capability.
- `src/app/reset-password/page.tsx` — preserve route and underlying capability.
- `src/app/settings/page.tsx` — preserve route and underlying capability.
- `src/app/signup/check-email/page.tsx` — preserve route and underlying capability.
- `src/app/signup/page.tsx` — preserve route and underlying capability.
- `src/app/warranties/page.tsx` — preserve route and underlying capability.

## Original server actions

- `login` — preserve backend contract.
- `signup` — preserve backend contract.
- `signInWithGoogle` — preserve backend contract.
- `requestPasswordReset` — preserve backend contract.
- `resetPassword` — preserve backend contract.
- `createHome` — preserve backend contract.
- `updateHome` — preserve backend contract.
- `addProvider` — preserve backend contract.
- `updateProviderName` — preserve backend contract.
- `updateProviderSyncPreference` — preserve backend contract.
- `deleteProvider` — preserve backend contract.
- `updateProviderConnectionState` — preserve backend contract.
- `createManualBill` — preserve backend contract.
- `resolveAttentionItem` — preserve backend contract.
- `markBillPaid` — preserve backend contract.
- `markBillReviewed` — preserve backend contract.
- `updateBillDueDate` — preserve backend contract.
- `deleteManualBill` — preserve backend contract.
- `completeMaintenanceTask` — preserve backend contract.
- `deleteMaintenanceTask` — preserve backend contract.
- `skipStarterTask` — preserve backend contract.
- `createMaintenanceTask` — preserve backend contract.
- `createMaintenanceTasksFromPlan` — preserve backend contract.
- `createDocumentRecord` — preserve backend contract.
- `deleteDocumentRecord` — preserve backend contract.
- `createInventoryItem` — preserve backend contract.
- `deleteInventoryItem` — preserve backend contract.
- `createProject` — preserve backend contract.
- `deleteProject` — preserve backend contract.
- `createRepairIssue` — preserve backend contract.
- `createIssueFollowUpTask` — preserve backend contract.
- `createCareTaskFromIssue` — preserve backend contract.
- `resolveRepairIssue` — preserve backend contract.
- `deleteRepairIssue` — preserve backend contract.
- `addRepairIssueNote` — preserve backend contract.
- `logout` — preserve backend contract.

## Observed implementation gaps

- Dashboard state and action helpers exist but several are unused by the current rendering.
- Bills/Care/category filters are static labels; document search is read-only.
- Vault summary/download, inventory history/documents, and bill reminder controls lack handlers.
- Repairs and Projects share one implementation; Appliances and Inventory share one implementation. Preserve both paths.
- Assistant is a working chat with saved history, despite stale docs describing a redirect.
- Document creation stores metadata only; scanning extracts data but does not persist uploaded files. No private download endpoint currently exists.
- Recurrence is stored but completing a task does not create the next occurrence.
- Scheduled sync marks work due but does not execute a background worker.
- Scheduled endpoint fails open if CRON_SECRET is absent; webhook lacks sender authentication.
- No automated tests existed at baseline. Lint: 0 errors, 18 warnings.

# Receipt entry availability — 2026-10-10

## Finding and correction
The current Vault hid its entire Add menu when there were no saved documents/items. Its empty-state Add a record opened only a single record, making Several receipts unreachable. An availability request failure also silently hid the batch entry. Draft lookup and availability were unnecessarily coupled.

Changed only apps/mobile/app/(tabs)/vault.tsx: keep Add available for empty and populated Vaults, independently read draft and capability state, distinguish unknown capability from explicitly disabled. Unknown/failed availability leaves the entry accessible; receipt-batch still rechecks server capability and prevents uploads/saves until allowed. An explicit disabled flag continues to hide new-batch entry; existing batch resume remains accessible. No backend flag bypass.

## What exists / where
- Vault → Add → Scan a receipt: single photo/file review and save.
- Vault → Add → Several receipts: up to five files, read/review/save individually.
- Vault → Continue receipt batch: unfinished local batch recovery.
- Bills → Add → Upload statements: single/bulk historical bill statements.
- Saved originals: authenticated record/bill preview endpoints.

## Verified today
13 hosted staging assertions passed again: receipt batch enabled, receipt/bill save/replay, byte-identical original download, renamed receipt duplicate, statement duplicate, history and cross-user original isolation. Temporary fixture accounts/files cleaned up; no real customer data touched, no paid AI/provider calls, no emails.
12 actual Vault/toolbar/Add-sheet React Native Web interactions at 320/390 widths: empty, populated, capability failure, local draft failure, explicitly disabled and existing draft resume; scan and batch routes exercised. API/router/native boundaries and collection pager are controlled mocks. Mobile TypeScript and scoped lint passed. Visually inspected the rendered empty-Vault Add sheet at 390px; native icons and collection pager are mocked.
The previous receipt tests bypassed the parent Vault entry; their passing results did not verify discoverability in empty Vault. This correction addresses that gap.

## Availability / limits
Metro 8082 running from current mobile workspace, with process EXPO_PUBLIC_API_URL=https://staging.rezlee.com (overriding legacy local env). Reload development client for UI changes. No TestFlight build or submission occurred; cannot claim the user's installed binary contains this fix. Website unchanged. No physical iOS/Android camera or native navigation acceptance in this turn. No live AI extraction verified.

## Preservation / rollback
Preserved all collection routes, single receipt/record/item/warranty creation, existing empty-state direct action, receipts, originals, API capability gate, household permissions and integrations. Nothing removed; no dependencies/schema/backend changes. Previous HEAD d5e7ddd. Scoped before/after archives and patch in docs/checkpoints/receipt-entry-20261010. Verify hashes before restoring only the changed Vault file; unrelated dirty workspace remains untouched.

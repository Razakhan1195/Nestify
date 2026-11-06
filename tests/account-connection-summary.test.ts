import test from "node:test";
import assert from "node:assert/strict";
import { accountProviderSummary } from "../src/lib/providers/account-connection-summary";
const provider = { id: "provider", name: "Utility", display_name: null, connection_status: "connected", sync_status: "synced", sync_failure_reason: null, requires_user_action: false, last_successful_sync_at: "2026-10-16T00:00:00Z" };
test("manual records are not reported as connected accounts or failures", () => {
  assert.equal(accountProviderSummary({ ...provider, connection_status: "added_manual", requires_user_action: true }), null);
  assert.equal(accountProviderSummary({ ...provider, sync_status: "manual_bill_available" }), null);
});
test("deliberate disconnect differs from an expired provider login", () => {
  assert.equal(accountProviderSummary({ ...provider, connection_status: "disconnected", sync_status: "disconnected", requires_user_action: true })?.needsAttention, false);
  assert.equal(accountProviderSummary({ ...provider, connection_status: "disconnected", sync_status: "authentication_required" })?.status, "Reconnect needed");
  assert.equal(accountProviderSummary({ ...provider, connection_status: "sync_failed" })?.needsAttention, true);
  assert.equal(accountProviderSummary({ ...provider, connection_status: "connecting" })?.status, "Connecting or updating");
  assert.equal(accountProviderSummary({ ...provider, connection_status: "connecting", requires_user_action: true })?.needsAttention, true);
  assert.equal(accountProviderSummary(provider)?.status, "Connected");
});

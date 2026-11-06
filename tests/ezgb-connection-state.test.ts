import assert from "node:assert/strict";
import test from "node:test";
import { connectionState } from "../src/lib/ezgb/connection-state";
const now = Date.parse("2026-09-24T12:00:00Z");
const row = { status: "connected", last_sync_at: "2026-09-24T10:00:00Z", last_error: null, metadata: {} };
const job = { status: "running", created_at: "2026-09-24T11:00:00Z", expires_at: "2026-09-24T12:10:00Z", stats: {}, last_error: null };
test("disconnect takes priority over household jobs and retains reconnect action", () => {
  const result = connectionState({ ...row, status: "disconnected" }, job, now);
  assert.equal(result.state, "disconnected");
  assert.equal(result.action, "reconnect");
});
test("active refresh suppresses duplicate action; expired workers stop appearing active", () => {
  assert.equal(connectionState(row, job, now).action, null);
  assert.equal(connectionState(row, { ...job, expires_at: "2026-09-24T11:30:00Z" }, now).state, "waiting");
});
test("failed and partial jobs cannot be shown as connected success", () => {
  assert.equal(connectionState(row, { ...job, status: "failed" }, now).state, "failed");
  assert.equal(connectionState(row, { ...job, status: "waiting", stats: { errors: 1, integrationsConnected: 1 } }, now).state, "partial");
  assert.equal(connectionState({ ...row, status: "needs_attention" }, { ...job, status: "succeeded" }, now).state, "attention");
});
test("a newer successful refresh supersedes an old failed job", () => {
  assert.equal(connectionState(row, { ...job, status: "failed", created_at: "2026-09-23T10:00:00Z", finished_at: "2026-09-23T11:00:00Z" }, now).state, "ready");
});
test("fresh bills never imply fresh imported readings; stale checks are explicit", () => {
  const result = connectionState({ ...row, metadata: { interval_source: "ezgb_dashboard_export" } }, null, now);
  assert.equal(result.meterUpdates, "unavailable");
  assert.match(result.meterMessage, /separate/);
  assert.equal(connectionState({ ...row, last_sync_at: "2026-08-01T12:00:00Z" }, null, now).state, "stale");
});
test("missing last-success dates do not imply successful retrieval or expired consent", () => {
  const result = connectionState({ ...row, last_sync_at: null }, null, now);
  assert.equal(result.title, "Saved utility connection");
  assert.equal(result.action, "refresh");
});

test("one failed utility cannot overwrite another account's completed retrieval status",()=>{
 const partial={...job,status:"waiting",finished_at:"2026-09-24T11:10:00Z",stats:{errors:1,integrationsConnected:1}};
 const healthy={...row,last_sync_at:"2026-09-24T11:05:00Z"};
 assert.equal(connectionState(healthy,partial,now).state,"ready");
 assert.equal(connectionState({...row,status:"needs_attention",last_error:"Refresh failed"},partial,now).state,"partial");
});
test("monthly bill checks do not become stale after just two days",()=>{
 assert.equal(connectionState({...row,last_sync_at:"2026-09-01T12:00:00Z"},null,now).state,"ready");
});
test("malformed job expiry cannot leave a permanent refreshing spinner",()=>{
 assert.equal(connectionState(row,{...job,expires_at:"invalid"},now).state,"waiting");
});


test("historical downloads cannot renew a confirmed terminated authorization", () => {
  const ended = { ...row, external_authorization_id: "old-grant", metadata: {
    authorization_status_id: "old-grant", authorization_status: "terminated", authorization_status_source: "support_verified",
    interval_import_status: "needs_validation", interval_received_count: 17520,
  } };
  const result = connectionState(ended, null, now);
  assert.equal(result.state, "reauthorization_required");
  assert.equal(result.action, "reconnect");
  assert.equal(result.meterUpdates, "needs_validation");
  assert.match(result.meterMessage, /units and timing/);
  assert.equal(connectionState({ ...ended, external_authorization_id: "new-grant" }, null, now).authorizationStatus, "unknown");
});
test("an interval failure does not erase a completed bill check", () => {
  const result = connectionState({ ...row, metadata: { interval_import_status: "failed" } }, null, now);
  assert.equal(result.state, "ready");
  assert.equal(result.meterUpdates, "failed");
  assert.match(result.meterMessage, /Earlier saved readings/);
});

test("removed and other-utility attempts cannot change a saved account's status",()=>{
 const saved={...row,metadata:{utility:"Enbridge Gas"}};
 const alectra={...job,stats:{connection:{expectedUtility:"Alectra Utilities"}}};
 assert.equal(connectionState(saved,alectra,now).state,"ready");
 assert.equal(connectionState(saved,{...job,status:"waiting",stats:{cancelledAt:new Date(now).toISOString()}},now).state,"ready");
 assert.equal(connectionState(saved,{...job,stats:{connection:{expectedUtility:"Enbridge Gas"}}},now).state,"refreshing");
});

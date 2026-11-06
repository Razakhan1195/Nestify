import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
async function disconnectDeckV2Provider(input: Parameters<typeof import("../src/lib/sync/deck-v2-runtime").disconnectDeckV2Provider>[0]) { return (await import("../src/lib/sync/deck-v2-runtime")).disconnectDeckV2Provider(input); }
async function queueDeckProviderSync(input: Parameters<typeof import("../src/lib/sync/deck-v2-runtime").queueDeckProviderSync>[0]) { return (await import("../src/lib/sync/deck-v2-runtime")).queueDeckProviderSync(input); }
async function submitDeckProviderInteraction(input: Parameters<typeof import("../src/lib/sync/deck-v2-runtime").submitDeckProviderInteraction>[0]) { return (await import("../src/lib/sync/deck-v2-runtime")).submitDeckProviderInteraction(input); }

type FixtureProvider = { id: string; user_id: string; connection_status: string; deck_credential_id: string | null; deck_session_id: string | null; deck_connection_metadata: { sessionId: string | null; taskRunId: string | null; disconnectPending?: boolean }; requires_user_action?: boolean };

async function fixture(work: (f: {
 provider: FixtureProvider; requests: string[]; input: Parameters<typeof disconnectDeckV2Provider>[0];
 fail: (kind: string) => void; activeRun: () => void;
}) => Promise<void>) {
 const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SECRET_KEY: "fixture-admin", DECK_API_KEY: "fixture-deck", DECK_BASE_URL: "https://deck.example.invalid/v2", ACCOUNT_DELETION_ENABLED: "false" };
 const oldEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
 Object.assign(process.env, env);
 const userId = "00000000-0000-4000-8000-000000000001", providerId = "00000000-0000-4000-8000-000000000002";
 const provider: FixtureProvider = { id: providerId, user_id: userId, connection_status: "connected", deck_credential_id: "cred_fixture", deck_session_id: "sess_fixture", deck_connection_metadata: { sessionId: "sess_fixture", taskRunId: null } };
 let failure = "", deleted = false, ended = false, run = false;
 const requests: string[] = [];
 const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
 globalThis.fetch = async (resource, init) => {
  const request = new Request(resource, init), u = new URL(request.url), m = request.method;
  requests.push(m + " " + u.pathname);
  if (u.hostname === "db.example.invalid") {
   if (u.pathname === "/rest/v1/providers") {
    assert.equal(u.searchParams.get("user_id"), "eq." + userId);
    if (m === "GET") return json(provider);
    assert.equal(m, "PATCH");
    const patch = await request.json();
    if (failure === "save" && patch.deck_credential_id === null) { failure = ""; return json({ message: "write unavailable" }, 503); }
    Object.assign(provider, patch); return new Response(null, { status: 204 });
   }
   if (u.pathname === "/rest/v1/provider_sync_runs") return json(run ? [{ deck_task_run_id: "trun_fixture" }] : []);
   if (u.pathname === "/rest/v1/deck_telecom_imports") return m === "GET" ? json([]) : new Response(null, { status: 204 });
  }
  if (u.hostname === "deck.example.invalid") {
   assert.equal(provider.connection_status, "disconnected", "importing fenced before vendor calls");
   assert.equal(provider.deck_connection_metadata.disconnectPending, true);
   const credential = { id: "cred_fixture", external_id: failure === "foreign" ? "another:account" : userId + ":" + providerId, status: "verified" };
   if (u.pathname === "/v2/task-runs/trun_fixture") return json({ id: "trun_fixture", status: "running", credential_id: "cred_fixture", session_id: "sess_fixture" });
   if (u.pathname === "/v2/task-runs/trun_fixture/cancel") return json({ id: "trun_fixture", status: failure === "cancel" ? "running" : "canceled" });
   if (u.pathname === "/v2/sessions/sess_fixture") return json({ id: "sess_fixture", status: ended ? "completed" : "idle", task_runs: [{ credential_id: "cred_fixture" }] });
   if (u.pathname === "/v2/sessions/sess_fixture/end") { ended = true; return json({ id: "sess_fixture", status: "completed" }); }
   if (u.pathname === "/v2/credentials/cred_fixture") {
    if (m === "GET") return json(credential);
    assert.equal(m, "DELETE");
    if (failure === "vendor") { failure = ""; return json({ message: "temporarily unavailable" }, 503); }
    deleted = true; return new Response(null, { status: 204 });
   }
   if (u.pathname === "/v2/credentials") {
    assert.equal(u.searchParams.get("external_id"), userId + ":" + providerId);
    return json({ data: deleted ? [] : [credential], has_more: false });
   }
  }
  throw Error("Unexpected request: " + m + " " + u.href);
 };
 try {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await work({ provider, requests, input: { supabase, userId, providerId }, fail: value => { failure = value; }, activeRun: () => { run = true; } });
 } finally {
  globalThis.fetch = oldFetch;
  for (const [k, v] of Object.entries(oldEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
 }
}
test("disconnect ends the owned session, drains credentials and preserves saved records", async () => fixture(async f => {
 f.activeRun(); await disconnectDeckV2Provider(f.input);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, false);
 assert.equal(f.provider.deck_credential_id, null); assert.equal(f.provider.requires_user_action, false);
 assert.ok(f.requests.includes("POST /v2/sessions/sess_fixture/end"));
 assert.ok(f.requests.includes("POST /v2/task-runs/trun_fixture/cancel"));
 assert.ok(f.requests.every(r => !/bills|documents|\/task-runs$/.test(r)));
 const before = f.requests.length; await disconnectDeckV2Provider(f.input);
 assert.deepEqual(f.requests.slice(before), ["GET /rest/v1/providers"]);
}));
test("vendor failure keeps cleanup references and can resume after reopening", async () => fixture(async f => {
 f.fail("vendor"); await assert.rejects(disconnectDeckV2Provider(f.input), /not been confirmed/);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, true);
 assert.equal(f.provider.deck_credential_id, "cred_fixture");
 await assert.rejects(queueDeckProviderSync(f.input), /Finish disconnecting/);
 await assert.rejects(submitDeckProviderInteraction({ ...f.input, values: { code: "123456" } }), /connection is stopped/);
 await disconnectDeckV2Provider(f.input);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, false);
 assert.equal(f.requests.filter(r => r === "POST /v2/sessions/sess_fixture/end").length, 1);
}));
test("a lost final database save retries without deleting an unrelated credential or claiming success", async () => fixture(async f => {
 f.fail("save"); await assert.rejects(disconnectDeckV2Provider(f.input), /not been confirmed/);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, true);
 await disconnectDeckV2Provider(f.input);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, false);
 assert.equal(f.requests.filter(r => r === "DELETE /v2/credentials/cred_fixture").length, 1);
}));
test("a session belonging to another account is never ended or deleted", async () => fixture(async f => {
 f.fail("foreign"); await assert.rejects(disconnectDeckV2Provider(f.input), /not been confirmed/);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, true);
 assert.ok(!f.requests.some(r => r.startsWith("DELETE ") || r.endsWith("/end")));
}));
test("accepted cancellation remains pending until the vendor confirms a terminal state", async () => fixture(async f => {
 f.activeRun(); f.fail("cancel"); await assert.rejects(disconnectDeckV2Provider(f.input), /not been confirmed/);
 assert.equal(f.provider.deck_connection_metadata.disconnectPending, true);
 assert.ok(!f.requests.some(r => r.startsWith("DELETE ") || r.endsWith("/end")));
}));

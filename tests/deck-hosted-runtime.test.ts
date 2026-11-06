import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceHostedAuth } from "../src/lib/deck/hosted-auth";
import { ROGERS_REGISTRY_ID, ROGERS_SOURCE_ID, BELL_REGISTRY_ID, BELL_SOURCE_ID } from "../src/lib/deck/hosted-auth-policy";
import type { DeckV2Credential } from "../src/lib/deck/v2-client";
type Row = Record<string, unknown>;
Object.assign(process.env, { ACCOUNT_DELETION_ENABLED: "false", REZLEE_DECK_ROGERS_HOSTED_ENABLED: "true", REZLEE_DECK_BELL_HOSTED_ENABLED: "true", REZLEE_DECK_TELECOM_ENABLED: "true", REZLEE_DECK_TESTING_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://gjwvalpxnfbvryosmcbj.supabase.co", VERCEL_ENV: "preview", DECK_MOCK_MODE: "false" });
function fixture(bell = true) {
  const registryId = bell ? BELL_REGISTRY_ID : ROGERS_REGISTRY_ID, sourceId = bell ? BELL_SOURCE_ID : ROGERS_SOURCE_ID;
  const state: Record<string, Row[]> = {
    deck_hosted_auth_intents: [{ id: "intent", user_id: "u", home_id: "h", provider_id: "p", registry_id: registryId, source_id: sourceId, previous_credential_id: null, credential_id: null, existing_provider: true, status: "pending", expires_at: new Date(Date.now()+1800000).toISOString() }],
    providers: [{ id: "p", user_id: "u", home_id: "h", registry_provider_id: registryId, name: bell ? "Bell" : "Rogers", deck_credential_id: null, connection_status: "connecting", deck_connection_metadata: {} }],
    provider_registry: [{ id: registryId, name: bell ? "Bell" : "Rogers", utility_type: "Internet", deck_source_id: sourceId, deck_task_id: "task_latest", deck_agent_id: "agt_rogers", status: "needs_mapping", metadata: { deck_telecom_contract: "ca-telecom-20261004-v1", deck_telecom_history_task_id: "task_history" } }], account_deck_providers: [],
  };
  const credential: DeckV2Credential = { id: "cred_valid", external_id: "u:intent", source_id: sourceId, status: "unverified" };
  let queued = 0, changed = 0, lookups = 0; let requestedMonths: number | undefined;
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []; let values: Row | null = null; let singular = false; let insert = false;
    const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; }, or: () => { filters.push(r => !r.lease_until || Date.parse(String(r.lease_until)) < Date.now()); return q; }, update: (v: Row) => { values = v; return q; }, upsert: (v: Row) => { values = v; insert = true; return q; }, insert: (v: Row) => { values = v; insert = true; return q; }, maybeSingle: () => { singular = true; return q; }, single: () => { singular = true; return q; }, then: (resolve: (v: unknown) => unknown) => {
      const rows = state[table] ?? (state[table] = []); let matches = rows.filter(r => filters.every(f => f(r)));
      if (insert && values) { rows.push({ ...values }); matches = [rows.at(-1)!]; } else if (values) matches.forEach(r => Object.assign(r, values));
      return Promise.resolve({ data: structuredClone(singular ? matches[0] ?? null : matches), error: null }).then(resolve);
    } }; return q;
  };
  const db = { from } as unknown as SupabaseClient;
  const deck = { getCredential: async () => ({ ...credential }), listCredentials: async () => { lookups++; return { data: [{ ...credential }] }; }, updateCredentialExternalId: async (_id: string, external: string) => { changed++; credential.external_id = external; return { ...credential }; }, deleteCredential: async () => null };
  const startImport = async (input: {historyMonths?:number}) => { requestedMonths=input.historyMonths; queued++; return { ok: true, providerId: "p", status: "syncing", message: "queued" }; };
  return { requestedMonths:()=>requestedMonths, state, credential, queued: () => queued, changed: () => changed, lookups: () => lookups, step: (id?: string) => advanceHostedAuth("intent", id, { db, deck, startImport }) };
}
test("lost browser callback recovers by external ID; replay queues exactly once", async () => {
  const f = fixture(); await f.step(); await f.step();
  assert.equal(f.lookups(), 1); assert.equal(f.queued(), 1); assert.equal(f.changed(), 1);
  assert.equal(f.state.deck_hosted_auth_intents[0].status, "completed");
  assert.equal(f.credential.external_id, "u:p");
});
test("another user's credential and a different provider never attach or queue", async () => {
  for (const field of ["external_id", "source_id"] as const) {
    const f = fixture(); f.credential[field] = "other";
    await assert.rejects(f.step("cred_valid"));
    assert.equal(f.queued(), 0); assert.equal(f.changed(), 0); assert.equal(f.state.deck_hosted_auth_intents[0].credential_id, null);
  }
});
test("recovery resumes after external ID was canonicalized but before queuing", async () => {
  const f = fixture(); f.state.deck_hosted_auth_intents[0].credential_id = "cred_valid"; f.credential.external_id = "u:p";
  await f.step(); assert.equal(f.changed(), 0); assert.equal(f.queued(), 1);
});
test("cancellation wins over a late success and a parallel worker cannot claim twice", async () => {
  const f = fixture(); f.state.deck_hosted_auth_intents[0].status = "canceled"; await f.step("cred_valid"); assert.equal(f.queued(), 0);
  const concurrent = fixture(); await Promise.all([concurrent.step(), concurrent.step()]); assert.equal(concurrent.queued(), 1);
});

test("Bell recovers a lost callback and queues its own source exactly once", async () => {
  const f = fixture(true); await f.step(); await f.step("cred_valid");
  assert.equal(f.queued(), 1); assert.equal(f.changed(), 1);
  assert.equal(f.state.deck_hosted_auth_intents[0].status, "completed");
  assert.equal(f.credential.source_id, BELL_SOURCE_ID);
});
test("Bell and Rogers credentials cannot cross provider boundaries", async () => {
  for (const bell of [true, false]) {
    const f = fixture(bell); f.credential.source_id = bell ? ROGERS_SOURCE_ID : BELL_SOURCE_ID;
    await assert.rejects(f.step("cred_valid"));
    assert.equal(f.queued(), 0); assert.equal(f.changed(), 0);
    assert.equal(f.state.deck_hosted_auth_intents[0].credential_id, null);
  }
});
test("tampered intent source fails before credential lookup and releases its lease", async () => {
  const f = fixture(true); f.state.deck_hosted_auth_intents[0].source_id = ROGERS_SOURCE_ID;
  await assert.rejects(f.step()); assert.equal(f.lookups(), 0); assert.equal(f.queued(), 0);
  assert.equal(f.state.deck_hosted_auth_intents[0].lease_id, null);
});
test("Bell cannot borrow the Rogers feature flag", async () => {
  const previous = process.env.REZLEE_DECK_BELL_HOSTED_ENABLED;
  try {
    process.env.REZLEE_DECK_BELL_HOSTED_ENABLED = "false";
    const f = fixture(true); await assert.rejects(f.step()); assert.equal(f.lookups(), 0); assert.equal(f.queued(), 0);
  } finally { process.env.REZLEE_DECK_BELL_HOSTED_ENABLED = previous; }
});

test("hosted handoff uses the server-stored customer range",async()=>{for(const months of [1,3,6]){const f=fixture();f.state.deck_hosted_auth_intents[0].history_months=months;await f.step();assert.equal(f.requestedMonths(),months);}});

test("production-paused Rogers handoffs cancel without credentials, account changes or new runs", async () => {
  const previous=process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV="production";
    const f=fixture(false), before=structuredClone(f.state.providers); await f.step(); await f.step();
    assert.equal(f.state.deck_hosted_auth_intents[0].status,"canceled");
    assert.equal(f.state.deck_hosted_auth_intents[0].lease_id,null);
    assert.equal(f.queued(),0);assert.equal(f.lookups(),0);assert.equal(f.changed(),0);assert.deepEqual(f.state.providers,before);
  } finally {process.env.VERCEL_ENV=previous;}
});
test("authorized staging Rogers handoff queues once and retains its own source",async()=>{
  const f=fixture(false);await f.step();await f.step();assert.equal(f.queued(),1);
  assert.equal(f.credential.source_id,ROGERS_SOURCE_ID);assert.equal(f.state.deck_hosted_auth_intents[0].status,"completed");
});

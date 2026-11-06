import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { rogersHostedEnabled, hostedCredentialMatches, ROGERS_SOURCE_ID, ROGERS_REGISTRY_ID, BELL_REGISTRY_ID, hostedProviderEnabled, hostedClientCompatible } from "../src/lib/deck/hosted-auth-policy";
import { hostedMessage, isDeckAuthUrl, hostedInitScript, DECK_AUTH_ORIGIN } from "../apps/mobile/src/lib/deck-hosted-policy";

test("hosted pilot fails closed outside staging, mock mode, or disabled telecom", () => {
  const env = { REZLEE_DECK_ROGERS_HOSTED_ENABLED: "true", REZLEE_DECK_TELECOM_ENABLED: "true", REZLEE_DECK_TESTING_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://gjwvalpxnfbvryosmcbj.supabase.co", VERCEL_ENV: "preview" };
  assert.equal(rogersHostedEnabled(env), true);
  for (const patch of [{ VERCEL_ENV: "production" }, { NEXT_PUBLIC_SUPABASE_URL: "https://production.example" }, { DECK_MOCK_MODE: "true" }, { REZLEE_DECK_TELECOM_ENABLED: "false" }]) assert.equal(rogersHostedEnabled({ ...env, ...patch }), false);
});
test("credential references are bound to the server intent and Rogers source", () => {
  const c = { id: "cred_abcdef", source_id: ROGERS_SOURCE_ID, external_id: "user:intent", status: "unverified" };
  const expected = { sourceId: ROGERS_SOURCE_ID, externalId: "user:intent" };
  assert.equal(hostedCredentialMatches(c, expected), true);
  for (const patch of [{ external_id: "another:intent" }, { source_id: "src_another" }, { status: "invalid" }, { status: "deleted" }]) assert.equal(hostedCredentialMatches({ ...c, ...patch }, expected), false);
  assert.equal(hostedCredentialMatches(c, { ...expected, credentialId: "cred_other" }), false);
});
test("native bridge rejects off-origin, malformed and oversized results; secret config stays out of URLs", () => {
  for (const url of ["https://auth.components.deck.co.evil.test", "http://auth.components.deck.co", "https://auth.components.deck.co@evil.test", "javascript:alert(1)"]) assert.equal(isDeckAuthUrl(url), false);
  const raw = JSON.stringify({ type: "SUCCESS", payload: { credentialId: "cred_abcdef", externalId: "forged", verified: true } });
  assert.equal(hostedMessage(raw, "https://evil.test"), null);
  assert.deepEqual(hostedMessage(raw, DECK_AUTH_ORIGIN), { type: "SUCCESS", credentialId: "cred_abcdef" });
  assert.equal(hostedMessage('{"type":"SUCCESS","payload":{"credentialId":"../../bad"}}', DECK_AUTH_ORIGIN), null);
  assert.equal(hostedMessage("x".repeat(9000), DECK_AUTH_ORIGIN), null);
  const script = hostedInitScript({ status: "ready", registryProviderId: ROGERS_REGISTRY_ID, providerName: "Rogers", intentId: "intent", origin: DECK_AUTH_ORIGIN, token: "tk_test", sourceId: ROGERS_SOURCE_ID, externalId: "user:intent", expiresAt: new Date().toISOString() });
  assert.match(script, /window.postMessage/); assert.match(script, /"taskId":null/); assert.doesNotMatch(script, /\?token=|location\.|localStorage|sessionStorage/);
});
test("database handoff is private, exactly once, journaled for deletion, and loses to disconnect", async () => {
  const db = new PGlite(), u = "11111111-1111-4111-8111-111111111111", h = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", p = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", i = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  try {
    await db.exec("create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;");
    for (const f of ["supabase/schema.sql", ...(await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort().map(f => "supabase/migrations/" + f)]) await db.exec((await readFile(f, "utf8")).replace(/create extension if not exists "pgcrypto";/g, ""));
    await db.query("insert into auth.users values($1,'qa@example.invalid')", [u]);
    await db.query("insert into homes(id,user_id,nickname)values($1,$2,'Home')", [h, u]);
    await db.query("insert into providers(id,user_id,home_id,name,connection_status)values($1,$2,$3,'Rogers','connecting')", [p, u, h]);
    const registry = (await db.query<{id:string}>("select id from provider_registry limit 1")).rows[0].id;
    await db.query("insert into deck_hosted_auth_intents(id,user_id,home_id,registry_id,provider_id,source_id,credential_id)values($1,$2,$3,$4,$5,$6,'cred_test')", [i, u, h, registry, p, ROGERS_SOURCE_ID]);
    assert.equal((await db.query("select * from account_deck_providers where user_id=$1 and provider_id=$2", [u, i])).rows.length, 1);
    const job = (await db.query<{id:string}>("insert into deck_telecom_imports(user_id,home_id,provider_id,phases,since_date,until_date,hosted_auth_id)values($1,$2,$3,'[]','2025-10-04','2026-10-04',$4)returning id", [u, h, p, i])).rows[0].id;
    assert.equal((await db.query<{ok:boolean}>("select queue_rezlee_hosted_import($1,'cred_wrong',$2,'{}')as ok", [i, job])).rows[0].ok, false);
    assert.equal((await db.query<{ok:boolean}>("select queue_rezlee_hosted_import($1,'cred_test',$2,'{}')as ok", [i, job])).rows[0].ok, true);
    assert.equal((await db.query<{message:string}>("select message from deck_telecom_imports where id=$1", [job])).rows[0].message, "Checking your provider connection. Your bills will follow.");
    await assert.rejects(db.query("insert into deck_telecom_imports(user_id,home_id,provider_id,phases,since_date,until_date,hosted_auth_id)values($1,$2,$3,'[]','2025-10-04','2026-10-04',$4)", [u, h, p, i]));
    await db.query("update providers set connection_status='disconnected',deck_credential_id=null where id=$1", [p]);
    assert.equal((await db.query<{status:string}>("select status from deck_hosted_auth_intents where id=$1", [i])).rows[0].status, "canceled");
    assert.equal((await db.query<{ok:boolean}>("select queue_rezlee_hosted_import($1,'cred_test',$2,'{}')as ok", [i, job])).rows[0].ok, false);
    // A provider created during the handoff can be removed before completion.
    await db.query("update deck_hosted_auth_intents set status='pending' where id=$1", [i]);
    await db.query("delete from providers where id=$1", [p]);
    assert.equal((await db.query<{status:string}>("select status from deck_hosted_auth_intents where id=$1", [i])).rows[0].status, "canceled");
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from deck_hosted_auth_intents"));
    await assert.rejects(db.query("select queue_rezlee_hosted_import($1,'cred_test',$2,'{}')", [i, job]));
  } finally { await db.close(); }
});

test("Bell hosted sign-in requires its own flag and a provider-aware client", () => {
  const env = { REZLEE_DECK_BELL_HOSTED_ENABLED: "true", REZLEE_DECK_TELECOM_ENABLED: "true", REZLEE_DECK_TESTING_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://gjwvalpxnfbvryosmcbj.supabase.co", VERCEL_ENV: "preview" };
  assert.equal(hostedProviderEnabled(BELL_REGISTRY_ID, env), true);
  assert.equal(hostedProviderEnabled(ROGERS_REGISTRY_ID, env), false);
  assert.equal(hostedProviderEnabled("unknown", env), false);
  assert.equal(hostedClientCompatible(BELL_REGISTRY_ID, null, env), false);
  assert.equal(hostedClientCompatible(BELL_REGISTRY_ID, "1", env), false);
  assert.equal(hostedClientCompatible(BELL_REGISTRY_ID, "2", env), true);
  assert.equal(hostedClientCompatible(ROGERS_REGISTRY_ID, null, env), true);
  assert.equal(hostedProviderEnabled(BELL_REGISTRY_ID, { ...env, VERCEL_ENV: "production" }), false);
});

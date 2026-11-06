import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { deliverWelcome, welcomePayload, type WelcomeClaim } from "../src/lib/email/welcome";
import { resolveNotificationTarget } from "../src/lib/notifications/open";
import { notificationResponseTarget, notificationNavigationReady, safeNotificationDestination, mergeNotificationItems } from "../apps/mobile/src/lib/notification-routing";
const u = "11111111-1111-4111-8111-111111111111", v = "22222222-2222-4222-8222-222222222222";
test("welcome is useful, branded, untracked and limited to the configured Rezlee destination", () => {
 const p = welcomePayload("Rezlee <hello@rezlee.com>", "new@example.invalid", "https://staging.rezlee.com");
 assert.match(p.html, /https:\/\/staging.rezlee.com\/open/); assert.match(p.text, /Joining someone/);
 assert.equal(p.to[0], "new@example.invalid"); assert.doesNotMatch(p.html, /<img|<script|utm_/);
 assert.throws(() => welcomePayload("Rezlee", "new@example.invalid", "https://evil.invalid"));
 assert.throws(() => welcomePayload("Rezlee", "new@example.invalid", "http://rezlee.com"));
});
for (const [label, response, expected] of [
 ["accepted", () => Response.json({ id: "provider-1" }), "accepted"],
 ["rate limited", () => new Response("", { status: 429 }), "retry"],
 ["provider error", () => new Response("", { status: 503 }), "retry"],
 ["invalid recipient", () => new Response("", { status: 422 }), "failed"],
 ["unknown acceptance", () => Response.json({}), "uncertain"],
 ["connection lost", () => { throw Error("private provider details"); }, "retry"]
] as const) test("welcome delivery: " + label, async () => {
 const payload = welcomePayload("Rezlee", "new@example.invalid", "https://staging.rezlee.com");
 const result = await deliverWelcome({
  claim: async () => ({ state: "claimed", id: u, leaseId: v, payload }),
  send: async (actual, key) => { assert.equal(actual, payload); assert.equal(key, "rezlee-welcome-" + u); return response(); },
  finish: async (lease, status, id) => { assert.equal(lease, v); assert.equal(status, expected); assert.equal(id, expected === "accepted" ? "provider-1" : null); return true; }
 }); assert.equal(result, expected);
});
test("terminal/noneligible welcomes never send, and failed persistence does not send again inline", async () => {
 for (const state of ["accepted", "ineligible", "waiting", "suppressed", "uncertain", "failed"]) {
  assert.equal(await deliverWelcome({ claim: async () => ({ state }), send: async () => { throw Error("MUST NOT SEND"); }, finish: async () => { throw Error("MUST NOT FINISH"); } }), state);
 }
 let sends = 0;
 await assert.rejects(deliverWelcome({ claim: async () => ({ state: "claimed", id: u, leaseId: v, payload: welcomePayload("Rezlee", "x@example.invalid", "https://staging.rezlee.com") }), send: async () => { sends++; return Response.json({ id: "one" }); }, finish: async () => false }));
 assert.equal(sends, 1);
});
test("push payloads cannot choose destinations and recovery/onboarding retain navigation priority", () => {
 assert.equal(notificationResponseTarget(null), null);
 assert.deepEqual(notificationResponseTarget({ notification: { request: { identifier: "push-1", content: { data: { mobileHref: "/provider/" + u } } } } }), { responseId: "push-1", notificationId: null });
 assert.deepEqual(notificationResponseTarget({ notification: { request: { identifier: "push-1", content: { data: { notificationId: u, mobileHref: "https://evil.invalid" } } } } }), { responseId: "push-1", notificationId: u });
 for (const path of ["/", "/welcome", "/login", "/signup", "/reset-password", "/auth-return", "/onboarding/details", "/household/join", "/delete-account"]) assert.equal(notificationNavigationReady(path), false, path);
 for (const path of ["/home", "/notifications", "/bill/" + u]) assert.equal(notificationNavigationReady(path), true, path);
 for (const value of ["https://evil.invalid", "/bill/../home", "//rezlee.com", "/bill/" + u + "?token=secret"]) assert.equal(safeNotificationDestination(value), "/notifications");
 assert.equal(safeNotificationDestination("/bill/" + u), "/bill/" + u);
 assert.deepEqual(mergeNotificationItems([{ id: u, title: "old" }], [{ id: u, title: "updated" }, { id: v, title: "older" }]), [{ id: u, title: "updated" }, { id: v, title: "older" }]);
});
test("notification opens recheck record visibility and stale actions", async () => {
 const now = Date.parse("2026-10-12T12:00:00Z"), row = { created_at: "2026-10-12T11:00:00Z", metadata: { mobileHref: "/bill/" + u } };
 assert.deepEqual(await resolveNotificationTarget(row, async (table, id) => { assert.equal(table, "bills"); assert.equal(id, u); return true; }, now), { href: "/bill/" + u });
 assert.deepEqual(await resolveNotificationTarget(row, async () => false, now), { href: "/notifications", notice: "unavailable" });
 assert.deepEqual(await resolveNotificationTarget(null, async () => { throw Error("NO LOOKUP"); }, now), { href: "/notifications", notice: "unavailable" });
 for (const stale of [{ ...row, resolved_at: row.created_at }, { ...row, expires_at: "2026-10-12T12:00:00Z" }, { ...row, created_at: "2026-08-12T12:00:00Z" }]) assert.deepEqual(await resolveNotificationTarget(stale, async () => { throw Error("NO LOOKUP"); }, now), { href: "/notifications", notice: "handled" });
 await assert.rejects(resolveNotificationTarget(row, async () => { throw Error("network"); }, now));
});
test("welcome database prevents backfill, concurrent duplicates, cross-account access and late retry duplicates", async () => {
 const db = new PGlite();
 try {
  await db.exec("create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;");
  for (const f of ["supabase/schema.sql", ...(await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort().map(f => "supabase/migrations/" + f)]) await db.exec((await readFile(f, "utf8")).replace(/create extension if not exists "pgcrypto";/g, ""));
  await db.exec("alter table auth.users add column created_at timestamptz default now();alter table auth.users add column email_confirmed_at timestamptz;");
  await db.query("insert into auth.users(id,email,created_at,email_confirmed_at) values($1,'new@example.invalid',now(),now()),($2,'old@example.invalid',now()-interval '1 year',now())", [u, v]);
  const start = new Date(Date.now() - 60_000).toISOString(), payload = welcomePayload("Rezlee", "new@example.invalid", "https://staging.rezlee.com");
  const claim = async (id = u, body = payload) => (await db.query<{ result: WelcomeClaim }>("select claim_rezlee_welcome($1,$2,$3::jsonb) as result", [id, start, JSON.stringify(body)])).rows[0].result;
  const finish = async (lease: string, status: string) => (await db.query<{ result: boolean }>("select finish_rezlee_welcome($1,$2,$3) as result", [u, lease, status])).rows[0].result;
  assert.equal((await claim(v)).state, "ineligible");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [u]); assert.equal((await claim()).state, "ineligible");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [u]);
  await assert.rejects(claim(u, { ...payload, to: ["someoneelse@example.invalid"] }), /Invalid welcome message/);
  const parallel = await Promise.all([claim(), claim(), claim()]);
  assert.deepEqual(parallel.map(x => x.state).sort(), ["claimed", "waiting", "waiting"]);
  const first = parallel.find(x => x.state === "claimed")!;
  assert.equal((await db.query("select id from account_operation_leases where user_id=$1", [u])).rows.length, 1);
  assert.equal(await finish(v, "accepted"), false);
  assert.equal(await finish(first.leaseId!, "retry"), true); assert.equal((await claim()).state, "waiting");
  await db.query("update welcome_email_deliveries set next_attempt_at=now()-interval '1 minute' where user_id=$1", [u]);
  const retry = await claim(u, { ...payload, subject: "NEW TEMPLATE MUST NOT CHANGE RETRY" });
  assert.equal(retry.id, first.id); assert.deepEqual(retry.payload, first.payload); assert.notEqual(retry.leaseId, first.leaseId);
  await db.query("update welcome_email_deliveries set attempts=5 where user_id=$1", [u]); assert.equal((await claim()).state, "waiting");
  assert.equal(await finish(retry.leaseId!, "accepted"), true); assert.equal((await claim()).state, "accepted");
  await db.query("update welcome_email_deliveries set status='retry',attempts=1,first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute' where user_id=$1", [u]);
  assert.equal((await claim()).state, "uncertain");
  await db.query("update welcome_email_deliveries set status='retry',attempts=1,first_attempt_at=now(),next_attempt_at=now()-interval '1 minute' where user_id=$1", [u]);
  await db.query("update auth.users set email='changed@example.invalid' where id=$1", [u]);
  assert.equal((await claim(u, { ...payload, to: ["changed@example.invalid"] })).state, "suppressed");
  await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]);
  await assert.rejects(db.query("select * from welcome_email_deliveries"), /permission denied/);
  await assert.rejects(claim(), /permission denied/);
  await db.exec("reset role");
  await db.query("delete from auth.users where id=$1", [u]);
  assert.equal((await db.query("select * from welcome_email_deliveries where user_id=$1", [u])).rows.length, 0);
 } finally { await db.close(); }
});

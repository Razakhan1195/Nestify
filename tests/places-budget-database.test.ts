import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Places budget admits only remaining attempts and is inaccessible to clients", async () => {
 const db = new PGlite();
 try {
  await db.exec("create role anon; create role authenticated; create role service_role; grant usage on schema public to service_role,authenticated,anon;");
  await db.exec(await readFile("supabase/migrations/202610190002_places_usage_budget.sql", "utf8"));
  await db.exec("insert into public.places_usage_budget values(date_trunc('month',now() at time zone 'America/Los_Angeles')::date,'autocomplete',2498)");
  const calls = await Promise.all(Array.from({length:10}, () => db.query<{ok:boolean}>("select public.reserve_rezlee_places_request('autocomplete') ok")));
  assert.equal(calls.filter(r => r.rows[0].ok).length, 2);
  assert.equal((await db.query<{attempts:number}>("select attempts from public.places_usage_budget")).rows[0].attempts, 2500);
  assert.equal((await db.query<{ok:boolean}>("select public.reserve_rezlee_places_request('details') ok")).rows[0].ok, true);
  await assert.rejects(db.query("select public.reserve_rezlee_places_request('arbitrary')"), /Invalid Places/);
  for (const role of ["anon","authenticated"]) {
   await db.exec("set role " + role);
   await assert.rejects(db.query("select public.reserve_rezlee_places_request('details')"), /permission denied/);
   await assert.rejects(db.query("select * from public.places_usage_budget"), /permission denied/);
   await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await db.query<{ok:boolean}>("select public.reserve_rezlee_places_request('details') ok")).rows[0].ok, true);
 } finally { await db.close(); }
});

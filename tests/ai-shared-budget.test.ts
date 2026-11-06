import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("global AI admission is bounded, private, survives account deletion and preserves user limits", async()=>{
 const db=new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated;
   insert into auth.users values('${a}'),('${b}');`);
  await db.exec(await readFile("supabase/migrations/202609090002_rezlee_ai_reservations.sql","utf8"));
  const migration=await readFile("supabase/migrations/202609300001_ai_shared_budget.sql","utf8");
  await db.exec(migration);
  await db.exec("update public.rezlee_ai_budget_config set daily_requests=2,monthly_requests=3");
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
  const reserve=async()=> (await db.query<{value:string}>("select public.reserve_rezlee_ai_request_v2() value")).rows[0].value;
  assert.equal(await reserve(),"allowed");
  await assert.rejects(db.query("select * from public.rezlee_ai_budget_config"),/permission denied/);
  await assert.rejects(db.query("update public.rezlee_ai_budget_windows set requests=0"),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  assert.equal(await reserve(),"allowed");assert.equal(await reserve(),"service_limited");
  assert.equal((await db.query<{ok:boolean}>("select public.reserve_rezlee_ai_request() ok")).rows[0].ok,false);
  await db.exec(`reset role;delete from auth.users where id='${a}';`);
  await db.exec(migration); // replay cannot reset counters
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}'`);
  assert.equal(await reserve(),"service_limited");
  await db.exec("reset role;update public.rezlee_ai_budget_config set daily_requests=100;set role authenticated");
  assert.equal(await reserve(),"allowed");assert.equal(await reserve(),"service_limited");
  await db.exec("reset role;update public.rezlee_ai_budget_config set monthly_requests=1000");
  await db.exec(`insert into public.rezlee_ai_reservations(user_id) select '${b}' from generate_series(1,38);set role authenticated;`);
  assert.equal(await reserve(),"user_limited");
  await db.exec("reset role;update public.rezlee_ai_budget_config set enabled=false;set role authenticated");
  assert.equal(await reserve(),"unavailable");
  await db.exec("reset role;set role anon");await assert.rejects(reserve(),/permission denied/);
 }finally{await db.close();}
});

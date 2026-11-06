import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("recall schema isolates preferences, restricts worker writes, deduplicates events and claims jobs once",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated;
   create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table homes(id uuid primary key,user_id uuid);
   create table inventory_items(id uuid primary key);
   create table device_push_tokens(id uuid primary key);
   grant usage on schema public,auth to authenticated;
   grant select on homes to authenticated;
   grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(await readFile("supabase/migrations/202609230002_recall_monitoring.sql","utf8"));
  await db.exec("grant select,insert,update,delete on recall_preferences,recall_events,recall_deliveries to authenticated");
  const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
  const ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",item="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`insert into auth.users values ('${a}'),('${b}'); insert into homes values ('${ha}','${a}'),('${hb}','${b}'); insert into inventory_items values ('${item}');`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
  await assert.rejects(db.exec(`insert into recall_preferences(user_id,home_id) values ('${a}','${hb}')`));
  await db.exec(`insert into recall_preferences(user_id,home_id,enabled,next_check_at) values ('${a}','${ha}',true,'2026-09-01')`);
  await assert.rejects(db.exec(`insert into recall_events(user_id,home_id,item_id,attention_key,status) values ('${a}','${ha}','${item}','key','pending')`));
  await db.exec("reset role");
  const first=await db.query(`update recall_preferences set next_check_at='2026-09-24' where user_id='${a}' and next_check_at='2026-09-01' returning user_id`);
  const second=await db.query(`update recall_preferences set next_check_at='2026-09-24' where user_id='${a}' and next_check_at='2026-09-01' returning user_id`);
  assert.equal(first.rows.length,1);assert.equal(second.rows.length,0);
  const insert=`insert into recall_events(user_id,home_id,item_id,attention_key,status) values ('${a}','${ha}','${item}','key','pending') on conflict(user_id,home_id,attention_key) do nothing returning id`;
  assert.equal((await db.query(insert)).rows.length,1);
  assert.equal((await db.query(insert)).rows.length,0);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`);
  assert.equal((await db.query("select * from recall_preferences")).rows.length,0);
  assert.equal((await db.query("select * from recall_events")).rows.length,0);
 } finally {await db.close();}
});

import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
test("repair progress migration preserves private RLS and compare-and-swap prevents double advances",async()=>{
 const db=new PGlite();const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333";
 try{
 await db.exec(`create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;create table repair_issues(id uuid primary key,user_id uuid,home_id uuid,created_at timestamptz default now(),status text);alter table repair_issues enable row level security;create policy own on repair_issues for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert,update,delete on repair_issues to authenticated;`);
 await db.exec(await readFile("supabase/migrations/202609260009_guided_repair_progress.sql","utf8"));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';insert into repair_issues(id,user_id,home_id,status,guided_progress,guided_version)values('${id}','${owner}','${id}','next_steps_ready','{"attempts":[]}',1)`);
 const update=()=>db.query("update repair_issues set guided_version=2,guided_progress=$1 where id=$2 and guided_version=1 returning id",[JSON.stringify({attempts:[{stepId:"symptoms",answer:"checked"}]}),id]);
 assert.equal((await update()).rows.length,1);assert.equal((await update()).rows.length,0);
 await db.exec(`set request.jwt.claim.sub='${other}'`);
 assert.equal((await db.query("select * from repair_issues")).rows.length,0);
 assert.equal((await db.query("update repair_issues set status='resolved' where id=$1 returning id",[id])).rows.length,0);
 await assert.rejects(db.query("insert into repair_issues(id,user_id) values(gen_random_uuid(),$1)",[owner]));
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 const rows=await db.query<{guided_version:number;guided_progress:{attempts:unknown[]}}>("select guided_version,guided_progress from repair_issues");
 assert.equal(rows.rows[0].guided_version,2);assert.equal(rows.rows[0].guided_progress.attempts.length,1);
 }finally{await db.close();}
});

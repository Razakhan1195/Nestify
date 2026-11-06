import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("Home snapshot retains owner/member isolation, source failures and deletion fences",async()=>{
 const db=new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",c="33333333-3333-4333-8333-333333333333";
 const ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hc="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 try{
  await db.exec(`create role anon; create role authenticated; create role authenticator; create role service_role bypassrls;
   create schema auth; create schema storage; create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;
   grant execute on function auth.uid(),storage.foldername(text) to authenticated;
   grant all on storage.objects to authenticated;`);
  for (const file of ["supabase/schema.sql", ...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>`supabase/migrations/${f}`)]) {
   await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  }

 await db.exec(`grant select on all tables in schema public to authenticated;
 insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid'),('${c}','c@example.invalid');
 insert into homes(id,user_id,nickname)values('${ha}','${a}','A home'),('${hc}','${c}','C home');
 insert into household_members(home_id,created_by_user_id,linked_user_id,display_name,email,role,status)values('${ha}','${a}','${b}','B','b@example.invalid','member','active');
 insert into bills(user_id,home_id,name,amount)values('${a}','${ha}','Private A bill',100),('${c}','${hc}','Private C bill',200);
 insert into documents(user_id,home_id,title)values('${a}','${ha}','Private A record');
 insert into maintenance_tasks(user_id,home_id,title,status)values('${a}','${ha}','Shared task','open');
 set role authenticated;set request.jwt.claim.sub='${a}';`);
 type Snapshot={missing:string[];bills:{name:string}[];records:{title:string}[];care:{title:string}[];household:unknown[]};
 const get=async(home=ha,effective=true)=>(await db.query<{v:Snapshot}>("select rezlee_home_snapshot($1,$2)v",[home,effective])).rows[0].v;
 const own=await get();assert.deepEqual(own.missing,[]);assert.deepEqual(own.bills.map(x=>x.name),['Private A bill']);assert.equal(own.records[0].title,'Private A record');assert.equal(own.care[0].title,'Shared task');
 assert.deepEqual((await get(ha,false)).bills,own.bills);
 await assert.rejects(get(hc),/Home unavailable/);
 await db.exec(`set request.jwt.claim.sub='${b}'`);const member=await get();assert.deepEqual(member.missing,[]);assert.deepEqual(member.bills,[]);assert.deepEqual(member.records,[]);assert.equal(member.care[0].title,'Shared task');assert.ok(member.household.length);
 await db.exec(`set request.jwt.claim.sub='${c}'`);await assert.rejects(get(),/Home unavailable/);
 await db.exec(`reset role;revoke select on documents from authenticated;set role authenticated;set request.jwt.claim.sub='${a}'`);
 const partial=await get();assert.deepEqual(partial.missing,['records']);assert.deepEqual(partial.records,[]);assert.equal(partial.care.length,1);
 await db.exec(`reset role;grant select on documents to authenticated;select begin_rezlee_account_deletion('${a}',gen_random_uuid(),'${"a".repeat(64)}');set role authenticated;set request.jwt.claim.sub='${a}'`);await assert.rejects(get(),/Home unavailable/);
 await db.exec('reset role;set role anon');await assert.rejects(get(),/permission denied/);
 }finally{await db.close();}
});

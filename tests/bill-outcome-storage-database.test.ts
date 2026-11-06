import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("follow-ups survive provider refresh, serialize conflicting saves, enforce ownership and cascade with baseline deletion",async()=>{
 const db=new PGlite(),a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",id="dddddddd-dddd-4ddd-8ddd-111111111111";
 try{
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;`);
  for(const file of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>"supabase/migrations/"+f)])
   await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec(`grant select,insert,update,delete on public.homes,public.bills to authenticated; grant select on public.providers to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   insert into public.bills(id,user_id,home_id,name,source,status,currency,raw_data) values('${id}','${a}','${ha}','Synthetic utility','ezgb','archived','CAD','{"category":"Natural Gas"}');
   set role authenticated;set request.jwt.claim.sub='${a}';`);
  const stamp=async()=>(await db.query<{v:string}>("select updated_at::text v from bills where id=$1",[id])).rows[0].v;
  const initial=await stamp(),target={id:"one",title:"Thermostat schedule",kind:"usage_change",state:"planned"};
  const save=(version:string,revision:number,patch=target)=>db.query<{revision:number}>("select save_rezlee_bill_outcome($1,$2,$3,$4::jsonb,$5::jsonb,null) revision",[id,version,revision,JSON.stringify(patch),'{"usageAmount":310}']);
  assert.equal((await save(initial,0)).rows[0].revision,1);
  await assert.rejects(save(initial,0),/Action changed/);
  await db.query("update bills set raw_data=$1::jsonb,usage_amount=240 where id=$2",['{"category":"Natural Gas","quality_of_reading":"actual"}',id]);
  assert.deepEqual((await db.query<{target:unknown}>("select target from bill_outcome_actions")).rows[0].target,target);
  await assert.rejects(save(initial,1),/Statement changed/);
  assert.equal((await save(await stamp(),1,{...target,state:"implemented"})).rows[0].revision,2);
  await db.exec(`set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query("select * from bill_outcome_actions")).rows.length,0);
  await assert.rejects(save(initial,2),/Statement unavailable/);
  await assert.rejects(db.query("insert into bill_outcome_actions(bill_id,user_id,home_id,target,baseline_snapshot) values($1,$2,$3,'{}','{}')",[id,b,hb]),/row-level security/);
  await db.exec(`set request.jwt.claim.sub='${a}';delete from bills where id='${id}';`);
  assert.equal((await db.query("select * from bill_outcome_actions")).rows.length,0);
 }finally{await db.close();}
});

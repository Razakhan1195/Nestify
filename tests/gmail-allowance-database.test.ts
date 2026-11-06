import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("email allowance is independent, service-bounded, owner-fenced and reports rolling recovery",async()=>{
 const db=new PGlite(),a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",link="dddddddd-dddd-4ddd-8ddd-000000000001",lease="dddddddd-dddd-4ddd-8ddd-000000000002";
 const value=async<T>(sql:string,params:unknown[]=[])=> (await db.query<{v:T}>(sql,params)).rows[0].v;
 const capacity=()=>value<{allowed:boolean;reason:string;dailyUsed:number;retryAt:string}>("select public.rezlee_gmail_ai_capacity($1) v",[a]);
 const reserve=()=>value<string>("select public.reserve_rezlee_gmail_ai($1,$2) v",[link,lease]);
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
  await db.exec(`grant select on public.homes,public.documents,public.bills to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${home}','${a}','QA only');`);

  await db.query("insert into public.gmail_memory_links(id,user_id,home_id,email,token_cipher,status,categories,work,lease,lease_until) values($1,$2,$3,'fixture@example.invalid','cipher','active',ARRAY['utility_bill'],'{}',$4,now()+interval '1 hour')",[link,a,home,lease]);
  await db.query("insert into public.rezlee_ai_reservations(user_id) select $1 from generate_series(1,40)",[a]);
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  await db.query("select public.set_rezlee_ai_consent(true, '2026-10-13')");
  assert.equal(await value("select public.reserve_rezlee_ai_request_v2() v"),"user_limited");
  assert.equal((await capacity()).allowed,true,"prior app usage does not block email");
  assert.equal(await reserve(),"allowed");
  assert.equal((await capacity()).dailyUsed,1);
  assert.equal(await value("select count(*)::integer v from public.rezlee_ai_reservations"),40,"email never consumes everyday allowance");
  await db.query("insert into public.gmail_import_ai_reservations(user_id) select $1 from generate_series(1,99)",[a]);
  const full=await capacity();assert.equal(full.reason,"user_limited");assert.ok(Date.parse(full.retryAt)>Date.now()+23*3600000);
  assert.equal(await reserve(),"user_limited");
  assert.equal(await value("select public.reserve_rezlee_gmail_ai($1,gen_random_uuid()) v",[link]),"unavailable");
  await db.query("update public.gmail_import_ai_reservations set created_at=now()-interval '25 hours' where user_id=$1",[a]);
  assert.equal((await capacity()).allowed,true);
  await db.query("insert into public.gmail_import_ai_reservations(user_id,created_at) select $1,now()-interval '2 days' from generate_series(1,400)",[a]);
  assert.equal((await capacity()).reason,"user_limited","rolling month also applies");
  await db.query("delete from public.gmail_import_ai_reservations where user_id=$1",[a]);
  await db.exec("update public.rezlee_ai_budget_windows set requests=200 where kind='day'");
  assert.equal((await capacity()).reason,"service_limited");assert.equal(await reserve(),"service_limited");
  assert.equal(await value("select count(*)::integer v from public.gmail_import_ai_reservations"),0,"denied requests do not spend allowance");
  await db.exec("update public.rezlee_ai_budget_windows set requests=0 where kind='day';update public.rezlee_ai_budget_windows set requests=3000 where kind='month'");
  assert.equal((await capacity()).reason,"service_limited");
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}'`);
  await assert.rejects(capacity(),/permission denied/);
  await assert.rejects(reserve(),/permission denied/);
  await assert.rejects(db.query("select * from public.gmail_import_ai_reservations"),/permission denied/);
  await db.exec("reset role;update public.rezlee_ai_budget_config set enabled=false");
  assert.equal((await capacity()).reason,"unavailable");
 }finally{await db.close();}
});

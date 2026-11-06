import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("owner creation and referral grants use actual database permissions",async()=>{
 const db=new PGlite();
 const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",foreign="33333333-3333-4333-8333-333333333333",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 try {
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
  const tables=await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public'");
  for(const row of tables.rows) await db.exec(`grant select,insert,update,delete on public."${row.tablename}" to authenticated,service_role`);


 await db.exec(`alter table auth.users add column if not exists email_confirmed_at timestamptz;alter table auth.users add column if not exists created_at timestamptz default now();
 insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.invalid',now()),('${member}','member@example.invalid',now()),('${foreign}','foreign@example.invalid',now());
 insert into homes(id,user_id,nickname,city) values('${home}','${owner}','Our place','Toronto');`);
 const owners=await db.query<{id:string;role:string;status:string}>("select id,role,status from household_members where home_id=$1",[home]);
 assert.equal(owners.rows.length,1);assert.equal(owners.rows[0].role,"owner");assert.equal(owners.rows[0].status,"active");
 await db.exec("update rezlee_membership_campaign set activated=1000");
 for(const u of [owner,member,foreign])await db.query("select rezlee_activate_member($1)",[u]);
 const code=(await db.query<{code:string}>("select rezlee_referral_code($1) code",[owner])).rows[0].code;
 assert.match(code,/^[A-F0-9]{12}$/);assert.equal((await db.query<{code:string}>("select rezlee_referral_code($1) code",[owner])).rows[0].code,code);
 await assert.rejects(db.query("select rezlee_claim_referral($1,$2)",[owner,code]));
 const claim=async()=> (await db.query<{r:{status:string;expiresAt:string}}>("select rezlee_claim_referral($1,$2) r",[member,code])).rows[0].r;
 const first=await claim();assert.equal(first.status,"claimed");assert.equal((await claim()).expiresAt,first.expiresAt);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from rezlee_referral_claims where user_id=$1",[member])).rows[0].n,1);
 assert.equal((await db.query<{r:{plan:string;source:string}}>("select rezlee_membership($1) r",[member])).rows[0].r.source,"referral");
 await db.query("update rezlee_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and source='referral'",[member]);
 assert.equal((await db.query<{r:{plan:string}}>("select rezlee_membership($1) r",[member])).rows[0].r.plan,"free");
 assert.equal((await claim()).expiresAt,first.expiresAt,"Retry cannot renew expired gift");
 await db.query("insert into rezlee_entitlements(user_id,source)values($1,'founder')",[foreign]);
 assert.equal((await db.query<{r:{status:string}}>("select rezlee_claim_referral($1,$2) r",[foreign,code])).rows[0].r.status,"already_pro");
 await db.exec("set role authenticated");await assert.rejects(db.query("select rezlee_claim_referral($1,$2)",[foreign,code]));assert.equal((await db.query("select * from rezlee_referral_codes")).rows.length,0);
 }finally{await db.close();}
});

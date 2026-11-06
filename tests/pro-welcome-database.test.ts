import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("free test accounts stay free after reactivation and sandbox access is service-only",async()=>{
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
  assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','public.rezlee_membership_test_accounts','select') allowed")).rows[0].allowed,false);
  const tables=await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public'");
  for(const row of tables.rows) await db.exec(`grant select,insert,update,delete on public."${row.tablename}" to authenticated,service_role`);


 await db.exec(`alter table auth.users add column if not exists email_confirmed_at timestamptz;alter table auth.users add column if not exists created_at timestamptz default now();
 insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.invalid',now()),('${member}','member@example.invalid',now()),('${foreign}','foreign@example.invalid',now());
 insert into homes(id,user_id,nickname,city) values('${home}','${owner}','Our place','Toronto');`);

 await db.query("select rezlee_activate_member($1)",[owner]);
 const before=(await db.query<{n:number}>("select activated n from rezlee_membership_campaign")).rows[0].n;
 await db.query("delete from rezlee_entitlements where user_id=$1 and source='founder'",[owner]);
 await db.query("delete from rezlee_founder_allocations where user_id=$1 and reason='first_1000'",[owner]);
 await db.query("insert into rezlee_membership_test_accounts(user_id,allow_store_sandbox,reason)values($1,true,'Explicit owner test account')",[owner]);
 await db.query("select rezlee_activate_member($1)",[owner]);
 assert.equal((await db.query<{r:{plan:string}}>("select rezlee_membership($1) r",[owner])).rows[0].r.plan,"free");
 assert.equal((await db.query<{n:number}>("select activated n from rezlee_membership_campaign")).rows[0].n,before);
 assert.equal((await db.query("select * from rezlee_member_accounts where user_id=$1",[owner])).rows.length,1);
 await db.query("update rezlee_member_accounts set pro_welcome_seen_at=now() where user_id=$1",[owner]);
 assert.ok((await db.query<{seen:string}>("select pro_welcome_seen_at seen from rezlee_member_accounts where user_id=$1",[owner])).rows[0].seen);
 await db.exec("set role authenticated");
 assert.equal((await db.query("select * from rezlee_membership_test_accounts")).rows.length,0);
 await assert.rejects(db.query("insert into rezlee_membership_test_accounts(user_id,allow_store_sandbox,reason)values($1,true,'Unauthorized sandbox access')",[member]));
 assert.equal((await db.query("update rezlee_member_accounts set pro_welcome_seen_at=null where user_id=$1 returning user_id",[owner])).rows.length,0);
 }finally{await db.close();}
});

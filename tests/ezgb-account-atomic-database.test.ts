import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("EZGB account creation is tenant scoped, atomic and repeatable", async()=>{
 const db=new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
 const ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 try{
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;
  create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
  grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;`);
  for(const f of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>"supabase/migrations/"+f)])await db.exec((await readFile(f,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec(`insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');insert into homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');`);
  const category=(await db.query<{id:string}>("select id from provider_categories limit 1")).rows[0].id;
  const values={external_account_id:"same-authorized-source",external_authorization_id:"auth-a",external_usage_point_id:"meter",external_user_identifier:"private",status:"syncing",capabilities:{bills:true},metadata:{utility:"Test utility"}};
  const save=async(user:string,home:string,key="same-service",patch={})=>(await db.query<{id:string;provider_id:string;status:string}>("select * from save_rezlee_ezgb_account($1,$2,$3,$4,$5,$6,$7)",[user,home,key,"Test utility",category,"•••• 1234",JSON.stringify({...values,...patch})])).rows[0];
  const first=await save(a,ha),repeat=await save(a,ha);
  assert.equal(first.id,repeat.id);assert.equal(first.provider_id,repeat.provider_id);
  const second=await save(b,hb);assert.notEqual(second.provider_id,first.provider_id);
  assert.equal((await db.query("select id from providers")).rows.length,2);
  // A different resource attempting the same child-account identity must fail atomically.
  await assert.rejects(save(a,ha,"conflicting-resource"),/duplicate key/);
  assert.equal((await db.query("select id from providers")).rows.length,2);
  await assert.rejects(save(a,hb),/scope is invalid/);
  await db.query("update provider_integrations set status='disconnected' where id=$1",[first.id]);
  assert.equal((await save(a,ha)).status,"disconnected");
  assert.equal((await save(a,ha,"same-service",{external_authorization_id:"auth-new"})).id,first.id);
  await db.exec(`grant select on providers,provider_integrations,homes to authenticated;set role authenticated;set request.jwt.claim.sub='${a}';`);
  assert.equal((await db.query("select id from provider_integrations")).rows.length,1);
  await assert.rejects(save(a,ha),/permission denied/);
 }finally{await db.close();}
});

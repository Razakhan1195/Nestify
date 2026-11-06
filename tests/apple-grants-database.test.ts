import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Apple grants are service-only, deduplicated and frozen atomically with account deletion", async () => {
 const db=new PGlite(), a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
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
  for(const file of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(x=>x.endsWith(".sql")).sort().map(x=>"supabase/migrations/"+x)])
   await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec(`insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');`);
  const insert=(user:string,hash="a".repeat(64))=>`insert into public.apple_auth_grants(user_id,client_id,apple_subject,token_hash,token_cipher) values('${user}','com.example.web','subject','${hash}','${"cipher".repeat(8)}') on conflict(user_id,client_id,token_hash) do nothing`;
  for(const role of ["anon","authenticated"]){
   await db.exec("set role "+role);await assert.rejects(db.exec("select * from public.apple_auth_grants"));await assert.rejects(db.exec(insert(a)));await db.exec("reset role");
  }
  await db.exec("set role service_role");await db.exec(insert(a));await db.exec(insert(a));await db.exec(insert(b));await db.exec("reset role");
  assert.equal((await db.query("select * from public.apple_auth_grants")).rows.length,2);
  const job="33333333-3333-4333-8333-333333333333";
  await db.exec(`select public.begin_rezlee_account_deletion('${a}','${job}','${"b".repeat(64)}');set role service_role;`);
  await assert.rejects(db.exec(insert(a,"c".repeat(64))));await assert.rejects(db.exec(insert(a)));
  await assert.rejects(db.exec(`update public.apple_auth_grants set token_cipher='${"changed".repeat(8)}' where user_id='${a}'`));
  await db.exec(`delete from public.apple_auth_grants where user_id='${a}';reset role;delete from auth.users where id='${a}';`);
  assert.equal((await db.query(`select * from public.apple_auth_grants where user_id='${b}'`)).rows.length,1);
  assert.equal((await db.query(`select * from public.apple_auth_grants where user_id='${a}'`)).rows.length,0);
 } finally {await db.close();}
});

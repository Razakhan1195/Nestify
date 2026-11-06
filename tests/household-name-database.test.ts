import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("actual household policies permit owner rename, preserve address and deny member/foreign writes", async () => {
 const db = new PGlite();
 const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222", c="33333333-3333-4333-8333-333333333333";
 const ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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

  await db.exec(`insert into auth.users values('${a}','owner@example.invalid'),('${b}','member@example.invalid'),('${c}','foreign@example.invalid');
    insert into homes(id,user_id,nickname,city) values('${ha}','${a}','Original','Pickering');
    insert into household_members(home_id,created_by_user_id,linked_user_id,display_name,email,role,status) values('${ha}','${a}','${b}','Member','member@example.invalid','member','active');
    set role authenticated; set request.jwt.claim.sub='${a}';`);
  assert.equal((await db.query(`update homes set nickname='Updated' where id='${ha}' and nickname='Original' returning nickname`)).rows.length,1);
  assert.equal((await db.query<{city:string}>(`select city from homes where id='${ha}'`)).rows[0].city,'Pickering');
  assert.equal((await db.query(`update homes set nickname='Stale' where id='${ha}' and nickname='Original' returning id`)).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query(`select id from homes where id='${ha}'`)).rows.length,1);
  assert.equal((await db.query(`update homes set nickname='Member write' where id='${ha}' returning id`)).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${c}'`);
  assert.equal((await db.query(`select id from homes where id='${ha}'`)).rows.length,0);
  assert.equal((await db.query(`update homes set nickname='Foreign write' where id='${ha}' returning id`)).rows.length,0);
 } finally { await db.close(); }
});

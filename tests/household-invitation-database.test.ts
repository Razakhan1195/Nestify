import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("invitation expiry, identity, repeat acceptance, revocation and household conflict against PostgreSQL",async()=>{
 const db=new PGlite();const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",c="33333333-3333-4333-8333-333333333333",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 try {
  await db.exec(`create role anon; create role authenticated; create role authenticator; create role service_role bypassrls;
   create schema auth; create schema storage; create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
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

 await db.exec(`insert into auth.users values('${a}','owner@example.invalid'),('${b}','member@example.invalid'),('${c}','foreign@example.invalid');insert into homes(id,user_id,nickname)values('${ha}','${a}','Real home');insert into profiles(user_id,full_name)values('${a}','Actual owner');`);
 async function login(user:string,email:string){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}';set request.jwt.claim.email='${email}';`);}
 async function invite(email="member@example.invalid",linked=b,age="0 days") {await db.exec('reset role');return (await db.query<{id:string}>(`insert into household_members(home_id,created_by_user_id,linked_user_id,display_name,email,role,status,invite_sent_at)values('${ha}','${a}','${linked}','Invitee','${email}','member','invited',now()-interval '${age}') returning id`)).rows[0].id;}
 async function context(id:string){return (await db.query<{value:{state:string;homeName?:string;inviterName?:string}}>(`select get_rezlee_household_invite('${id}') as value`)).rows[0].value;}
 async function accept(id:string){return (await db.query<{value:{accepted:boolean;alreadyAccepted:boolean}}>(`select accept_household_invite('${id}') as value`)).rows[0].value;}
 const id=await invite();await login(c,'foreign@example.invalid');assert.deepEqual(await context(id),{state:'unavailable'});await assert.rejects(accept(id));
 await login(b,'member@example.invalid');assert.equal((await context(id)).state,'pending');assert.equal((await context(id)).homeName,'Real home');assert.equal((await context(id)).inviterName,'Actual owner');assert.equal((await db.query(`select id from homes where id='${ha}'`)).rows.length,0);
 assert.equal((await accept(id)).accepted,true);assert.equal((await accept(id)).alreadyAccepted,true);assert.equal((await context(id)).state,'active');assert.equal((await db.query(`select id from homes where id='${ha}'`)).rows.length,1);
 await login(a,'owner@example.invalid');await db.exec(`delete from household_members where id='${id}'`);await login(b,'member@example.invalid');assert.equal((await context(id)).state,'unavailable');await assert.rejects(accept(id));assert.equal((await db.query(`select id from homes where id='${ha}'`)).rows.length,0);
 const expired=await invite('member@example.invalid',b,'7 days');await login(b,'member@example.invalid');assert.equal((await context(expired)).state,'expired');await assert.rejects(accept(expired));
 await db.exec('reset role');await db.exec(`delete from household_members where id='${expired}'`);
 const mismatch=await invite('member@example.invalid',c);await login(b,'member@example.invalid');assert.equal((await context(mismatch)).state,'unavailable');await assert.rejects(accept(mismatch));await db.exec('reset role');await db.exec(`delete from household_members where id='${mismatch}'`);
 const conflict=await invite();await db.exec(`insert into homes(user_id,nickname)values('${b}','Existing home')`);await login(b,'member@example.invalid');assert.equal((await context(conflict)).state,'other_household');await assert.rejects(accept(conflict));assert.equal((await db.query<{status:string}>(`select status from household_members where id='${conflict}'`)).rows[0].status,'invited');
 await db.exec('reset role');await db.exec(`delete from homes where user_id='${b}'`);await login(b,'member@example.invalid');assert.equal((await context(conflict)).state,'pending');
 await db.exec(`set request.jwt.claim.email='different@example.invalid'`);assert.equal((await context(conflict)).state,'unavailable');await assert.rejects(accept(conflict));
 await db.exec('reset role;set role anon');await assert.rejects(context(conflict));
 }finally{await db.close();}
});

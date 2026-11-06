import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('mobile context authenticates current identities and sessions without relaxing account fences',async()=>{
 const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',sa='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 try {
  await db.exec(`create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);
   create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),not_after timestamptz);
   create table auth.identities(user_id uuid,provider text,identity_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;grant execute on function auth.uid(),storage.foldername(text) to authenticated;grant all on storage.objects to authenticated;`);
  for(const file of ['supabase/schema.sql',...(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>'supabase/migrations/'+f)])await db.exec((await readFile(file,'utf8')).replace(/create extension if not exists "pgcrypto";/g,''));
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data)values('${a}','current@example.invalid','{"full_name":"Current name"}'),('${b}','b@example.invalid','{}');insert into auth.sessions(id,user_id)values('${sa}','${a}'),('${sb}','${b}');`);
  const set=async(uid=a,sid=sa)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);select set_config('request.jwt.claims','${JSON.stringify({sub:uid,session_id:sid,role:'authenticated',email:'stale@example.invalid'})}',false);`);
  const get=async()=>(await db.query<{v:{user:{id:string;email:string;user_metadata:{full_name?:string}};access:string}}>('select public.rezlee_authenticated_mobile_context() v')).rows[0].v;
  await set();const value=await get();assert.equal(value.user.id,a);assert.equal(value.user.email,'current@example.invalid');assert.equal(value.user.user_metadata.full_name,'Current name');assert.equal(value.access,'active');
  await set(a,sb);await assert.rejects(get(),/Invalid session/);
  await set(a,'bad-session');await assert.rejects(get(),/Invalid session/);
  await db.exec(`reset role;update auth.users set banned_until=now()+interval '1 hour' where id='${a}';`);await set();await assert.rejects(get(),/Invalid session/);
  await db.exec(`reset role;update auth.users set banned_until=null,deleted_at=now() where id='${a}';`);await set();await assert.rejects(get(),/Invalid session/);
  await db.exec(`reset role;update auth.users set deleted_at=null where id='${a}';update auth.sessions set not_after=now()-interval '1 minute' where id='${sa}';`);await set();await assert.rejects(get(),/Invalid session/);
  await db.exec(`reset role;update auth.sessions set not_after=null where id='${sa}';insert into apple_account_state(user_id,apple_subject,reauthenticate_after)values('${a}','subject-a',extract(epoch from now())::bigint+1);`);await set();assert.equal((await get()).access,'reauthenticate');
  await db.exec(`reset role;delete from apple_account_state where user_id='${a}';select begin_rezlee_account_deletion('${a}',gen_random_uuid(),'${'a'.repeat(64)}');`);await set();assert.equal((await get()).access,'deleting');
  await db.exec(`reset role;delete from auth.sessions where id='${sa}';`);await set();await assert.rejects(get(),/Invalid session/);
  await set('33333333-3333-4333-8333-333333333333',sb);await assert.rejects(get(),/Invalid session/);
  await db.exec('reset role;set role anon');await assert.rejects(get(),/permission denied/);
 } finally {await db.close();}
});

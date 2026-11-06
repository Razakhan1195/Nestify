import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Apple account events isolate ownership, preserve household data, order relay changes and fence old sessions",async()=>{
 const db=new PGlite(),a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
 const old="33333333-3333-4333-8333-333333333333",fresh="44444444-4444-4444-8444-444444444444",other="55555555-5555-4555-8555-555555555555";
 const at=Math.floor(Date.now()/1000)-60;
 try{
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;
   create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
   create table auth.identities(user_id uuid references auth.users(id) on delete cascade,provider text,identity_data jsonb);
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;`);
  for(const f of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(x=>x.endsWith(".sql")).sort().map(x=>"supabase/migrations/"+x)])
   await db.exec((await readFile(f,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec("grant select on public.homes to authenticated");
  await db.query("insert into auth.users values($1,'a@privaterelay.appleid.com'),($2,'b@example.invalid')",[a,b]);
  await db.query("insert into auth.identities values($1,'apple',$2),($3,'apple',$4)",[a,JSON.stringify({sub:"apple-a",email:"a@privaterelay.appleid.com"}),b,JSON.stringify({sub:"apple-b",email:"b@privaterelay.appleid.com"})]);
  await db.query("insert into auth.sessions values($1,$2,to_timestamp($3)),($4,$2,to_timestamp($5)),($6,$7,to_timestamp($3))",[old,a,at-600,fresh,at+5,other,b]);
  await db.query("insert into homes(user_id,nickname)values($1,'A home'),($2,'B home')",[a,b]);
  await db.query("insert into apple_auth_grants(user_id,client_id,apple_subject,token_hash,token_cipher,created_at) values($1,'com.rezlee.fixture','apple-a',$2,$3,to_timestamp($4)),($1,'com.rezlee.fixture','apple-a',$5,$3,to_timestamp($6))",[a,"a".repeat(64),"cipher".repeat(8),at-100,"b".repeat(64),at+10]);
  let serial=0;
  const event=async(type:string,time=at,email:string|null=null,sub="apple-a",id?:string)=>{
   await db.exec("reset role");
   await db.query("select apply_rezlee_apple_event($1,$2,$3,$4,$5)",[id??(++serial).toString(16).padStart(64,"0"),sub,type,time,email]);
  };
  const signedIn=async(user:string,sid:string)=>{
   await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,session_id:sid,role:"authenticated",iat:at+1000})]);await db.exec("set role authenticated");
  };
  const allowed=async()=> (await db.query<{ok:boolean}>("select rezlee_session_allowed() as ok")).rows[0].ok;
  await signedIn(a,old);assert.equal(await allowed(),true);
  await event("consent-revoked");
  assert.equal((await db.query("select * from auth.users")).rows.length,2,"Authorization removal is not household/account deletion");
  assert.equal((await db.query("select * from homes")).rows.length,2);
  assert.equal((await db.query("select * from apple_auth_grants")).rows.length,1,"Only earlier revoked grants are removed");
  await signedIn(a,old);assert.equal(await allowed(),false,"Fresh JWT iat cannot rescue the original session");
  assert.equal((await db.query("select * from homes")).rows.length,0,"RLS fences still-valid access tokens");
  await assert.rejects(db.query("select check_rezlee_session()"),/sign-in changed/,"Pre-request hook fences privileged RPC entry");
  await signedIn(a,fresh);assert.equal(await allowed(),true);assert.equal((await db.query("select * from homes")).rows.length,1);
  await signedIn(b,other);assert.equal(await allowed(),true);assert.equal((await db.query("select * from homes")).rows.length,1);
  await event("email-enabled",at+1,"a@privaterelay.appleid.com");
  assert.equal((await db.query<{ok:boolean}>("select rezlee_apple_email_allowed('a@privaterelay.appleid.com') as ok")).rows[0].ok,true);
  await event("email-disabled",at+2,"a@privaterelay.appleid.com");
  await event("email-enabled",at+1,"a@privaterelay.appleid.com");
  await event("email-enabled",at+2,"a@privaterelay.appleid.com");
  assert.equal((await db.query<{ok:boolean}>("select rezlee_apple_email_allowed('a@privaterelay.appleid.com') as ok")).rows[0].ok,false,"Older or tied enable cannot override disable");
  await assert.rejects(event("email-disabled",at+3,"b@privaterelay.appleid.com"),/mismatch/);
  const count=(await db.query("select * from apple_account_events")).rows.length;
  await event("email-disabled",at+2,"a@privaterelay.appleid.com","apple-a","e".repeat(64));
  await event("consent-revoked",at+30,null,"apple-a","e".repeat(64));
  assert.equal((await db.query("select * from apple_account_events")).rows.length,count+1,"Duplicate JTI does not reapply");
  await signedIn(a,fresh);assert.equal(await allowed(),true,"Replayed event cannot revoke a fresh sign-in");
  await event("account-deleted",at+20,null,"unknown-subject");
  assert.equal((await db.query("select * from apple_account_state")).rows.length,1);
  await event("account-deleted",at+20);
  await signedIn(a,fresh);assert.equal(await allowed(),false);
  await db.exec("reset role");
  const state=(await db.query<{consent_status:string}>("select consent_status from apple_account_state where user_id=$1",[a])).rows[0];assert.equal(state.consent_status,"deleted");
  for(const role of ["anon","authenticated"]){
   await db.exec("set role "+role);
   await assert.rejects(db.query("select * from apple_account_state"));
   await assert.rejects(db.query("select apply_rezlee_apple_event($1,'apple-a','email-enabled',$2,'a@privaterelay.appleid.com')",["f".repeat(64),at+25]));
   await assert.rejects(db.query("select rezlee_apple_email_allowed('a@privaterelay.appleid.com')"));
   await db.exec("reset role");
  }
  await db.query("select begin_rezlee_account_deletion($1,$2,$3)",[a,"66666666-6666-4666-8666-666666666666","d".repeat(64)]);
  await event("email-disabled",at+30,"a@privaterelay.appleid.com");
  await event("consent-revoked",at+30);
  assert.equal((await db.query<{at:number}>("select consent_event_at as at from apple_account_state where user_id=$1",[a])).rows[0].at,at+20,"Late notifications do not recreate or update frozen account state");
  await db.query("delete from auth.users where id=$1",[a]);
  assert.equal((await db.query("select * from apple_account_state")).rows.length,0);
  assert.equal((await db.query("select * from apple_account_events where user_id is not null")).rows.length,0);
 }finally{await db.close();}
});

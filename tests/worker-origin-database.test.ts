import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("worker origin is explicit, exact and privileged; Gmail resumes at most three existing jobs",async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema vault;create schema net;create schema extensions;
   create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
   create table public.calls(id bigint generated always as identity,url text,headers jsonb,body jsonb);
   create function extensions.hmac(text,text,text) returns bytea language sql as $$select decode(repeat('ab',32),'hex')$$;
   create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into public.calls(url,headers)values(url,headers)returning id$$;
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into public.calls(url,headers,body)values(url,headers,body)returning id$$;
   create table public.homes(id uuid primary key,user_id uuid);
   create table public.gmail_memory_links(id uuid primary key,user_id uuid,home_id uuid,status text,token_cipher text,work jsonb,next_run timestamptz,lease_until timestamptz);
   create function public.rezlee_account_active(uuid) returns boolean language sql as $$select $1<>'00000000-0000-4000-8000-000000000099'::uuid$$;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202610130008_worker_origin_and_gmail_recovery.sql",import.meta.url),"utf8"));
  const value=async(s:string)=>(await db.query<{v:number}>(s)).rows[0].v;
  assert.equal(await value("select public.enqueue_rezlee_account_deletion_recovery()::integer v"),0);
  assert.equal(await value("select public.dispatch_rezlee_pending_gmail() v"),0);
  await db.exec("insert into vault.decrypted_secrets values('rezlee_worker_origin','https://staging.rezlee.com.attacker.invalid'),('rezlee_app_notification_worker_secret',repeat('s',40)),('rezlee_gmail_pending_origin','https://staging.rezlee.com.attacker.invalid'),('rezlee_gmail_pending_token',repeat('t',40))");
  assert.equal(await value("select public.enqueue_rezlee_account_deletion_recovery()::integer v"),0);
  assert.equal(await value("select public.dispatch_rezlee_pending_gmail() v"),0);
  for(const origin of ["https://staging.rezlee.com","https://rezlee.com"]){
   await db.query("update vault.decrypted_secrets set decrypted_secret=$1 where name='rezlee_worker_origin'",[origin]);
   assert.ok(await value("select public.enqueue_rezlee_account_deletion_recovery()::integer v"));
   const call=(await db.query<{url:string;headers:Record<string,string>}>("select url,headers from calls order by id desc limit 1")).rows[0];
   assert.equal(call.url,origin+"/api/account-deletion/worker");assert.deepEqual(Object.keys(call.headers).sort(),["x-rezlee-deletion-signature","x-rezlee-deletion-time"]);assert.ok(!JSON.stringify(call).includes("s".repeat(40)));
  }
  await db.exec("set role authenticated");
  await assert.rejects(db.exec("select public.enqueue_rezlee_account_deletion_recovery()"),/permission denied/);
  await assert.rejects(db.exec("select public.dispatch_rezlee_pending_gmail()"),/permission denied/);
  await db.exec("reset role;truncate calls;update vault.decrypted_secrets set decrypted_secret='https://staging.rezlee.com' where name='rezlee_gmail_pending_origin'");
  const u="00000000-0000-4000-8000-000000000001",h="00000000-0000-4000-8000-000000000002";
  await db.query("insert into homes values($1,$2)",[h,u]);
  for(let i=1;i<=8;i++)await db.query("insert into gmail_memory_links values($1,$2,$3,'active','fixture-cipher',$4,now()-interval '1 hour',$5)",["10000000-0000-4000-8000-"+String(i).padStart(12,"0"),u,h,JSON.stringify({phase:i===7?"idle":"read"}),i===8?"2099-01-01":null]);
  assert.equal(await value("select public.dispatch_rezlee_pending_gmail() v"),3);
  assert.equal(await value("select count(*)::integer v from calls"),3);
  assert.equal(await value("select count(*)::integer v from calls where url='https://staging.rezlee.com/api/integrations/gmail/worker' and body->>'id' is not null"),3);
  await db.exec("truncate calls;update vault.decrypted_secrets set decrypted_secret='short' where name='rezlee_gmail_pending_token'");
  assert.equal(await value("select public.dispatch_rezlee_pending_gmail() v"),0);
 }finally{await db.close();}
});

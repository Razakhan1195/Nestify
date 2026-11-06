import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {safeNotificationHref,localNotificationTime,validTimezone,defaultNotificationPreferences} from "../src/lib/notifications/policy";
test("supported destinations and local-date boundaries",()=>{
 assert.equal(safeNotificationHref("https://example.com"),null);assert.equal(safeNotificationHref("/provider/../../account"),null);
 assert.equal(safeNotificationHref("/bill/11111111-1111-4111-8111-111111111111"),"/bill/11111111-1111-4111-8111-111111111111");
 assert.equal(safeNotificationHref("/recalls"),"/recalls");assert.equal(validTimezone("not/a-zone"),false);
 assert.deepEqual(localNotificationTime("America/Toronto",new Date("2026-10-04T02:00:00Z")),{date:"2026-10-03",hour:22});
 assert.deepEqual(localNotificationTime("America/Vancouver",new Date("2026-10-04T14:00:00Z")),{date:"2026-10-04",hour:7});
 assert.equal(defaultNotificationPreferences.bills,false);assert.equal(defaultNotificationPreferences.care,false);
});
test("shared notifications deduplicate, exclude handled history, resolve stale reminders and enforce user ownership",async()=>{
 const db=new PGlite(),u="11111111-1111-4111-8111-111111111111",v="22222222-2222-4222-8222-222222222222",h="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",p="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 try{
 await db.exec("create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;");
 for(const f of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>"supabase/migrations/"+f)])await db.exec((await readFile(f,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
 await db.query("insert into auth.users values($1,'one@example.invalid'),($2,'two@example.invalid')",[u,v]);
 await db.query("insert into homes(id,user_id,nickname)values($1,$2,'Home')",[h,u]);await db.query("insert into providers(id,user_id,home_id,name)values($1,$2,$3,'Rogers')",[p,u,h]);
 for(const [name,status,payment,autopay] of [["due","upcoming","unpaid","unknown"],["paid","paid","paid","unknown"],["history","archived","unpaid","unknown"],["scheduled","upcoming","scheduled","unknown"],["autopay","upcoming","unpaid","enabled"]]){
  await db.query("insert into bills(user_id,home_id,name,amount,due_date,status,payment_status,autopay_status)values($1,$2,$3,80,'2026-10-07',$4,$5,$6)",[u,h,name,status,payment,autopay]);
 }
 await db.query("insert into maintenance_tasks(user_id,home_id,title,due_date,status)values($1,$2,'Filter reminder','2026-10-04','open'),($1,$2,'Old task','2026-09-01','open'),($1,$2,'Finished task','2026-10-04','completed')",[u,h]);
 await db.query("select refresh_rezlee_notifications($1,'2026-10-04')",[u]);await db.query("select refresh_rezlee_notifications($1,'2026-10-04')",[u]);
 const rows=(await db.query<{category:string}>("select category from notifications where user_id=$1",[u])).rows;assert.deepEqual(rows.map(n=>n.category).sort(),["bills","care"]);
 await db.query("update bills set payment_status='paid' where user_id=$1 and name='due'",[u]);await db.query("update maintenance_tasks set status='completed'where user_id=$1 and title='Filter reminder'",[u]);
 await db.query("select refresh_rezlee_notifications($1,'2026-10-04')",[u]);assert.equal((await db.query("select id from notifications where user_id=$1 and resolved_at is null",[u])).rows.length,0);
 const job=(await db.query<{id:string}>("insert into deck_telecom_imports(user_id,home_id,provider_id,phases,status,challenge_key,since_date,until_date)values($1,$2,$3,'[]','verification','abc','2025-10-04','2026-10-04')returning id",[u,h,p])).rows[0].id;
 await db.query("insert into deck_telecom_pushes(user_id,provider_id,import_id,event_key,kind,title,body,expires_at)values($1,$2,$3,$4,'verification','Verify with Rogers','Open the app.',now()+interval '5 minutes')",[u,p,job,job+":verify:abc"]);
 assert.equal((await db.query("select id from notifications where notification_type='connection_verification' and resolved_at is null")).rows.length,1);
 await db.query("update deck_telecom_imports set status='running'where id=$1",[job]);assert.equal((await db.query("select id from notifications where notification_type='connection_verification' and resolved_at is null")).rows.length,0);
 await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
 await db.query("insert into notification_preferences(user_id,bills)values($1,true)",[u]);await assert.rejects(db.query("insert into notification_preferences(user_id,bills)values($1,true)",[v]),/row-level security/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[v]);assert.equal((await db.query("select * from notification_preferences")).rows.length,0);
 await assert.rejects(db.query("select refresh_rezlee_notifications($1,'2026-10-04')",[u]),/permission denied/);
 }finally{await db.close();}
});

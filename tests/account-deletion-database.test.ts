import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Disposable PostgreSQL, full application schema. Storage/Auth service calls are
// NOT exercised here; table operations simulate their confirmed server result.
test("account deletion isolates tenants, freezes writes, survives retries and preserves another household", async () => {
 const db = new PGlite();
 const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
 const ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const job="dddddddd-dddd-4ddd-8ddd-dddddddddddd", member="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", hash="a".repeat(64);
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
  // New account-owned tables must participate in the freeze. Service-only
  // deletion journals/leases and the accounting reservation ledger are explicit exceptions.
  const unguarded=await db.query<{name:string}>(`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
   and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped)
   and c.relname not in ('account_deletion_jobs','account_operation_leases','account_deck_providers','gmail_import_ai_reservations')
   and not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and p.proname='guard_deleting_rezlee_account')`);
  assert.deepEqual(unguarded.rows,[], "An account-owned table is missing the deletion write freeze");
  const tables=await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public'");
  for(const row of tables.rows) await db.exec(`grant select,insert,update,delete on public."${row.tablename}" to authenticated,service_role`);
  await db.exec(`insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','Owner home'),('${hb}','${b}','Member own home');
   insert into public.bills(user_id,home_id,name,amount) values('${a}','${ha}','Owner bill',100),('${b}','${hb}','Member bill',200);
   insert into public.household_members(id,home_id,created_by_user_id,linked_user_id,display_name,email,role,status)
   values('${member}','${ha}','${a}','${b}','Member','b@example.invalid','member','active');
   insert into public.maintenance_tasks(user_id,home_id,title,status,assigned_member_id) values('${a}','${ha}','Shared task','open','${member}');
   insert into storage.objects(bucket_id,name) values('rezlee-documents','${b}/${hb}/orphan.pdf');
   set role authenticated; set request.jwt.claim.sub='${a}';`);
  await assert.rejects(db.exec(`select public.begin_rezlee_account_deletion('${b}','${job}','${hash}')`),/permission denied/);
  assert.equal((await db.query("select * from public.account_deletion_jobs")).rows.length,0);
  await db.exec("reset role");
  const provider="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`insert into public.providers(id,user_id,home_id,name) values('${provider}','${b}','${hb}','Test provider');
   select public.remember_rezlee_deck_provider('${b}','${provider}');
   insert into public.provider_sync_runs(user_id,home_id,provider_id,status,deck_task_run_id) values('${b}','${hb}','${provider}','completed','trun_test');
   insert into public.deck_events(deck_event_id,event_type,task_run_id,payload) values('evt_before','task_run.completed','trun_test','{"sensitive":"test-only"}');`);
  await db.exec(`insert into public.notification_preferences(user_id,push_enabled) values('${b}',false);
   insert into public.cleaning_routines(user_id,home_id,title,timezone,definition) values('${b}','${hb}','Private routine','America/Toronto','{}');
   insert into public.documents(id,user_id,home_id,title) values('99999999-9999-4999-8999-999999999999','${b}','${hb}','Private quote');
   insert into public.documents(id,user_id,home_id,title) values('88888888-8888-4888-8888-888888888888','${b}','${hb}','Linked invoice');
   insert into public.quote_reviews(document_id,user_id,home_id,source_version,invoice_id) values('99999999-9999-4999-8999-999999999999','${b}','${hb}',now(),'88888888-8888-4888-8888-888888888888');`);
  const op=await db.query<{id:string}>(`select public.start_rezlee_account_operation('${b}') id`);
  await assert.rejects(db.exec(`select public.begin_rezlee_account_deletion('${b}','${job}','${hash}')`),/still running/);
  await db.exec(`delete from public.account_operation_leases where id='${op.rows[0].id}'`);
  await db.exec(`select public.begin_rezlee_account_deletion('${b}','${job}','${hash}'); select public.begin_rezlee_account_deletion('${b}','${job}','${hash}')`);
  assert.equal((await db.query("select * from public.account_deletion_jobs")).rows.length,1);
  assert.equal((await db.query("select * from public.deck_events")).rows.length,0);
  await db.exec(`insert into public.deck_events(deck_event_id,event_type,task_run_id,payload) values('evt_after','task_run.completed','trun_test','{"sensitive":"late-test-only"}')`);
  assert.equal((await db.query("select * from public.deck_events")).rows.length,0);
  assert.equal((await db.query("select * from public.account_deletion_resources where kind='deck'")).rows.length,1);
  await assert.rejects(db.exec(`select public.begin_rezlee_account_deletion('${b}',gen_random_uuid(),'${hash}')`),/already requested/);
  await assert.rejects(db.exec(`select public.start_rezlee_account_operation('${b}')`),/unavailable/);
  await assert.rejects(db.exec(`insert into public.bills(user_id,home_id,name) values('${b}','${hb}','late webhook')`),/being deleted/);
  await assert.rejects(db.exec(`update public.notification_preferences set bills=true where user_id='${b}'`),/being deleted/);
  await assert.rejects(db.exec(`update public.quote_reviews set read_status='ready' where user_id='${b}'`),/being deleted/);
  await assert.rejects(db.exec(`update public.cleaning_routines set title='Late edit' where user_id='${b}'`),/being deleted/);
  await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('rezlee-documents','${b}/${hb}/late.pdf')`),/unavailable/);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query("select * from public.notification_preferences")).rows.length,0);
  assert.equal((await db.query("select * from public.cleaning_routines")).rows.length,0);
  assert.equal((await db.query("select * from public.quote_reviews")).rows.length,0);
  assert.equal((await db.query("select * from public.homes")).rows.length,0);
  assert.equal((await db.query("select * from public.bills")).rows.length,0);
  assert.equal((await db.query("select * from storage.objects")).rows.length,0);
  assert.equal((await db.query(`delete from public.account_deletion_jobs where id='${job}' returning id`)).rows.length,0);
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${a}'`);
  assert.equal((await db.query("select * from public.bills")).rows.length,1);
  await db.exec("reset role");
  const lease1="ffffffff-ffff-4fff-8fff-fffffffffff1", lease2="ffffffff-ffff-4fff-8fff-fffffffffff2";
  const c1=await db.query<{job:unknown}>(`select public.claim_rezlee_account_deletion('${job}','${lease1}') job`);
  const c2=await db.query<{job:unknown}>(`select public.claim_rezlee_account_deletion('${job}','${lease2}') job`);
  assert.ok(c1.rows[0].job); assert.equal(c2.rows[0].job,null);
  const files=await db.query<{name:string}>(`select * from public.rezlee_deletion_file_batch('${b}')`);
  assert.deepEqual(files.rows.map(x=>x.name),[`${b}/${hb}/orphan.pdf`]);
  await db.exec(`update public.account_deletion_jobs set phase='account' where id='${job}'; select public.clean_rezlee_account_links('${b}')`);
  const task=await db.query<{assigned_member_id:string|null}>("select assigned_member_id from public.maintenance_tasks where title='Shared task'");
  assert.equal(task.rows[0].assigned_member_id,null);
  assert.equal((await db.query(`select * from public.household_members where linked_user_id='${b}' or email='b@example.invalid'`)).rows.length,0);
  await db.exec(`delete from storage.objects where name like '${b}/%'; delete from auth.users where id='${b}';
    update public.account_deletion_jobs set status='completed',user_id=null,completed_at=now() where id='${job}'`);
  assert.equal((await db.query(`select * from public.homes where id='${ha}'`)).rows.length,1);
  assert.equal((await db.query(`select * from public.homes where id='${hb}'`)).rows.length,0);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query("select * from public.homes")).rows.length,0);
  await assert.rejects(db.exec(`insert into public.homes(user_id,nickname) values('${b}','stale JWT')`));
  await db.exec(`reset role; select public.begin_rezlee_account_deletion('${a}',gen_random_uuid(),'${hash}');
    update public.account_deletion_jobs set phase='account' where user_id='${a}';
    select public.clean_rezlee_account_links('${a}'); delete from auth.users where id='${a}'`);
  assert.equal((await db.query("select * from public.maintenance_tasks")).rows.length,0);
  assert.equal((await db.query("select * from public.bills")).rows.length,0);
 } finally { await db.close(); }
});

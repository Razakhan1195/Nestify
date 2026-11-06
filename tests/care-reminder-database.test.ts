import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("reminder save is atomic, owner-scoped, replay-safe and preserves twice-yearly recurrence",async()=>{
 const db=new PGlite();const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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

 await db.exec(`insert into auth.users values('${a}','owner@example.invalid'),('${b}','other@example.invalid');insert into homes(id,user_id,nickname)values('${ha}','${a}','Test home');set role authenticated;set request.jwt.claim.sub='${a}';`);
 const input={title:"Synthetic reminder",category:"General",due_date:"2026-10-01",recurrence:"biannual",description:"x".repeat(1000),relevance:"Relevant note",priority:"normal"};
 async function save(key:string,values:unknown=input){return(await db.query<{value:{ok:boolean;id?:string;removed?:boolean}}>(`select save_rezlee_care_reminder($1,$2,$3::jsonb) as value`,[ha,key,JSON.stringify(values)])).rows[0].value;}
 const first=await save('same-save-key');assert.equal(first.ok,true);assert.deepEqual(await save('same-save-key'),first);
 assert.equal((await db.query("select id from maintenance_tasks")).rows.length,1);assert.equal((await db.query("select id from timeline_events where event_type='maintenance_added'")).rows.length,1);
 const data=(await db.query<{description:string;recurrence:string}>("select description,recurrence from maintenance_tasks")).rows[0];assert.equal(data.description,"x".repeat(1000)+"\nApplies to: Relevant note");assert.equal(data.recurrence,'biannual');
 await assert.rejects(save('same-save-key',{...input,title:'Changed'}));
 await db.exec(`set request.jwt.claim.sub='${b}'`);await assert.rejects(save('foreign-save'));assert.equal((await db.query('select * from care_plan_receipts')).rows.length,0);
 await db.exec(`set request.jwt.claim.sub='${a}'`);await assert.rejects(save('invalid-date',{...input,due_date:'2026-02-31'}));assert.equal((await db.query("select * from care_plan_receipts where request_id='invalid-date'")).rows.length,0);
 await assert.rejects(save('invalid-repeat',{...input,recurrence:'sometimes'}));
 for(const cadence of ['biannual','semiannual']){
  const task=(await db.query<{id:string}>(`insert into maintenance_tasks(user_id,home_id,title,recurrence,due_date,status)values('${a}','${ha}','Cadence check','${cadence}',current_date,'open')returning id`)).rows[0];
  const completed=(await db.query<{value:{next_date:string;next_task_id:string}}>(`select complete_rezlee_task('${task.id}') as value`)).rows[0].value;
  const expected=(await db.query<{value:string}>("select (current_date+interval '6 months')::date::text as value")).rows[0].value;assert.equal(completed.next_date,expected);assert.ok(completed.next_task_id);
 }
 await db.exec(`delete from maintenance_tasks where id='${first.id}'`);assert.deepEqual(await save('same-save-key'),{ok:false,removed:true});
 assert.equal((await db.query("select id from maintenance_tasks where title='Synthetic reminder'")).rows.length,0);
 }finally{await db.close();}
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("phone approval and cleaning routine lifecycle in PostgreSQL", async () => {
 const db = new PGlite();
 const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222", c="33333333-3333-4333-8333-333333333333", home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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


 await db.exec(`insert into auth.users values('${a}','owner@example.invalid'),('${b}','member@example.invalid'),('${c}','other@example.invalid');insert into homes(id,user_id,nickname)values('${home}','${a}','Test home');`);
 async function login(id:string,email:string){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}';set request.jwt.claim.email='${email}';`);}
 async function value<T = unknown>(sql:string,args:unknown[]=[]){return (await db.query<{result:T}>(sql,args)).rows[0].result;}
 await login(a,'owner@example.invalid');
 const hash='a'.repeat(64), key='99999999-9999-4999-8999-999999999999';
 const created=await value<{memberId:string}>('select create_rezlee_phone_invite($1,$2,$3,$4,$5,$6,null) result',[home,key,hash,'+14165550123','Member','Partner']);
 assert.deepEqual(await value('select create_rezlee_phone_invite($1,$2,$3,$4,$5,$6,null) result',[home,key,hash,'+14165550123','Member','Partner']),created);
 await login(b,'member@example.invalid');
 assert.equal((await value<{state:string}>('select request_rezlee_phone_invite($1,false) result',[hash])).state,'pending');
 assert.equal((await db.query('select id from homes')).rows.length,0);
 assert.equal((await value<{state:string}>('select request_rezlee_phone_invite($1,true) result',[hash])).state,'awaiting_approval');
 assert.equal((await db.query('select id from homes')).rows.length,0);
 await assert.rejects(value<{ok:boolean}>('select approve_rezlee_phone_invite($1,$2) result',[created.memberId,b]));
 await login(c,'other@example.invalid');assert.equal((await value<{state:string}>('select request_rezlee_phone_invite($1,true) result',[hash])).state,'unavailable');
 await login(a,'owner@example.invalid');await assert.rejects(value<{ok:boolean}>('select approve_rezlee_phone_invite($1,$2) result',[created.memberId,c]));
 assert.equal((await value<{ok:boolean}>('select approve_rezlee_phone_invite($1,$2) result',[created.memberId,b])).ok,true);
 await login(b,'member@example.invalid');assert.equal((await value<{state:string}>('select request_rezlee_phone_invite($1,false) result',[hash])).state,'accepted');assert.equal((await db.query('select id from homes')).rows.length,1);
 await login(a,'owner@example.invalid');
 const ownerMember=(await db.query<{id:string}>(`select id from household_members where home_id='${home}' and linked_user_id='${a}' and role='owner' and status='active'`)).rows[0].id;
 const routineId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const spec={key:'task-key-001',title:'Clean counters',room:'Kitchen',start:'2026-01-31',unit:'month',every:1,weekdays:[],rotation:'monthly',members:[ownerMember,created.memberId]};
 assert.equal(await value('select rezlee_cleaning_next_date($1::jsonb,$2::date,false)::text result',[JSON.stringify(spec),'2026-01-31']),'2026-02-28');
 assert.equal(await value('select rezlee_cleaning_next_date($1::jsonb,$2::date,false)::text result',[JSON.stringify(spec),'2026-02-28']),'2026-03-31');
 const week={...spec,start:'2026-03-02',unit:'week',every:2,weekdays:[1,4]};
 assert.equal(await value('select rezlee_cleaning_next_date($1::jsonb,$2::date,false)::text result',[JSON.stringify(week),'2026-03-05']),'2026-03-16');
 const values={title:'Our routine',timezone:'America/Toronto',state:'active',tasks:[spec]};
 async function save(key:string,version:number,content=values,current=false){return value<{version:number}>('select save_rezlee_cleaning_routine($1,$2,$3,$4,$5::jsonb,$6) result',[home,key,routineId,version,JSON.stringify(content),current]);}
 const first=await save('routine-create-01',0);assert.equal(first.version,1);assert.deepEqual(await save('routine-create-01',0),first);
 const task=(await db.query<{id:string}>(`select id from maintenance_tasks where cleaning_routine_id='${routineId}'`)).rows[0];
 const snapshot=(await db.query<{title:string;category:string;due_date:string;recurrence:string}>(`select title,category,due_date::text,recurrence from maintenance_tasks where id='${task.id}'`)).rows[0];
 const editValues={...snapshot,title:'Counter wipe'};
 assert.equal((await value<{ok:boolean}>('select edit_rezlee_care_task($1,$2::jsonb,$3::jsonb) result',[task.id,JSON.stringify(snapshot),JSON.stringify(editValues)])).ok,true);
 assert.equal((await value<{ok:boolean}>('select edit_rezlee_care_task($1,$2::jsonb,$3::jsonb) result',[task.id,JSON.stringify(snapshot),JSON.stringify(editValues)])).ok,true);
 await assert.rejects(value<{ok:boolean}>('select edit_rezlee_care_task($1,$2::jsonb,$3::jsonb) result',[task.id,JSON.stringify(snapshot),JSON.stringify({...editValues,title:'Stale overwrite'})]));
 const completed=await value<{completed:boolean;next_task_id:string|null}>('select complete_rezlee_task($1) result',[task.id]);assert.equal(completed.completed,true);assert.ok(completed.next_task_id);
 assert.equal((await value<{completed:boolean;next_task_id:string|null}>('select complete_rezlee_task($1) result',[task.id])).completed,false);
 assert.equal((await db.query(`select id from maintenance_tasks where cleaning_routine_id='${routineId}' and status<>'completed'`)).rows.length,1);
 await save('routine-edit-001',1,{...values,tasks:[{...spec,title:'Wipe counters'}]});
 assert.equal((await db.query<{title:string}>(`select title from maintenance_tasks where id='${task.id}'`)).rows[0].title,'Counter wipe');
 await assert.rejects(save('stale-edit-key',1));
 await save('routine-pause-01',2,{...values,state:'paused'});
 const noRepeat=await value<{completed:boolean;next_task_id:string|null}>('select complete_rezlee_task($1) result',[completed.next_task_id]);assert.equal(noRepeat.next_task_id,null);
 await save('routine-resume-1',3);assert.equal((await db.query(`select id from maintenance_tasks where cleaning_routine_id='${routineId}' and status<>'completed'`)).rows.length,1);
 await login(b,'member@example.invalid');await assert.rejects(save('member-cant-edit',4));
 await login(c,'other@example.invalid');assert.equal((await db.query('select * from cleaning_routines')).rows.length,0);await assert.rejects(value<{completed:boolean;next_task_id:string|null}>('select complete_rezlee_task($1) result',[completed.next_task_id]));
 await login(a,'owner@example.invalid');await db.exec(`delete from household_members where id='${created.memberId}'`);
 await login(b,'member@example.invalid');assert.equal((await value<{state:string}>('select request_rezlee_phone_invite($1,false) result',[hash])).state,'unavailable');assert.equal((await db.query('select id from homes')).rows.length,0);
 } finally { await db.close(); }
});

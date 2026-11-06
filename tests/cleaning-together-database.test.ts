import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("cleaning together: managed people, six-person turns, owner boundaries and pause/resume use actual SQL",async()=>{
 const db=new PGlite();
 const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",foreign="33333333-3333-4333-8333-333333333333",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",routine="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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


 await db.exec(`insert into auth.users values('${owner}','owner@example.invalid'),('${member}','member@example.invalid'),('${foreign}','foreign@example.invalid');
 insert into homes(id,user_id,nickname,city) values('${home}','${owner}','Our place','Toronto');
 set role authenticated; set request.jwt.claim.sub='${owner}';`);
 const people:string[]=[];
 for(let i=0;i<6;i++){
  const id=`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12,"0")}`;people.push(id);
  const result=await db.query<{person:{id:string;status:string;linked_user_id:null;email:null}}>("select rezlee_add_managed_care_person($1,$2,$3) person",[home,id,`Person ${i}`]);
  assert.equal(result.rows[0].person.status,"local");assert.equal(result.rows[0].person.linked_user_id,null);assert.equal(result.rows[0].person.email,null);
 }
 await db.query("select rezlee_add_managed_care_person($1,$2,$3)",[home,people[0],"Person 0"]);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from household_members where home_id=$1 and status='local'",[home])).rows[0].n,6);
 await assert.rejects(db.query("select rezlee_add_managed_care_person($1,$2,$3)",[home,"dddddddd-dddd-4ddd-8ddd-dddddddddddd","person 0"]));
 const today=(await db.query<{date_text:string}>("select (now() at time zone 'America/Toronto')::date::text as date_text")).rows[0].date_text;
 const values={title:"Cleaning together",timezone:"America/Toronto",state:"active",tasks:[{key:"family-tidy",title:"Put away books and toys",room:"Living spaces",start:today,unit:"day",every:1,weekdays:[],members:people,rotation:"weekly"}]};
 const save=(version:number,request:string)=>db.query<{result:{version:number}}>("select save_rezlee_cleaning_routine($1,$2,$3,$4,$5::jsonb,false) result",[home,request,routine,version,JSON.stringify(values)]);
 assert.equal((await save(0,"first-save-key")).rows[0].result.version,1);
 await save(0,"first-save-key");
 const task=(await db.query<{id:string;assigned_member_id:string}>("select id,assigned_member_id from maintenance_tasks where cleaning_routine_id=$1 and status<>'completed'",[routine])).rows;
 assert.equal(task.length,1);assert.equal(task[0].assigned_member_id,people[0]);
 await db.exec(`set request.jwt.claim.sub='${foreign}'`);
 await assert.rejects(db.query("select rezlee_add_managed_care_person($1,$2,$3)",[home,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","Outside"]));
 await assert.rejects(db.query("select complete_rezlee_task($1)",[task[0].id]));
 await assert.rejects(save(1,"foreign-save-key"));
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 values.state="paused";await save(1,"pause-routine-key");
 assert.equal((await db.query<{n:number}>("select count(*)::int n from maintenance_tasks where cleaning_routine_id=$1 and status<>'completed'",[routine])).rows[0].n,1);
 const done=await db.query<{result:{completed:boolean;next_date:null}}>("select complete_rezlee_task($1) result",[task[0].id]);
 assert.equal(done.rows[0].result.completed,true);assert.equal(done.rows[0].result.next_date,null);
 values.state="active";await save(2,"resume-routine-key");
 assert.equal((await db.query<{n:number}>("select count(*)::int n from maintenance_tasks where cleaning_routine_id=$1 and status<>'completed'",[routine])).rows[0].n,1);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from maintenance_tasks where cleaning_routine_id=$1 and status='completed'",[routine])).rows[0].n,1);
 await db.query("delete from household_members where id=$1",[people[0]]);
 await assert.rejects(save(3,"removed-person-key"));
 }finally{await db.close();}
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
async function database(){const db=new PGlite();
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


return db;}


test("expense participants retain identity through invitation, acceptance, cancellation and removal",async()=>{
 const db=await database();
 const owner="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",foreign="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 try{
 await db.exec(`create or replace function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
 insert into auth.users values('${owner}','owner@example.invalid'),('${user}','alex@example.invalid'),('${other}','other@example.invalid');
 insert into homes(id,user_id,nickname)values('${home}','${owner}','QA'),('${foreign}','${other}','Other');`);
 const login=async(id=owner,email="owner@example.invalid")=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}';set request.jwt.claim.email='${email}';`);
 await login();
 let n=0;
 const mutate=async(c:unknown)=>(await db.query<{r:{id:string}}>("select rezlee_mutate_shared_expense($1,$2,$3::jsonb) r",[home,"link-test-"+(++n),JSON.stringify(c)])).rows[0].r;
 const people=async()=>(await db.query<{r:{id:string;memberId:string|null;state:string;self:boolean;inviteExpired:boolean}[]}>("select rezlee_expense_people($1) r",[home])).rows[0].r;
 const balances=async()=>(await db.query<{r:{from:string;to:string;cents:number}[]}>("select rezlee_expense_balances($1) r",[home])).rows[0].r;
 const invite=async(id:string,email="alex@example.invalid",h=home)=>(await db.query<{r:{id:string}}>("select rezlee_prepare_expense_invite($1,$2,$3,$4) r",[h,id,email,"Roommate"])).rows[0].r;
 const alex=await mutate({operation:"add_person",name:"Alex"});
 const day=(await db.query<{day:string}>("select current_date::text as day")).rows[0].day;
 const details={title:"Internet",amountCents:10000,paidBy:owner,happenedOn:day,note:"",shares:[{personId:owner,cents:5000},{personId:alex.id,cents:5000}]};
 await mutate({operation:"create",kind:"expense",details});
 const original=await balances();assert.deepEqual(original,[{from:alex.id,to:owner,cents:5000}]);
 await assert.rejects(invite(alex.id,"owner@example.invalid"));
 await assert.rejects(invite(alex.id,"bad email"));
 await assert.rejects(invite(alex.id,"alex@example.invalid",foreign),{code:"42501"});
 await login(other,"other@example.invalid");await assert.rejects(invite(alex.id),{code:"42501"});await login();
 const pending=await invite(alex.id);
 assert.equal((await people()).length,2);assert.equal((await people()).find(p=>p.id===alex.id)?.state,"invited");
 assert.deepEqual(await balances(),original);
 await assert.rejects(invite(alex.id),{code:"PT409"});
 await assert.rejects(mutate({operation:"archive_person",id:alex.id}));
 // Cancelling a pending invitation keeps both name and debt available.
 await db.query("delete from household_members where id=$1",[pending.id]);
 assert.equal((await people()).find(p=>p.id===alex.id)?.state,"local");assert.deepEqual(await balances(),original);
 const expiring=await invite(alex.id);
 await db.query("update household_members set invite_sent_at=now()-interval '8 days' where id=$1",[expiring.id]);
 assert.equal((await people()).find(p=>p.id===alex.id)?.inviteExpired,true);
 await login(user,"alex@example.invalid");
 assert.equal((await db.query("select id from shared_expense_entries")).rows.length,0);
 await assert.rejects(db.query("select accept_household_invite($1)",[expiring.id]));
 await login();await db.query("delete from household_members where id=$1",[expiring.id]);
 const active=await invite(alex.id);
 await login(other,"other@example.invalid");await assert.rejects(db.query("select accept_household_invite($1)",[active.id]));
 await login(user,"alex@example.invalid");
 await db.query("select accept_household_invite($1)",[active.id]);
 await db.query("select accept_household_invite($1)",[active.id]); // replay
 const joined=await people();assert.equal(joined.length,2);assert.equal(joined.find(p=>p.self)?.id,alex.id);assert.equal(joined.find(p=>p.self)?.state,"member");
 assert.deepEqual(await balances(),original);assert.equal((await db.query("select id from shared_expense_entries")).rows.length,1);
 // A linked participant is recognized as payer/debtor by the existing permission checks.
 await mutate({operation:"create",kind:"repayment",details:{from:alex.id,to:owner,amountCents:2000,happenedOn:day,note:"Recorded transfer"}});
 assert.deepEqual(await balances(),[{from:alex.id,to:owner,cents:3000}]);
 await login();await db.query("delete from household_members where id=$1",[active.id]);
 assert.equal((await people()).find(p=>p.id===alex.id)?.state,"former");assert.deepEqual(await balances(),[{from:alex.id,to:owner,cents:3000}]);
 await assert.rejects(invite(alex.id));await assert.rejects(mutate({operation:"create",kind:"expense",details}));
 await login(user,"alex@example.invalid");assert.equal((await db.query("select id from shared_expense_entries")).rows.length,0);
 await assert.rejects(mutate({operation:"create",kind:"expense",details}));
 await login();
 const returning=await mutate({operation:"add_person",name:"Returning Alex"});
 const relink=await invite(returning.id);
 await login(user,"alex@example.invalid");await db.query("select accept_household_invite($1)",[relink.id]);
 await db.exec("reset role");await db.query("delete from auth.users where id=$1",[user]);
 await login();assert.equal((await people()).find(p=>p.id===returning.id)?.state,"former");
 await assert.rejects(mutate({operation:"create",kind:"expense",details:{...details,shares:[{personId:returning.id,cents:10000}]}}));
 await db.exec("reset role;set role anon");await assert.rejects(invite(alex.id));
 }finally{await db.close();}
});

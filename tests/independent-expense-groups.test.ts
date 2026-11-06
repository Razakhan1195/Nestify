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

test("independent groups preserve financial history without granting household access",async(t)=>{
 const db=await database();
 const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333";
 let n=0,g="",self="",alex="",entry="",repayment="";
 const login=async(id=owner)=>db.exec("reset role;set role authenticated;set request.jwt.claim.sub='"+id+"'");
 const key=()=> "group-test-"+(++n);
 const call=async<T>(name:string,args:unknown[],types:string[]) =>(await db.query<{r:T}>("select "+name+"("+types.map((v,i)=>"$"+(i+1)+"::"+v).join(",")+") r",args)).rows[0].r;
 const create=(name:string,k=key())=>call<{ok:boolean;groupId:string}>("rezlee_create_expense_group",[k,name],["text","text"]);
 const manage=(command:unknown,k=key(),id=g)=>call<{ok:boolean;inviteCode:string;groupId:string}>("rezlee_manage_expense_group",[id,k,JSON.stringify(command)],["uuid","text","jsonb"]);
 const mutate=(command:unknown,k=key(),id=g)=>call<{ok:boolean;id:string;version:number}>("rezlee_mutate_group_expense",[id,k,JSON.stringify(command)],["uuid","text","jsonb"]);
 const read=(id=g,entryId:string|null=null,before:string|null=null)=>call<{home:{id:string};groupId:string;archived:boolean;role:string;people:{id:string;self:boolean;state:string}[];balances:{from:string;to:string;cents:number}[];entries:{id:string;version:number;voided:boolean;canEdit:boolean;details:Record<string,unknown>}[];changes:unknown[];nextCursor:string|null}>("rezlee_read_expense_group",[id,entryId,before],["uuid","uuid","uuid"]);
 const accept=(code:string)=>call<{ok:boolean;groupId:string}>("rezlee_accept_expense_group_invite",[code],["uuid"]);
 try{
 await db.exec("alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users(id,email,email_confirmed_at)values('"+owner+"','owner@example.invalid',now()),('"+member+"','alex@example.invalid',now()),('"+other+"','other@example.invalid',now());insert into homes(id,user_id,nickname)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','"+owner+"','Private home');insert into bills(user_id,home_id,name,amount,currency)values('"+owner+"','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Private bill',55,'CAD');insert into documents(user_id,home_id,title,document_type)values('"+owner+"','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Private original','receipt');insert into maintenance_tasks(user_id,home_id,title,status)values('"+owner+"','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Private Care','open');");
 await login();
 const day=(await db.query<{day:string}>("select current_date::text as day")).rows[0].day;
 await t.test("create/name/replay and direct-write denial",async()=>{
  const first=await create("Roommates","create-group-idempotent");g=first.groupId;
  assert.deepEqual(await create("Roommates","create-group-idempotent"),first);
  await assert.rejects(create("Different","create-group-idempotent"),{code:"PT409"});
  assert.equal((await call<unknown[]>("rezlee_list_expense_groups",[],[])).length,1);
  self=(await read()).people.find(p=>p.self)!.id;
  await db.query("update expense_groups set name='Bypass' where id=$1",[g]);
  assert.equal((await db.query<{name:string}>("select name from expense_groups where id=$1",[g])).rows[0].name,"Roommates");
  await assert.rejects(db.query("insert into expense_group_people(group_id,name,state)values($1,'Bypass','local')",[g]));
 });
 await t.test("named person invitation has no access before verified acceptance",async()=>{
  alex=(await mutate({operation:"add_person",name:"Alex"})).id;
  const invitation=await manage({operation:"invite",personId:alex,email:"alex@example.invalid"});
  assert.equal((await manage({operation:"share_invite",personId:alex})).inviteCode,invitation.inviteCode);
  await login(other);await assert.rejects(call("rezlee_preview_expense_group_invite",[invitation.inviteCode],["uuid"]),{code:"42501"});await assert.rejects(read(),{code:"42501"});await assert.rejects(accept(invitation.inviteCode),{code:"42501"});
  await login(member);await assert.rejects(read(),{code:"42501"});
  await db.exec("reset role;update auth.users set email_confirmed_at=null where id='"+member+"'");
  await login(member);await assert.rejects(accept(invitation.inviteCode),{code:"42501"});
  await db.exec("reset role;update auth.users set email_confirmed_at=now() where id='"+member+"'");
  await login(member);assert.equal((await call<{name:string}>("rezlee_preview_expense_group_invite",[invitation.inviteCode],["uuid"])).name,"Roommates");assert.equal(await call("rezlee_has_expense_groups",[],[]),false);assert.equal((await accept(invitation.inviteCode)).groupId,g);assert.equal(await call("rezlee_has_expense_groups",[],[]),true);assert.equal((await accept(invitation.inviteCode)).groupId,g);
  const p=(await read()).people.find(p=>p.self);assert.equal(p?.id,alex);assert.equal(p?.state,"member");
  for(const table of ["homes","bills","documents","maintenance_tasks","household_members","expense_group_people"]){
   assert.equal((await db.query("select * from "+table)).rows.length,0,table+" must remain private");
  }
  await assert.rejects(db.query("select rezlee_expense_group_owner($1)",[g]),{code:"42501"});
  await assert.rejects(manage({operation:"rename",name:"Hacked"}),{code:"42501"});
  await login();
 });
 const details=()=>({title:"Internet",amountCents:10001,paidBy:self,happenedOn:day,note:"",shares:[{personId:self,cents:5001},{personId:alex,cents:5000}]});
 await t.test("exact cents, canonical payload, idempotent create and invalid shares",async()=>{
  const c={operation:"create",kind:"expense",details:{...details(),privateOriginal:"must-not-copy"}};
  const first=await mutate(c,"expense-idempotent");entry=first.id;assert.deepEqual(await mutate(c,"expense-idempotent"),first);
  assert.deepEqual((await read()).balances,[{from:alex,to:self,cents:5000}]);
  assert.equal("privateOriginal" in (await read(g,entry)).entries[0].details,false);
  await assert.rejects(mutate({...c,details:{...details(),amountCents:1.5}}));
  await assert.rejects(mutate({...c,details:{...details(),shares:[{personId:alex,cents:10000}]}}));
  await assert.rejects(mutate({...c,details:{...details(),shares:[{personId:alex,cents:5000},{personId:alex,cents:5001}]}}));
  await assert.rejects(mutate({...c,details:{...details(),paidBy:other}}));
  await assert.rejects(mutate({...c,sourceBillId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}));
  await db.query("update expense_group_entries set details='{}' where id=$1",[entry]);
  assert.equal((await read(g,entry)).entries[0].details.amountCents,10001);
 });
 await t.test("member cannot edit another author; partial/full repayment uses current balance",async()=>{
  await login(member);
  await assert.rejects(mutate({operation:"edit",id:entry,version:1,details:details()}),{code:"42501"});
  await assert.rejects(mutate({operation:"add_person",name:"Unapproved"}),{code:"42501"});
  const pay={operation:"create",kind:"repayment",expectedBalanceCents:5000,details:{from:alex,to:self,amountCents:1500,happenedOn:day,note:"Interac recorded"}};
  const first=await mutate(pay,"payment-idempotent");repayment=first.id;assert.deepEqual(await mutate(pay,"payment-idempotent"),first);
  assert.deepEqual((await read()).balances,[{from:alex,to:self,cents:3500}]);
  await assert.rejects(mutate(pay),{code:"PT409"});
  await assert.rejects(mutate({...pay,expectedBalanceCents:3500,details:{...pay.details,amountCents:3501}}),{code:"PT409"});
  await mutate({...pay,expectedBalanceCents:3500,details:{...pay.details,amountCents:3500}});
  assert.deepEqual((await read()).balances,[]);
  await login();
 });
 await t.test("correction versions and repayment history survive edited expense",async()=>{
  await mutate({operation:"edit",id:entry,version:1,details:{...details(),amountCents:8000,shares:[{personId:self,cents:4000},{personId:alex,cents:4000}]}});
  await assert.rejects(mutate({operation:"edit",id:entry,version:1,details:details()}),{code:"PT409"});
  assert.deepEqual((await read()).balances,[{from:self,to:alex,cents:1000}]);
  assert.equal((await read(g,entry)).changes.length,2);
  assert.equal((await read(g,repayment)).entries[0].details.amountCents,1500);
  await mutate({operation:"create",kind:"repayment",expectedBalanceCents:1000,details:{from:self,to:alex,amountCents:1000,happenedOn:day,note:"Correction settled"}});
  assert.deepEqual((await read()).balances,[]);
 });
 await t.test("leaving with debt revokes access and preserves exact balances",async()=>{
  await mutate({operation:"create",kind:"expense",details:{...details(),amountCents:100,shares:[{personId:alex,cents:100}]}});
  await assert.rejects(manage({operation:"archive"}),{code:"PT409"});
  await login(member);await manage({operation:"leave"});
  await assert.rejects(read(),{code:"42501"});
  assert.equal((await db.query("select * from expense_group_entries")).rows.length,0);
  await assert.rejects(mutate({operation:"create",kind:"expense",details:details()}),{code:"42501"});
  await login();assert.deepEqual((await read()).balances,[{from:alex,to:self,cents:100}]);
  assert.equal((await read()).people.find(p=>p.id===alex)?.state,"former");
  await assert.rejects(mutate({operation:"create",kind:"expense",details:details()}),{code:"22023"});
  await mutate({operation:"create",kind:"repayment",details:{from:alex,to:self,amountCents:100,happenedOn:day,note:"Former participant settled"}});
  assert.deepEqual((await read()).balances,[]);
 });
 await t.test("former participant identity cannot be assigned to a different account",async()=>{
  await assert.rejects(manage({operation:"invite",personId:alex,email:"other@example.invalid"}),{code:"22023"});
  const invite=await manage({operation:"invite",personId:alex,email:"alex@example.invalid"});
  await login(member);await accept(invite.inviteCode);assert.equal((await read()).people.find(p=>p.self)?.id,alex);
  await login();
 });
 await t.test("archive preserves readable history and blocks new writes; restoration",async()=>{
  await manage({operation:"archive"});assert.equal((await read()).archived,true);
  assert.ok((await read()).entries.length>0);assert.ok((await read()).entries.every(e=>!e.canEdit));
  await assert.rejects(mutate({operation:"create",kind:"expense",details:details()}),{code:"PT409"});
  await manage({operation:"restore"});await manage({operation:"rename",name:"Our home costs"});
  assert.equal((await read()).archived,false);
 });
 await t.test("foreign groups/entry ids and cancelled/expired invitations fail closed",async()=>{
  const p=(await mutate({operation:"add_person",name:"Casey"})).id;
  const first=await manage({operation:"invite",personId:p,email:"other@example.invalid"});
  await manage({operation:"cancel_invite",personId:p});
  await login(other);await assert.rejects(accept(first.inviteCode),{code:"P0002"});
  const foreign=(await create("Other group")).groupId;
  await assert.rejects(read(foreign,entry),{code:"P0002"});
  await assert.rejects(mutate({operation:"void",id:entry,version:2,reason:"Foreign"},key(),foreign),{code:"P0002"});
  await login();const expiring=await manage({operation:"invite",personId:p,email:"other@example.invalid"});
  await db.exec("reset role");await db.query("update expense_group_people set invite_expires_at=now()-interval '1 minute' where id=$1",[p]);
  await login(other);await assert.rejects(accept(expiring.inviteCode),{code:"PT409"});
  await login();await manage({operation:"cancel_invite",personId:p});await mutate({operation:"archive_person",id:p});
 });
 await t.test("one/two/typical/max40 people reconcile rounding;41st is rejected",async()=>{
  const round=(await create("Rounding boundary")).groupId;
  const ids=[(await read(round)).people.find(p=>p.self)!.id];
  for(let i=1;i<40;i++)ids.push((await mutate({operation:"add_person",name:"Person "+i},key(),round)).id);
  await assert.rejects(mutate({operation:"add_person",name:"Person 41"},key(),round),{code:"22023"});
  for(const size of [1,2,6,40]){
   const selected=ids.slice(0,size),amount=10001;
   const shares=selected.map((personId,index)=>({personId,cents:Math.floor(amount/size)+(index<amount%size?1:0)}));
   assert.equal(shares.reduce((sum,s)=>sum+s.cents,0),amount);
   const e=await mutate({operation:"create",kind:"expense",details:{title:"Rounding "+size,amountCents:amount,paidBy:ids[0],happenedOn:day,note:"",shares}},key(),round);
   assert.equal((await read(round,e.id)).entries[0].details.amountCents,amount);
  }
 });
 await t.test("owner transfer and account deletion retain other members' records",async()=>{
  await assert.rejects(manage({operation:"leave"}),{code:"PT409"});
  await manage({operation:"transfer_owner",personId:alex});assert.equal((await read()).role,"member");
  await login(member);assert.equal((await read()).role,"owner");
  await manage({operation:"transfer_owner",personId:self});
  await db.exec("reset role;select public.begin_rezlee_account_deletion('"+owner+"',gen_random_uuid(),'"+'a'.repeat(64)+"')");
  await login();
  assert.equal(await call("rezlee_has_expense_groups",[],[]),false);
  assert.deepEqual(await call("rezlee_list_expense_groups",[],[]),[]);
  await assert.rejects(read(),{code:"42501"});
  await assert.rejects(create("Late group"),{code:"42501"});
  await assert.rejects(manage({operation:"rename",name:"Late rename"}),{code:"42501"});
  await assert.rejects(mutate({operation:"add_person",name:"Late participant"}),{code:"42501"});
  assert.equal((await db.query("select * from expense_group_requests")).rows.length,0);
  await db.exec("reset role;update public.account_deletion_jobs set phase='account' where user_id='"+owner+"';select public.clean_rezlee_account_links('"+owner+"');select public.clean_rezlee_account_links('"+owner+"');delete from auth.users where id='"+owner+"'");

  assert.equal((await db.query("select id from expense_groups where name='Rounding boundary'")).rows.length,0);
  await login(member);const payload=await read();assert.equal(payload.role,"owner");assert.ok(payload.entries.length>0);
  assert.equal(payload.people.find(p=>p.id===self)?.state,"former");
  await manage({operation:"rename",name:"Retained history"});
  await assert.rejects(manage({operation:"invite",personId:self,email:"other@example.invalid"}),{code:"22023"});
  const audit=await read(g,entry);
  assert.ok(audit.changes.every(c=>(c as {actor_name:string}).actor_name==="Former member"));

 });
 await t.test("anonymous callers cannot read, mutate or create groups",async()=>{
  await db.exec("reset role;set role anon");
  await assert.rejects(read(),{code:"42501"});await assert.rejects(create("Anonymous"),{code:"42501"});
  await assert.rejects(db.query("select * from expense_group_entries"),{code:"42501"});
 });
 }finally{await db.close();}
});

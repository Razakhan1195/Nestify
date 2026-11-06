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

test("shared ledger isolates households, reconciles exact shares, corrections, repayments and removal",async()=>{
 const db=await database();
 const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",memberId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 try{
 await db.exec("insert into auth.users values('"+owner+"','owner@example.invalid'),('"+member+"','member@example.invalid'),('"+other+"','other@example.invalid');insert into homes(id,user_id,nickname)values('"+home+"','"+owner+"','QA');insert into household_members(id,home_id,created_by_user_id,linked_user_id,display_name,role,status)values('"+memberId+"','"+home+"','"+owner+"','"+member+"','Member','member','active');set role authenticated;set request.jwt.claim.sub='"+owner+"';");
 const day=(await db.query<{day:string}>("select current_date::text as day")).rows[0].day;
 let index=0;
 const mutate=async(command:unknown,key="request-"+(++index))=>(await db.query<{result:{id:string;version:number;ok:boolean}}>("select rezlee_mutate_shared_expense($1,$2,$3::jsonb) result",[home,key,JSON.stringify(command)])).rows[0].result;
 const balances=async()=>(await db.query<{result:{from:string;to:string;cents:number}[]}>("select rezlee_expense_balances($1) result",[home])).rows[0].result;
 const details={title:"Internet",amountCents:10001,paidBy:owner,happenedOn:day,note:"Reviewed total",shares:[{personId:owner,cents:5001},{personId:memberId,cents:5000}]};
 const create={operation:"create",kind:"expense",details};
 const expense=await mutate(create,"same-expense");assert.deepEqual(await mutate(create,"same-expense"),expense);
 assert.equal((await db.query("select * from shared_expense_entries")).rows.length,1);
 assert.deepEqual(await balances(),[{from:memberId,to:owner,cents:5000}]);
 await assert.rejects(mutate({...create,details:{...details,amountCents:10000}},"same-expense"));
 await assert.rejects(mutate({...create,details:{...details,shares:[{personId:memberId,cents:10000}]}}));
 await assert.rejects(mutate({...create,details:{...details,shares:[{personId:memberId,cents:5000},{personId:memberId,cents:5001}]}}));
 await assert.rejects(mutate({...create,details:{...details,paidBy:other}}));
 await assert.rejects(mutate({...create,details:{...details,happenedOn:"2026-02-31"}}));
 await assert.rejects(mutate({...create,details:{...details,amountCents:1.5}}));
 
 await db.exec("update shared_expense_entries set details='{}'");
 assert.deepEqual((await db.query<{details:unknown}>("select details from shared_expense_entries")).rows[0].details,details);
 await db.exec("set request.jwt.claim.sub='"+member+"'");
 assert.equal((await db.query("select id from shared_expense_entries")).rows.length,1);
 await assert.rejects(mutate({operation:"edit",id:expense.id,version:1,details}));
 await assert.rejects(mutate({operation:"add_person",name:"Guest"}));
 const pay={operation:"create",kind:"repayment",details:{from:memberId,to:owner,amountCents:2000,happenedOn:day,note:"Interac transfer recorded"}};
 const payment=await mutate(pay,"payment-key");assert.deepEqual(await mutate(pay,"payment-key"),payment);
 assert.deepEqual(await balances(),[{from:memberId,to:owner,cents:3000}]);
 await assert.rejects(mutate({...pay,details:{...pay.details,amountCents:3001}}),{code:"PT409"});
 await assert.rejects(mutate({...pay,details:{...pay.details,from:owner,to:memberId}}));
 await db.exec("set request.jwt.claim.sub='"+owner+"'");
 const updated=await mutate({operation:"edit",id:expense.id,version:1,details:{...details,amountCents:8000,shares:[{personId:owner,cents:4000},{personId:memberId,cents:4000}]}});
 assert.equal(updated.version,2);assert.deepEqual(await balances(),[{from:memberId,to:owner,cents:2000}]);
 await assert.rejects(mutate({operation:"edit",id:expense.id,version:1,details}));
 assert.equal((await db.query("select * from shared_expense_changes where entry_id='"+expense.id+"'")).rows.length,2);
 const guest=await mutate({operation:"add_person",name:"Roommate"});
 await assert.rejects(mutate({operation:"add_person",name:"roommate"}));
 const guestExpense=await mutate({...create,details:{...details,shares:[{personId:guest.id,cents:10001}]}});
 await mutate({operation:"archive_person",id:guest.id});
 await assert.rejects(mutate({...create,details:{...details,shares:[{personId:guest.id,cents:10001}]}}));
 await mutate({operation:"void",id:guestExpense.id,version:1,reason:"Duplicate receipt"});
 await db.exec("set request.jwt.claim.sub='"+other+"'");
 assert.equal((await db.query("select * from shared_expense_entries")).rows.length,0);
 assert.equal((await db.query("select * from shared_expense_changes")).rows.length,0);
 assert.equal((await db.query("select * from shared_expense_requests")).rows.length,0);
 assert.deepEqual(await balances(),[]);
 await assert.rejects(mutate(create));await assert.rejects(mutate({operation:"void",id:expense.id,version:2,reason:"No access"}));
 await db.exec("set request.jwt.claim.sub='"+owner+"';delete from household_members where id='"+memberId+"'");
 assert.deepEqual(await balances(),[{from:memberId,to:owner,cents:2000}]);
 const people=(await db.query<{p:{id:string;state:string}[]}>("select rezlee_expense_people('"+home+"') p")).rows[0].p;
 assert.equal(people.find(p=>p.id===memberId)?.state,"former");
 await db.exec("set request.jwt.claim.sub='"+member+"'");
 assert.equal((await db.query("select * from shared_expense_entries")).rows.length,0);
 assert.equal((await db.query("select * from shared_expense_requests")).rows.length,0);
 await assert.rejects(mutate(pay,"payment-key"));
 await db.exec("set request.jwt.claim.sub='"+owner+"'");
 await mutate({...pay,details:{...pay.details,amountCents:2000}});assert.deepEqual(await balances(),[]);
 // Correcting a previously repaid expense exposes the resulting credit, never erases repayment history.
 await mutate({operation:"void",id:expense.id,version:2,reason:"Refunded in full"});
 assert.deepEqual(await balances(),[{from:owner,to:memberId,cents:4000}]);
 assert.equal((await db.query("select * from shared_expense_entries where kind='repayment'")).rows.length,2);

 const billId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 await db.exec("insert into bills(id,user_id,home_id,name,amount,currency)values('"+billId+"','"+owner+"','"+home+"','Private source',99.99,'CAD')");
 const sourceCommand={operation:"create",kind:"expense",details:{...details,amountCents:9999,shares:[{personId:owner,cents:9999}]}};
 async function shareSource(key:string,bill=billId,cmd:unknown=sourceCommand){
  return(await db.query<{result:{id:string;ok:boolean}}>("select rezlee_share_bill_expense($1,$2,$3,$4::jsonb) result",[home,key,bill,JSON.stringify(cmd)])).rows[0].result;
 }
 const sourceSaved=await shareSource("source-save-key");
 assert.deepEqual(await shareSource("source-save-key"),sourceSaved);
 await assert.rejects(shareSource("source-second-key"),{code:"PT409"});
 assert.equal((await db.query("select * from shared_expense_bill_links")).rows.length,1);
 const sharedRecord=(await db.query<{details:Record<string,unknown>}>("select details from shared_expense_entries where id=$1",[sourceSaved.id])).rows[0].details;
 assert.equal("sourceBillId" in sharedRecord,false);assert.equal("original_storage_path" in sharedRecord,false);
 await db.exec("set request.jwt.claim.sub='"+other+"'");
 await assert.rejects(shareSource("source-foreign-key"));
 assert.equal((await db.query("select * from shared_expense_bill_links")).rows.length,0);
 await db.exec("set request.jwt.claim.sub='"+owner+"';delete from bills where id='"+billId+"'");
 assert.deepEqual(await shareSource("source-save-key"),sourceSaved);
 assert.equal((await db.query<{bill_id:string|null}>("select bill_id from shared_expense_bill_links")).rows[0].bill_id,null);
 assert.equal((await db.query("select id from shared_expense_entries where id=$1",[sourceSaved.id])).rows.length,1);

 const deletedMember="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
 await db.exec("insert into household_members(id,home_id,created_by_user_id,linked_user_id,display_name,status,role)values('"+deletedMember+"','"+home+"','"+owner+"','"+member+"','Leaving member','active','member')");
 await mutate({...create,details:{...details,shares:[{personId:deletedMember,cents:10001}]}});
 await db.exec("reset role;delete from auth.users where id='"+member+"';set role authenticated;set request.jwt.claim.sub='"+owner+"'");
 const afterDeletion=(await db.query<{p:{id:string;state:string}[]}>("select rezlee_expense_people('"+home+"') p")).rows[0].p;
 assert.equal(afterDeletion.find(p=>p.id===deletedMember)?.state,"former");
 assert.ok((await balances()).some(p=>p.from===deletedMember&&p.cents===10001));
 await assert.rejects(mutate({...create,details:{...details,shares:[{personId:deletedMember,cents:10001}]}}));
 await db.exec("reset role;set role anon");await assert.rejects(balances());await assert.rejects(mutate(create));

 }finally{await db.close();}
});

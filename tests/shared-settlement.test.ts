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

test("settlements notify only counterparties, respect stable identities, guard concurrent partial payments and limit reminders",async()=>{
 const db=await database();
 const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",memberId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",otherId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 try{
 await db.exec(`insert into auth.users values('${owner}','owner@example.invalid'),('${member}','member@example.invalid'),('${other}','other@example.invalid');
 insert into homes(id,user_id,nickname)values('${home}','${owner}','QA');
 insert into household_members(id,home_id,created_by_user_id,linked_user_id,display_name,role,status)values('${memberId}','${home}','${owner}','${member}','Alex','member','active'),('${otherId}','${home}','${owner}','${other}','Sarah','member','active');set role authenticated;set request.jwt.claim.sub='${owner}';`);
 const day=(await db.query<{day:string}>("select current_date::text as day")).rows[0].day;
 let i=0;
 const call=async(fn:string,command:unknown,key="settle-request-"+(++i))=>(await db.query<{r:{id:string;version:number;ok:boolean}}>(`select ${fn}($1,$2,$3::jsonb) r`,[home,key,JSON.stringify(command)])).rows[0].r;
 const mutate=(command:unknown,key?:string)=>call("rezlee_mutate_shared_expense",command,key);
 const pay=(from:string,to:string,cents:number,expected:number)=>({operation:"create",kind:"repayment",expectedBalanceCents:expected,details:{from,to,amountCents:cents,happenedOn:day,note:""}});
 const remind=()=>db.query<{r:{alreadySent:boolean}}>("select rezlee_remind_shared_balance($1,$2,$3) r",[home,memberId,owner]);
 await mutate({operation:"create",kind:"expense",details:{title:"Household shop",amountCents:15000,paidBy:owner,happenedOn:day,note:"",shares:[{personId:owner,cents:5000},{personId:memberId,cents:5000},{personId:otherId,cents:5000}]}});
 assert.equal((await remind()).rows[0].r.alreadySent,false);assert.equal((await remind()).rows[0].r.alreadySent,true);
 await db.exec(`set request.jwt.claim.sub='${other}'`);await assert.rejects(remind(),{code:"42501"});
 await db.exec(`set request.jwt.claim.sub='${member}'`);await assert.rejects(remind(),{code:"42501"});
 const payment=await call("rezlee_record_shared_repayment",pay(memberId,owner,2000,5000),"same-payment");
 assert.deepEqual(await call("rezlee_record_shared_repayment",pay(memberId,owner,2000,5000),"same-payment"),payment);
 // The recipient cannot accidentally record the same partial payment against a stale balance.
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 await assert.rejects(call("rezlee_record_shared_repayment",pay(memberId,owner,2000,5000)),{code:"PT409"});
 let notices=(await db.query<{body:string}>("select body from notifications where notification_type='shared_repayment'")).rows;
 assert.equal(notices.length,1);assert.match(notices[0].body,/Alex recorded a payment of \$20.00 CAD/);
 // Recipient records money received; only the payer gets the new notice.
 await call("rezlee_record_shared_repayment",pay(memberId,owner,3000,3000));
 await db.exec(`set request.jwt.claim.sub='${member}'`);
 notices=(await db.query<{body:string}>("select body from notifications where notification_type='shared_repayment'")).rows;assert.equal(notices.length,1);assert.match(notices[0].body,/30.00 CAD/);
 await db.exec(`reset role`);
 assert.equal((await db.query("select * from notifications where user_id=$1",[other])).rows.length,0);
 assert.equal((await db.query("select * from notifications where notification_type='shared_repayment'")).rows.length,2);
 await db.query("select refresh_rezlee_settlement_notices($1)",[member]);
 assert.equal((await db.query("select * from notifications where notification_type='shared_reminder' and resolved_at is null")).rows.length,0);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);await assert.rejects(remind(),{code:"PT409"});
 await db.exec(`set request.jwt.claim.sub='${member}'`);
 await mutate({operation:"void",id:payment.id,version:1,reason:"Entered twice"});
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 assert.equal((await db.query("select * from notifications where title='Recorded payment removed'")).rows.length,1);
 assert.equal((await db.query("select * from notifications where related_id=$1 and title='Payment recorded' and resolved_at is null",[payment.id])).rows.length,0);
 const guest=await mutate({operation:"add_person",name:"Not joined"});
 await mutate({operation:"create",kind:"expense",details:{title:"Guest share",amountCents:1000,paidBy:owner,happenedOn:day,note:"",shares:[{personId:guest.id,cents:1000}]}});
 await assert.rejects(db.query("select rezlee_remind_shared_balance($1,$2,$3)",[home,guest.id,owner]),{code:"22023"});
 await call("rezlee_record_shared_repayment",pay(guest.id,owner,1000,1000));
 // No broad household alert, and no message destination for unjoined people.
 await db.exec(`reset role`);assert.equal((await db.query("select * from notifications where title='Payment recorded'")).rows.length,2);
 await db.query("delete from household_members where id=$1",[memberId]);await db.query("select refresh_rezlee_settlement_notices($1)",[member]);
 assert.equal((await db.query("select * from notifications where user_id=$1 and resolved_at is null",[member])).rows.length,0);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}'`);
 await assert.rejects(db.query("select rezlee_expense_recipient($1,$2)",[home,memberId]),/permission denied/);
 await assert.rejects(db.query("select refresh_rezlee_settlement_notices($1)",[owner]),/permission denied/);
 await db.exec("reset role;set role anon");await assert.rejects(remind(),/permission denied/);
 }finally{await db.close();}
});

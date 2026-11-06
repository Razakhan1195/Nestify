import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { currentReviewedEvidence, currentReviewedEnergyEvidence } from "../src/lib/product/statement-evidence";
import { evidenceDefaults } from "../apps/mobile/src/lib/statement-evidence";
import { historicalBillRow } from "../src/lib/product/manual-bill-history";

test("bill uploads atomically retain originals, recover interruptions, deduplicate, and enforce private ownership", async () => {
 const db = new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const key=(n:number)=>`dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12,"0")}`;
 const fields={bill_title:"Hydro statement",provider_name:"Example Hydro",category:"Electricity",account_number:"Home",amount:"100.25",billing_period_start:"2026-06-01",billing_period_end:"2026-06-30",due_date:"",issue_date:"",notes:""};
 const file=(n:number)=>({name:"statement.pdf",mime:"application/pdf",size:100,sha256:String(n).padStart(64,"0")});
 type Reply={status:string;id?:string;billId?:string;path?:string;fileReady?:boolean;canAttach?:boolean;version?:string};
 const prep=async(n:number,p:typeof fields & {supporting_details?:unknown}=fields,existing:string|null=null,version:string|null=null,body=file(n),home=ha)=>(await db.query<{r:Reply}>("select public.prepare_rezlee_bill_upload($1,$2,$3::jsonb,$4::jsonb,$5,$6) r",[home,key(n),JSON.stringify(p),JSON.stringify(body),existing,version])).rows[0].r;
 const commit=async(n:number)=>(await db.query<{r:Reply}>("select public.commit_rezlee_bill_upload($1) r",[key(n)])).rows[0].r;
 const upload=async(path:string)=>db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1)",[path]);
 const count=async(table:string)=>(await db.query<{n:number}>(`select count(*)::int n from public.${table}`)).rows[0].n;
 try {
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;
   create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;`);
  for(const file of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>`supabase/migrations/${f}`)]) await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec(`grant select,insert,update,delete on public.bills,public.documents to authenticated;
   grant select on public.homes,public.providers to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   insert into public.household_members(home_id,created_by_user_id,linked_user_id,display_name,role,status) values('${ha}','${a}','${b}','Member','member','active');
   set role authenticated;set request.jwt.claim.sub='${a}';`);
  await assert.rejects(prep(90,fields,null,null,file(90),hb),/unavailable/);
  await assert.rejects(prep(91,{...fields,amount:"1e3"}),/Invalid/);
  await assert.rejects(prep(92,{...fields,billing_period_start:"2026-07-01"}),/Invalid/);
  await assert.rejects(prep(93,fields,null,null,{...file(93),mime:"text/html"}),/Invalid/);
  assert.equal((await db.query<{r:boolean}>("select public.rezlee_bill_upload_available() r")).rows[0].r,true);

  const first=await prep(1);assert.equal(first.status,"prepared");assert.equal(await count("documents"),0);assert.equal(await count("bills"),0);
  assert.equal((await commit(1)).status,"upload_pending");
  await upload(first.path!);
  const saved=await commit(1);assert.equal(saved.status,"committed");assert.equal(saved.billId,first.billId);
  assert.deepEqual(await commit(1),saved);assert.equal((await prep(1)).status,"committed");assert.equal(await count("documents"),1);assert.equal(await count("bills"),1);
  const linked=(await db.query<{original_document_id:string;status:string;payment_status:null;amount:string}>("select original_document_id,status,payment_status,amount from public.bills where id=$1",[saved.billId])).rows[0];
  assert.equal(linked.original_document_id,first.id);assert.equal(linked.status,"archived");assert.equal(linked.payment_status,null);
  await assert.rejects(prep(1,{...fields,amount:"200"}),/changed/);
  const byPeriod=await prep(2);assert.equal(byPeriod.status,"duplicate");assert.equal(byPeriod.canAttach,false);assert.equal(byPeriod.billId,saved.billId);
  const byBytes=await prep(3,{...fields,account_number:"Other nickname"},null,null,file(1));assert.equal(byBytes.status,"duplicate");assert.equal(await count("documents"),1);

  // Shared membership does not reveal either original or private statement.
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  assert.equal(await count("documents"),0);assert.equal(await count("bills"),0);assert.equal(await count("vault_save_receipts"),0);
  await assert.rejects(commit(1),/unavailable/);
  const other=await prep(4,{...fields,account_number:"Other"},null,null,file(4),hb);await upload(other.path!);await commit(4);
  await assert.rejects(db.query("update public.bills set original_document_id=$1 where id=$2",[first.id,other.billId]),/unavailable/);
  await db.exec(`set request.jwt.claim.sub='${a}'`);

  // Preparing two requests before either commit must still save only one pair.
  const july={...fields,billing_period_start:"2026-07-01",billing_period_end:"2026-07-31"};
  const p5=await prep(5,july),p6=await prep(6,july);await upload(p5.path!);await upload(p6.path!);
  assert.equal((await commit(5)).status,"committed");assert.equal((await commit(6)).status,"conflict");
  assert.equal((await db.query("select id from public.documents where id=$1",[p6.id])).rows.length,0);
  assert.equal((await db.query<{cleanup_path:string}>("select cleanup_path from public.vault_save_receipts where request_id=$1",[key(6)])).rows[0].cleanup_path,p6.path);
  await assert.rejects(upload(p6.path!),/retired/);

  // Same file concurrently labelled as another period cannot create another bill.
  const p7=await prep(7,{...fields,billing_period_start:"2026-04-01",billing_period_end:"2026-04-30"});
  const p8=await prep(8,{...fields,billing_period_start:"2026-05-01",billing_period_end:"2026-05-31"},null,null,file(7));
  await upload(p7.path!);await upload(p8.path!);await commit(7);assert.equal((await commit(8)).status,"conflict");
  assert.equal((await db.query("select id from public.documents where id=$1",[p8.id])).rows.length,0);

  // Explicit attachment to an existing manual statement keeps its details/ID.
  const august={...fields,bill_title:"Previously saved title",notes:"Keep these notes",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31"};
  const row=historicalBillRow(a,ha,{...august,record_kind:"historical"});const columns=Object.keys(row);
  const existing=(await db.query<{id:string}>(`insert into public.bills(${columns.join(",")}) values(${columns.map((_,i)=>`$${i+1}`).join(",")}) returning id`,Object.values(row).map(v=>typeof v==="object"&&v!==null?JSON.stringify(v):v))).rows[0].id;
  const offered=await prep(9,{...august,bill_title:"Suggested title",notes:""});assert.equal(offered.status,"duplicate");assert.equal(offered.canAttach,true);
  const attach=await prep(10,{...august,bill_title:"Suggested title",notes:""},existing,offered.version!);await upload(attach.path!);assert.equal((await commit(10)).billId,existing);
  const after=(await db.query<{name:string;notes:string;original_document_id:string}>("select name,notes,original_document_id from public.bills where id=$1",[existing])).rows[0];assert.equal(after.name,august.bill_title);assert.equal(after.notes,august.notes);assert.equal(after.original_document_id,attach.id);
  await db.query("delete from public.documents where id=$1",[attach.id]);
  assert.equal((await db.query<{original_document_id:null}>("select original_document_id from public.bills where id=$1",[existing])).rows[0].original_document_id,null);
  const retryOffer=await prep(11,august,null,null,file(11));
  const stale=await prep(12,august,existing,retryOffer.version!);await upload(stale.path!);
  await db.query("update public.bills set amount=101 where id=$1",[existing]);
  assert.equal((await commit(12)).status,"conflict");assert.equal((await db.query("select id from public.documents where id=$1",[stale.id])).rows.length,0);

  // Even an old/direct Vault commit cannot claim a bill exists prematurely.
  const direct=await prep(13,{...fields,billing_period_start:"2026-03-01",billing_period_end:"2026-03-31"});await upload(direct.path!);
  await db.query("select public.commit_rezlee_vault_save($1)",[key(13)]);
  assert.equal((await prep(13,{...fields,billing_period_start:"2026-03-01",billing_period_end:"2026-03-31"})).status,"prepared");
  assert.equal((await commit(13)).status,"committed");

  // Deleting a bill preserves its independently managed Vault original; replay cannot recreate it.
  await db.query("delete from public.bills where id=$1",[saved.billId]);assert.equal((await commit(1)).status,"deleted");assert.equal((await prep(1)).status,"deleted");
  assert.equal((await db.query("select id from public.documents where id=$1",[first.id])).rows.length,1);
  const expired=await prep(14,{...fields,billing_period_start:"2026-02-01",billing_period_end:"2026-02-28"});
  await db.exec("reset role");await db.query("update public.vault_save_receipts set expires_at=now()-interval '1 second' where request_id=$1",[key(14)]);await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
  assert.equal((await commit(14)).status,"abandoned");await assert.rejects(upload(expired.path!),/retired/);

  // Already-issued bills may include service in advance. Keep dates and private original;
  // retry stays idempotent and the statement does not become an amount owed.
  const dates=(await db.query<{today:string;finish:string}>("select current_date::text today,(current_date+30)::text finish")).rows[0];
  const advance={...fields,issue_date:dates.today,billing_period_start:dates.today,billing_period_end:dates.finish};
  await assert.rejects(prep(70,{...advance,issue_date:""}),/issue date/);
  await assert.rejects(prep(71,{...advance,issue_date:dates.finish}),/issue date/);
  const preparedAdvance=await prep(72,advance);assert.equal(preparedAdvance.status,"prepared");await upload(preparedAdvance.path!);
  const committedAdvance=await commit(72);assert.equal(committedAdvance.status,"committed");assert.deepEqual(await commit(72),committedAdvance);
  const advanceRow=(await db.query<{period_end:string;payment_status:null}>("select billing_period_end::text period_end,payment_status from public.bills where id=$1",[committedAdvance.billId])).rows[0];
  assert.equal(advanceRow.period_end,dates.finish);assert.equal(advanceRow.payment_status,null);

  // Supporting evidence belongs to the same atomic save and immutable retry receipt.
  const energy={version:1,service:"electricity",scope:"single_service",lines:[{label:"Electricity",kind:"energy",amount:"90.25",quantity:"510",unit:"kWh",rate:"0.17696078",rateUnit:"CAD/kWh",band:"",quote:"Electricity 90.25"},{label:"Tax",kind:"tax",amount:"10",quantity:"",unit:"",rate:"",rateUnit:"",band:"",quote:"Tax 10.00"}]};
  const evidence={energy,fields:{...evidenceDefaults,subtotal:"90.25",tax:"10",credits:"0",previousBalance:"200",amountDue:"300.25",usage:"510",unit:"kWh"},quotes:{tax:"Tax 10.00",usage:"510 kWh",unit:"510 kWh"}};
  const supported={...fields,billing_period_start:"2026-01-01",billing_period_end:"2026-01-31",supporting_details:evidence};
  assert.equal((await db.query<{r:boolean}>("select public.rezlee_statement_intake_evidence_available() r")).rows[0].r,true);
  const p80=await prep(80,supported);await upload(p80.path!);const c80=await commit(80);assert.equal(c80.status,"committed");assert.deepEqual(await commit(80),c80);
  const stored=(await db.query<Record<string,unknown>>("select *,billing_period_start::text,billing_period_end::text from public.bills where id=$1",[c80.billId])).rows[0];
  assert.deepEqual((stored.raw_data as Record<string,unknown>).statement_evidence,evidence.fields);
  assert.deepEqual((stored.raw_data as Record<string,unknown>).statement_evidence_quotes,evidence.quotes);
  assert.deepEqual(currentReviewedEvidence({...stored,amount:Number(stored.amount)} as Parameters<typeof currentReviewedEvidence>[0]),evidence.fields);
  assert.deepEqual(currentReviewedEnergyEvidence({...stored,amount:Number(stored.amount)} as Parameters<typeof currentReviewedEvidence>[0]),energy);
  assert.equal((await db.query<{r:boolean}>("select public.rezlee_statement_energy_evidence_available() r")).rows[0].r,true);
  assert.equal(stored.payment_status,null);
  await assert.rejects(prep(80,{...supported,supporting_details:{...evidence,fields:{...evidence.fields,tax:"11"}}}),/changed/);
  assert.equal((await prep(81,{...supported,supporting_details:{...evidence,fields:{...evidence.fields,tax:"11"}}})).status,"duplicate");
  // Direct RPC clients cannot commit malformed evidence or leave a partial document.
  const bad={...fields,account_number:"Invalid",supporting_details:{fields:{...evidence.fields,usage:"1e3"},quotes:{}}};
  const p82=await prep(82,bad);await upload(p82.path!);const beforeBills=await count("bills"),beforeDocs=await count("documents");
  await assert.rejects(commit(82),/Invalid usage/);assert.equal(await count("bills"),beforeBills);assert.equal(await count("documents"),beforeDocs);
  await db.exec(`set request.jwt.claim.sub='${b}'`);await assert.rejects(commit(80),/unavailable/);
  await db.exec(`set request.jwt.claim.sub='${a}'`);

  const invalidEnergy={...supported,account_number:"Invalid energy",supporting_details:{...evidence,energy:{...energy,lines:[{...energy.lines[0],rateUnit:"CAD/unknown"}]}}};
  const p83=await prep(83,invalidEnergy);await upload(p83.path!);
  await assert.rejects(commit(83),/Invalid energy/);assert.equal(await count("bills"),beforeBills);assert.equal(await count("documents"),beforeDocs);

  // Account freeze still blocks writes; cascaded original unlink must not block deletion.
  await db.exec("reset role");await db.query("select public.begin_rezlee_account_deletion($1,$2,$3)",[a,key(99),"a".repeat(64)]);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);await assert.rejects(prep(15),/unavailable/);await assert.rejects(commit(5),/unavailable/);
  await db.exec("reset role");
  const historyBefore=(await db.query("select id from public.bill_record_versions where user_id=$1",[a])).rows.length;
  await db.query("delete from public.documents where user_id=$1",[a]);
  assert.equal((await db.query("select id from public.bill_record_versions where user_id=$1",[a])).rows.length,historyBefore,"unlinking deleted originals must not recreate bill history");
  await db.query("delete from auth.users where id=$1",[a]);
  assert.equal((await db.query("select id from public.bills where user_id=$1",[a])).rows.length,0);
 }finally{await db.close();}
});

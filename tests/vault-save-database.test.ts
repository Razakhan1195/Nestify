import assert from "node:assert/strict";
import test from "node:test";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Vault save receipts atomically replay, protect owners and concurrent edits, and recover cleanup",async()=>{
 const db=new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const key=(n:number)=>`dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12,"0")}`;
 const payload={title:"Insurance policy",category:"Insurance",issued_on:"",expires_on:"",notes:"",expected_version:null,file:{name:"policy.pdf",mime:"application/pdf",size:100,sha256:"a".repeat(64)}};
 const prep=async(n:number,p:unknown=payload,home=ha)=>(await db.query<{r:{status:string;id:string;path:string;exists:boolean}}>("select public.prepare_rezlee_vault_save($1,$2,$3::jsonb) r",[home,key(n),JSON.stringify(p)])).rows[0].r;
 const commit=async(n:number)=>(await db.query<{r:{status:string;id:string}}>("select public.commit_rezlee_vault_save($1) r",[key(n)])).rows[0].r;
 const claim=async(n:number)=>(await db.query<{r:{userId:string;homeId:string;requestId:string;path:string}|null}>("select public.claim_rezlee_vault_cleanup($1) r",[key(n)])).rows[0].r;
 const row=async(id:string)=>(await db.query<{storage_path:string;updated_at:string;title:string}>("select storage_path,updated_at::text,title from public.documents where id=$1",[id])).rows[0];
 try{
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;
   create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;grant all on storage.objects to authenticated;`);
  for(const file of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>`supabase/migrations/${f}`)]){
   await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  }
  await db.exec(`grant select,insert,update,delete on public.homes,public.documents to authenticated;
   grant select on public.providers to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   insert into public.household_members(home_id,created_by_user_id,linked_user_id,display_name,role,status) values('${ha}','${a}','${b}','Member','member','active');
   set role authenticated;set request.jwt.claim.sub='${a}';`);
  await assert.rejects(prep(1,payload,hb));
  await assert.rejects(db.exec("select public.claim_rezlee_vault_cleanup(gen_random_uuid())"),/permission denied/);
  const first=await prep(1);assert.equal(first.status,"prepared");assert.equal((await commit(1)).status,"upload_pending");
  await db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1)",[first.path]);
  assert.deepEqual(await commit(1),{status:"committed",id:first.id});
  assert.deepEqual(await commit(1),{status:"committed",id:first.id});assert.equal((await prep(1)).id,first.id);
  assert.equal((await db.query("select * from public.documents")).rows.length,1);
  await assert.rejects(prep(1,{...payload,title:"Changed choices"}),/choices changed/);
  await assert.rejects(db.exec(`update public.vault_save_receipts set status='prepared' where request_id='${key(1)}'`),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query("select * from public.vault_save_receipts")).rows.length,0);
  await assert.rejects(prep(2,{...payload,id:first.id},hb),/Record unavailable/);
  await assert.rejects(commit(1),/Save unavailable/);
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const original=await row(first.id);
  const edit={...payload,id:first.id,expected_version:original.updated_at,title:"Updated policy"};
  const replace=await prep(2,edit);const competing=await prep(3,{...edit,title:"Different edit"});
  // Staged replacement does not change the saved file.
  assert.equal((await row(first.id)).storage_path,first.path);
  await db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1),('rezlee-documents',$2)",[replace.path,competing.path]);
  assert.equal((await commit(2)).status,"committed");assert.equal((await row(first.id)).storage_path,replace.path);
  assert.equal((await commit(3)).status,"conflict");assert.equal((await row(first.id)).title,"Updated policy");
  assert.equal((await prep(4,edit)).status,"conflict"); // stale form detected before upload
  await assert.rejects(db.query("update public.documents set storage_path=$1 where id=$2",[first.path,first.id]),/retired/);
  await db.exec("reset role;set role service_role");
  const cleanup=await claim(20);assert.ok(cleanup);assert.equal(cleanup.path,first.path);
  // A second worker cannot lease this row; it can lease a different conflict file.
  const other=await claim(21);assert.ok(other);assert.equal(other.path,competing.path);assert.equal(await claim(22),null);
  await db.query("select public.finish_rezlee_vault_cleanup($1,$2,$3,false)",[a,key(2),key(20)]);
  assert.equal(await claim(23),null); // bounded backoff
  await db.exec("reset role");
  await db.query("update public.vault_save_receipts set cleanup_due_at=now()-interval '1 second' where request_id=$1",[key(2)]);
  await db.exec("set role service_role");assert.equal((await claim(24))?.path,first.path);
  await db.query("select public.finish_rezlee_vault_cleanup($1,$2,$3,true)",[a,key(2),key(20)]); // stale lease cannot finish newer work
  await db.exec("reset role");
  const stillPending=await db.query<{cleanup_done_at:unknown}>("select cleanup_done_at from public.vault_save_receipts where request_id=$1",[key(2)]);assert.equal(stillPending.rows[0].cleanup_done_at,null);
  await db.exec("set role service_role");await db.query("select public.finish_rezlee_vault_cleanup($1,$2,$3,true)",[a,key(2),key(24)]);
  await db.query("select public.finish_rezlee_vault_cleanup($1,$2,$3,true)",[a,key(3),key(21)]);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}'`);
  const abandoned=await prep(5);
  await db.exec("reset role");await db.query("update public.vault_save_receipts set expires_at=now()-interval '1 second' where request_id=$1",[key(5)]);
  await db.exec("set role service_role");assert.equal((await claim(25))?.path,abandoned.path);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}'`);
  assert.equal((await commit(5)).status,"abandoned");
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1)",[abandoned.path]),/retired/);
  // Metadata-only saves retain the existing file and are also replayable.
  const current=await row(first.id);await prep(6,{...edit,expected_version:current.updated_at,file:null,title:"Metadata only"});
  assert.equal((await commit(6)).status,"committed");assert.equal((await row(first.id)).storage_path,replace.path);
  // The worker must refuse even a mistakenly queued current attachment.
  await db.exec("reset role");
  await db.query("update public.vault_save_receipts set cleanup_path=$1 where request_id=$2",[replace.path,key(6)]);
  await db.exec("set role service_role");assert.equal(await claim(26),null);
  await db.exec("reset role");
  const protectedPath=await db.query<{cleanup_error:string}>("select cleanup_error from public.vault_save_receipts where request_id=$1",[key(6)]);
  assert.equal(protectedPath.rows[0].cleanup_error,"path_requires_review");
  // A killed worker can be reclaimed, but exhausted retries cannot spin forever.
  await db.query("update public.vault_save_receipts set cleanup_lease_until=now()-interval '1 second' where request_id=$1",[key(5)]);
  await db.exec("set role service_role");assert.equal((await claim(27))?.path,abandoned.path);
  await db.exec("reset role");
  await db.query("update public.vault_save_receipts set cleanup_attempts=5,cleanup_lease_until=null,cleanup_due_at=now()-interval '1 second' where request_id=$1",[key(5)]);
  await db.exec("set role service_role");assert.equal(await claim(28),null);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}'`);
  await db.query("delete from public.documents where id=$1",[first.id]);
  assert.equal((await commit(1)).status,"deleted");assert.equal((await prep(1)).exists,false);
  assert.equal((await db.query("select * from public.documents")).rows.length,0);

  // Exact receipt content is serialized per owner/home, including unfinished saves.
  const receiptPayload={...payload,category:"Receipt",title:"Purchase",file:{...payload.file,sha256:"c".repeat(64)}};
  const receiptPrep=async(n:number,p:unknown=receiptPayload,home=ha)=>(await db.query<{r:{status:string;id?:string;path?:string;requestId?:string}}>("select public.prepare_rezlee_receipt_save($1,$2,$3::jsonb) r",[home,key(n),JSON.stringify(p)])).rows[0].r;
  const receipt=await receiptPrep(50);assert.equal(receipt.status,"prepared");
  assert.deepEqual(await receiptPrep(51),{status:"duplicate_pending",requestId:key(50)});
  await db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1)",[receipt.path]);
  await commit(50);
  assert.deepEqual(await receiptPrep(52,{...receiptPayload,title:"Another name",file:{...receiptPayload.file,name:"renamed.pdf"}}),{status:"duplicate",id:receipt.id});
  await assert.rejects(receiptPrep(50,{...receiptPayload,title:"Changed same request"}),/choices changed/);
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  await assert.rejects(receiptPrep(53,receiptPayload,ha),/unavailable/);
  assert.equal((await receiptPrep(53,receiptPayload,hb)).status,"prepared");
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  assert.equal((await receiptPrep(54,{...receiptPayload,file:{...receiptPayload.file,sha256:"d".repeat(64)}})).status,"prepared");
  await db.query("delete from public.documents where id=$1",[receipt.id]);
  assert.equal((await receiptPrep(55)).status,"prepared"); // deleted document is not resurrected or treated as saved

  // Reader results are owner-only and cannot be forged through direct SQL.
  await db.exec("reset role");
  const readerBill=key(80),readerDoc=key(81);
  await db.query("insert into public.documents(id,user_id,home_id,title) values($1,$2,$3,'Statement')",[readerDoc,a,ha]);
  await db.query("insert into public.bills(id,user_id,home_id,name) values($1,$2,$3,'Synthetic bill')",[readerBill,a,ha]);
  await db.exec("set role service_role");
  await db.query("insert into public.statement_read_attempts(user_id,home_id,bill_id,document_id,source_basis) values($1,$2,$3,$4,$5)",[a,ha,readerBill,readerDoc,"a".repeat(64)]);
  await assert.rejects(db.query("insert into public.statement_read_attempts(user_id,home_id,bill_id,document_id,source_basis) values($1,$2,$3,$4,$5)",[a,ha,readerBill,readerDoc,"a".repeat(64)]),/unique/);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}'`);
  assert.equal((await db.query("select * from public.statement_read_attempts")).rows.length,1);
  await assert.rejects(db.exec("update public.statement_read_attempts set status='complete'"),/permission denied/);
  await assert.rejects(db.exec("delete from public.statement_read_attempts"),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query("select * from public.statement_read_attempts")).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  // New receipts/functions honor the earlier account-deletion freeze.
  await db.exec("reset role");await db.query("select public.begin_rezlee_account_deletion($1,$2,$3)",[a,key(99),"b".repeat(64)]);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
  await assert.rejects(prep(7),/unavailable/);assert.equal((await db.query("select * from public.statement_read_attempts")).rows.length,0);assert.equal((await db.query("select * from public.vault_save_receipts")).rows.length,0);
 }finally{await db.close();}
});

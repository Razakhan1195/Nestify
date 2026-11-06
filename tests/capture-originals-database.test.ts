import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("Gmail and uploaded receipts reuse the same saved original in both directions, within the owner household",async()=>{
 const db=new PGlite();
 const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const key=(n:number)=>`dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12,"0")}`;
 const record={title:"Synthetic store receipt",category:"Receipt",issued_on:"2026-09-01",expires_on:"",notes:"Reviewed receipt"};
 const file=(n:number)=>({name:"receipt.pdf",mime:"application/pdf",size:100,sha256:String(n).padStart(64,"0")});
 type Result={status:string;id?:string;documentId?:string;path?:string};
 const prep=async(n:number,f=file(n),home=ha)=>(await db.query<{r:Result}>("select public.prepare_rezlee_receipt_save($1,$2,$3::jsonb) r",[home,key(n),JSON.stringify({...record,file:f,expected_version:null})])).rows[0].r;
 const upload=async(path:string)=>{await db.exec("reset role");await db.query("insert into storage.objects(bucket_id,name) values('rezlee-documents',$1)",[path]);await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);};
 const gmail=async(n:number,f=file(n))=>{
  await db.query("select public.begin_rezlee_email_capture($1,$2,$3,$4)",[ha,key(n),String(n).padStart(64,"0"),key(n+1000)]);
  await db.query("select public.finish_rezlee_email_capture($1,$2,'ready',$3::jsonb)",[key(n),key(n+1000),JSON.stringify({title:record.title,category:"receipt"})]);
  await db.exec("reset role");await db.query("update public.email_capture_jobs set source_type='gmail',source_meta=$2::jsonb where id=$1",[key(n),JSON.stringify({file:f})]);await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
 };
 const accept=async(n:number)=>(await db.query<{r:Result}>("select public.accept_rezlee_email_capture($1,$2,$3::jsonb,null) r",[key(n),ha,JSON.stringify(record)])).rows[0].r;
 try{
  await db.exec(`create role anon;create role authenticated;create role authenticator; create role service_role bypassrls;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema public,auth,storage to authenticated,service_role;`);
  for(const file of ["supabase/schema.sql",...(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort().map(f=>"supabase/migrations/"+f)])
   await db.exec((await readFile(file,"utf8")).replace(/create extension if not exists "pgcrypto";/g,""));
  await db.exec(`grant select on public.homes,public.documents,public.bills to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   set role authenticated;set request.jwt.claim.sub='${a}';`);

 const original=await prep(20);await upload(original.path!);await db.query("select public.commit_rezlee_vault_save($1)",[key(20)]);
 await gmail(21,file(20));const reused=await accept(21);assert.equal(reused.documentId,original.id);assert.equal((await db.query("select id from public.documents")).rows.length,1);
 await gmail(22);const emailOriginal=await prep(22);await upload(emailOriginal.path!);const emailSaved=await accept(22);assert.equal(emailSaved.documentId,emailOriginal.id);
 const manualDuplicate=await prep(23,{...file(22),name:"renamed-original.pdf"});assert.equal(manualDuplicate.status,"duplicate");assert.equal(manualDuplicate.id,emailSaved.documentId);assert.equal((await db.query("select id from public.documents")).rows.length,2);
 assert.equal((await prep(24,file(24))).status,"prepared","matching merchant and amount do not prove duplicate content");
 await db.exec(`set request.jwt.claim.sub='${b}'`);const isolated=await prep(25,file(22),hb);assert.equal(isolated.status,"prepared");assert.equal((await db.query("select id from public.documents")).rows.length,0);
 await assert.rejects(accept(22),/Home unavailable/);
 }finally{await db.close();}
});

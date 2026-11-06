import assert from "node:assert/strict";
import test from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("confirmed cross-source copies count once, revisions reopen review, evidence and tenant boundaries survive",async()=>{
 const db=new PGlite();const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",ha="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hb="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const key=(n:number)=>`dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12,"0")}`;
 type RecordSummary={id:string;fingerprint:string;amount:number;source:string};
 type State={bill:RecordSummary;choices:Array<{current:boolean;selectedId:string}>;versions:unknown[];candidates:RecordSummary[]};
 const state=async(n:number)=>(await db.query<{r:State}>("select public.get_rezlee_bill_records($1) r",[key(n)])).rows[0].r;
 const visible=async()=>(await db.query<{id:string}>("select id from public.rezlee_effective_bills order by id")).rows.map(x=>x.id);
 const choose=async(x:RecordSummary,y:RecordSummary,selected:string|null)=>db.query("select public.choose_rezlee_bill_record($1,$2,$3,$4,$5)",[x.id,y.id,x.fingerprint,y.fingerprint,selected]);
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
  await db.exec(`grant select,insert,update,delete on public.homes,public.documents,public.bills to authenticated; grant select on public.providers to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   set role authenticated;set request.jwt.claim.sub='${a}';`);

  const insert=async(n:number,source="deck",period="2026-09-01",amount=42)=>db.query(`insert into public.bills(id,user_id,home_id,name,custom_provider_name,account_number_masked,currency,amount,billing_period_start,billing_period_end,payment_status,status,source,raw_data) values($1,$2,$3,'Synthetic gas statement','Enbridge Gas','Account ending 3083','CAD',$4,$5,'2026-09-30',null,'archived',$6,$7::jsonb)`,[key(n),a,ha,amount,period,source,JSON.stringify(source==="manual"?{category:"Gas",record_kind:"historical",amount_basis:"period_charges"}:{category:"Gas",amount_basis:"period_charges"})]);
  await insert(1);await insert(2,"manual");await insert(3,"deck");
  let x=(await state(1)).bill;const y=(await state(2)).bill;
  assert.equal((await visible()).length,3,"candidates are not silently hidden");
  await choose(x,y,x.id);await choose(x,y,x.id);assert.deepEqual(await visible(),[key(1),key(3)],"idempotent choice counts once");
  assert.equal((await db.query("select id from public.bills")).rows.length,3,"no source record deleted");
  assert.equal((await state(2)).choices[0].selectedId,x.id,"excluded record stays accessible");
  await assert.rejects(choose(x,(await state(3)).bill,key(3)),/existing choice/);
  await choose(x,y,null);assert.equal((await visible()).length,3,"undo restores both");
  await choose(x,y,y.id);assert.deepEqual(await visible(),[key(2),key(3)]);
  await db.query("update public.bills set amount=45 where id=$1",[key(1)]);
  assert.equal((await visible()).length,3,"new provider revision is not hidden by an old choice");
  assert.equal((await state(1)).choices[0].current,false);assert.equal((await state(1)).versions.length,1);
  await assert.rejects(choose(x,y,y.id),(e:unknown)=>{assert.equal((e as {code:string}).code,"PT409");return /changed/.test(String(e));});
  x=(await state(1)).bill;await choose(x,y,x.id);assert.deepEqual(await visible(),[key(1),key(3)]);
  await db.query("update public.bills set updated_at=now() where id=$1",[key(1)]);assert.equal((await state(1)).versions.length,1,"unchanged refresh creates no noise");
  await insert(5,"ezgb");await assert.rejects(choose(x,(await state(5)).bill,x.id),/different information/);
  await insert(4,"ezgb","2026-08-01");await assert.rejects(choose(x,(await state(4)).bill,x.id),/Periods differ/);
  await db.query("update public.bills set status='upcoming' where id=$1",[key(3)]);await assert.rejects(choose(x,(await state(3)).bill,x.id),/Periods differ/);
  await db.exec(`set request.jwt.claim.sub='${b}'`);assert.equal((await visible()).length,0);assert.equal((await db.query("select * from public.bill_record_choices")).rows.length,0);assert.equal((await db.query("select * from public.bill_record_versions")).rows.length,0);await assert.rejects(state(1),/unavailable/);await assert.rejects(choose(x,y,x.id),/unavailable/);
  await db.exec(`set request.jwt.claim.sub='${a}'`);await assert.rejects(db.query("delete from public.bill_record_choices"),/permission denied/);
  await db.exec("reset role");await db.query("delete from auth.users where id=$1",[a]);assert.equal((await db.query("select * from public.bill_record_choices")).rows.length,0);assert.equal((await db.query("select * from public.bill_record_versions")).rows.length,0);
 }finally{await db.close();}
});

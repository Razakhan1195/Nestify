import assert from "node:assert/strict";import test from "node:test";import {readFile,readdir} from "node:fs/promises";import {PGlite} from "@electric-sql/pglite";import {randomUUID} from "node:crypto";
test("home-item create receipts replay, cancel, isolate accounts and never resurrect deleted items",async()=>{
 const db=new PGlite(),a=randomUUID(),b=randomUUID(),ha=randomUUID(),hb=randomUUID();
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
  await db.exec(`grant select,insert,update,delete on homes,inventory_items to authenticated;grant select on documents to authenticated;
   insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
   insert into homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
   set role authenticated;set request.jwt.claim.sub='${a}';`);
  const fields={name:"Kitchen dishwasher",brand:"Test",model_number:"DW100",serial_number:"",category:"Appliance",room_or_area:"Kitchen",product_barcode:"",warranty_expires_on:"2027-10-11"};
  const create=async(request:string,values:unknown=fields,home=ha)=>(await db.query<{v:{itemId:string;replayed:boolean}}>("select create_rezlee_home_item($1,$2,$3::jsonb) v",[home,request,JSON.stringify(values)])).rows[0].v;
  const cancel=async(request:string)=>(await db.query<{v:{state:string;itemId:string|null}}>("select cancel_rezlee_home_item_create($1,$2) v",[ha,request])).rows[0].v;
  const request=randomUUID(),first=await create(request);assert.equal(first.replayed,false);
  assert.deepEqual(await create(request),{...first,replayed:true});
  assert.equal((await db.query("select * from inventory_items")).rows.length,1);
  await assert.rejects(create(request,{...fields,name:"Changed after timeout"}),/Retry changed/);
  await db.query("update inventory_items set name='Customer corrected name' where id=$1",[first.itemId]);
  await create(request);assert.equal((await db.query<{name:string}>("select name from inventory_items where id=$1",[first.itemId])).rows[0].name,"Customer corrected name");
  assert.equal((await cancel(request)).itemId,first.itemId);
  const identical=await create(randomUUID());assert.notEqual(identical.itemId,first.itemId);
  const cancelled=randomUUID();assert.equal((await cancel(cancelled)).state,"cancelled");
  await assert.rejects(create(cancelled),/cancelled or item deleted/);
  await db.query("delete from inventory_items where id=$1",[first.itemId]);
  await assert.rejects(create(request),/cancelled or item deleted/);assert.equal((await cancel(request)).state,"deleted");
  assert.equal((await db.query("select * from inventory_items")).rows.length,1);
  await assert.rejects(db.exec("delete from inventory_create_requests"),/permission denied/);
  await assert.rejects(create(randomUUID(),{...fields,warranty_expires_on:"2027-02-30"}),/Invalid warranty date/);
  await assert.rejects(create(randomUUID(),{...fields,user_id:b}),/Invalid item/);
  await db.exec(`set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query("select * from inventory_create_requests")).rows.length,0);
  await assert.rejects(create(randomUUID()),/Home unavailable/);
  const other=await create(request,fields,hb);assert.notEqual(other.itemId,first.itemId);
  await db.exec(`reset role;delete from auth.users where id='${a}';`);
  assert.equal((await db.query("select * from inventory_create_requests where user_id=$1",[a])).rows.length,0);
 }finally{await db.close();}
});

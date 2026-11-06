import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupVaultAttachments, saveVaultRecord } from "../src/lib/product/vault-save";
const userId="11111111-1111-4111-8111-111111111111",homeId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",requestId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const path=`${userId}/${homeId}/saves/${requestId}`;
const file=new File(["%PDF-1.7 fixture"],"test.pdf",{type:"application/pdf"});
const fields={title:"Policy",category:"Insurance" as const,issued_on:"",expires_on:"",notes:""};
type Reply={data?:unknown;error?:{code?:string;message?:string}|null};
function fixture(replies:Reply[],uploadThrows=false,removeFails=false){
 const calls:{name:string;args:Record<string,unknown>}[]=[],uploads:string[]=[],removals:string[][]=[];
 const supabase={
  async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});assert.ok(replies.length,"Unexpected RPC");return replies.shift()!;},
  storage:{from(){return{
   async upload(name:string,_bytes:Buffer,options:{upsert:boolean}){assert.equal(options.upsert,false);uploads.push(name);if(uploadThrows)throw Error("Lost upload response");return {error:null};},
   async remove(paths:string[]){removals.push(paths);return {error:removeFails?{message:"unavailable"}:null};},
  };}},
 } as unknown as SupabaseClient;
 return {input:{supabase,userId,homeId,requestId,fields,file},calls,uploads,removals};
}
const prepared={status:"prepared",id,path,fileReady:false};
test("new attachment save prepares immutable content fingerprint and commits before returning success",async()=>{
 const f=fixture([{data:prepared},{data:{status:"committed",id}}]);
 assert.deepEqual(await saveVaultRecord(f.input),{ok:true,id});
 assert.deepEqual(f.uploads,[path]);assert.equal(f.removals.length,0);
 assert.deepEqual(f.calls.map(x=>x.name),["prepare_rezlee_vault_save","commit_rezlee_vault_save"]);
 const payload=f.calls[0].args.p_payload as {file:{sha256:string}};assert.match(payload.file.sha256,/^[a-f0-9]{64}$/);
});
test("lost upload success is reconciled rather than deleting or replacing the file",async()=>{
 const f=fixture([{data:prepared},{data:{status:"committed",id}}],true);
 assert.deepEqual(await saveVaultRecord(f.input),{ok:true,id});assert.equal(f.removals.length,0);
});
test("ambiguous commit retains attachment and retry recovers existing record without uploading again",async()=>{
 const f=fixture([{data:prepared},{error:{code:"NETWORK",message:"lost response"}},{data:{status:"committed",id,exists:true}}]);
 const first=await saveVaultRecord(f.input);assert.equal(first.ok,false);if(!first.ok)assert.equal(first.status,503);
 assert.deepEqual(await saveVaultRecord(f.input),{ok:true,id});assert.deepEqual(f.uploads,[path]);assert.equal(f.removals.length,0);
 assert.equal(f.calls[0].args.p_request,f.calls[2].args.p_request);
});
test("already staged file skips upload and completes the interrupted save",async()=>{
 const f=fixture([{data:{...prepared,fileReady:true}},{data:{status:"committed",id}}]);
 assert.deepEqual(await saveVaultRecord(f.input),{ok:true,id});assert.equal(f.uploads.length,0);
});
test("missing storage object never reports success and never removes the saved original",async()=>{
 const f=fixture([{data:prepared},{data:{status:"upload_pending"}}],true);
 const result=await saveVaultRecord(f.input);assert.equal(result.ok,false);assert.equal(f.removals.length,0);
 if(!result.ok)assert.match(result.error,/Retry save/);
});
test("metadata-only save uses no storage calls",async()=>{
 const f=fixture([{data:{...prepared,path:null,fileReady:true}},{data:{status:"committed",id}}]);
 assert.deepEqual(await saveVaultRecord({...f.input,file:null}),{ok:true,id});assert.equal(f.uploads.length,0);
});
test("conflict, expired intent and deleted committed record cannot recreate or replace anything",async()=>{
 for(const receipt of [{status:"conflict"},{status:"abandoned"},{status:"committed",id,exists:false}]){
  const f=fixture([{data:receipt}]);assert.equal((await saveVaultRecord(f.input)).ok,false);
  assert.equal(f.uploads.length,0);assert.equal(f.calls.length,1);assert.equal(f.removals.length,0);
 }
});
test("foreign storage paths are rejected before upload",async()=>{
 const f=fixture([{data:{...prepared,path:"someone/else/file"}}]);
 assert.equal((await saveVaultRecord(f.input)).ok,false);assert.equal(f.uploads.length,0);
});
test("permission failures do not expose database messages or perform storage writes",async()=>{
 const f=fixture([{error:{code:"42501",message:"sensitive details"}}]);const result=await saveVaultRecord(f.input);
 assert.equal(result.ok,false);if(!result.ok){assert.equal(result.status,403);assert.doesNotMatch(result.error,/sensitive/);}
 assert.equal(f.uploads.length,0);
});
test("cleanup persists success only after storage removal and remains bounded",async()=>{
 const job={userId,homeId,requestId,path};
 const f=fixture([{data:job},{data:null},{data:null}]);
 assert.deepEqual(await cleanupVaultAttachments(f.input.supabase),{removed:1,failed:0});
 assert.deepEqual(f.removals,[[path]]);assert.equal(f.calls[1].args.p_ok,true);
 assert.equal(f.calls[0].args.p_lease,f.calls[1].args.p_lease);
 const many=fixture(Array.from({length:10},(_,i)=>i%2?{data:null}:{data:job}));
 assert.deepEqual(await cleanupVaultAttachments(many.input.supabase),{removed:5,failed:0});assert.equal(many.calls.length,10);
});
test("cleanup failure is recorded for retry without affecting the saved record",async()=>{
 const f=fixture([{data:{userId,homeId,requestId,path}},{data:null},{data:null}],false,true);
 assert.deepEqual(await cleanupVaultAttachments(f.input.supabase),{removed:0,failed:1});assert.equal(f.calls[1].args.p_ok,false);
});
test("cleanup rejects a foreign path defensively even from the worker RPC",async()=>{
 const f=fixture([{data:{userId,homeId,requestId,path:"other/home/file"}},{data:null},{data:null}]);
 assert.deepEqual(await cleanupVaultAttachments(f.input.supabase),{removed:0,failed:1});assert.equal(f.removals.length,0);
});

test("receipt duplicate returns existing destination without uploading or committing a new copy",async()=>{
 for(const status of ["duplicate","duplicate_pending"]){
  const f=fixture([{data:{status,id,requestId}}]);
  const result=await saveVaultRecord({...f.input,deduplicateReceipts:true});
  assert.equal(result.ok,false);
  if(!result.ok){assert.equal(result.status,409);assert.equal(status==="duplicate"?result.duplicateId:result.recoveryRequestId,status==="duplicate"?id:requestId);}
  assert.equal(f.calls[0].name,"prepare_rezlee_receipt_save");assert.equal(f.calls.length,1);assert.equal(f.uploads.length,0);
 }
});

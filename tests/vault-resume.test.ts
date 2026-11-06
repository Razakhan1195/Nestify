import test from "node:test";
import assert from "node:assert/strict";
import {createVaultPendingStore} from "../apps/mobile/src/lib/vault-pending-core";
import {resumeVaultSave} from "../src/lib/product/vault-save";
import type {SupabaseClient} from "@supabase/supabase-js";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
test("Vault recovery references survive restart and isolate accounts without storing private fields",async()=>{
 const data=new Map<string,string>();
 const storage={getItemAsync:async(k:string)=>data.get(k)??null,setItemAsync:async(k:string,v:string)=>{data.set(k,v);},deleteItemAsync:async(k:string)=>{data.delete(k);}};
 const store=createVaultPendingStore(storage);
 await store.remember(a,b);
 assert.equal(await createVaultPendingStore(storage).read(a),b);
 assert.equal(await store.read(b),null);
 await assert.rejects(store.remember(a,a),/previous/);
 await assert.rejects(store.replace(a,a,b),/changed/);
 await store.replace(a,b,a);assert.equal(await store.read(a),a);
 await store.replace(a,a,b);
 await store.forget(a,a);assert.equal(await store.read(a),b);
 await store.forget(a,b);assert.equal(await store.read(a),null);
 assert.equal(data.size,0);
});
test("concurrent new saves cannot replace an unresolved Vault reference",async()=>{
 const data=new Map<string,string>();
 const store=createVaultPendingStore({getItemAsync:async k=>data.get(k)??null,setItemAsync:async(k,v)=>{data.set(k,v);},deleteItemAsync:async k=>{data.delete(k);}});
 const results=await Promise.allSettled([store.remember(a,a),store.remember(a,b)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(await store.read(a),a);
});
test("server recovery commits once without requiring file bytes or an AI call",async()=>{
 const calls:string[]=[];
 const client={rpc:async(name:string,args:unknown)=>{calls.push(name);assert.deepEqual(args,{p_request:a});return {data:{status:"committed",id:b},error:null};}} as unknown as SupabaseClient;
 assert.deepEqual(await resumeVaultSave(client,a),{ok:true,id:b});
 assert.deepEqual(calls,["commit_rezlee_vault_save"]);
});
test("missing original, expired/deleted records and permission errors never report completed recovery",async()=>{
 for(const [status,expected] of [["upload_pending",428],["abandoned",410],["deleted",410],["conflict",409]] as const){
  const client={rpc:async()=>({data:{status},error:null})} as unknown as SupabaseClient;
  const r=await resumeVaultSave(client,a);assert.equal(r.ok,false);if(!r.ok)assert.equal(r.status,expected);
 }
 const denied={rpc:async()=>({error:{code:"42501",message:"private database detail"}})} as unknown as SupabaseClient;
 const r=await resumeVaultSave(denied,a);assert.equal(r.ok,false);assert.doesNotMatch(JSON.stringify(r),/private database/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {createStatementDraftStore,parseStatementDraft,type StatementDraft} from "../apps/mobile/src/lib/statement-draft-core";
const alice="11111111-1111-4111-8111-111111111111",bob="22222222-2222-4222-8222-222222222222";
const draft=():StatementDraft=>({version:1,updatedAt:Date.now(),homeId:alice,fields:{record_kind:"historical",bill_title:"Enbridge September",category:"Gas",amount:"123.45",due_date:"",notes:""},fileName:"bill.pdf"});
function fixture(){
 const values=new Map<string,string>();
 const storage={getItemAsync:async(k:string)=>values.get(k)??null,setItemAsync:async(k:string,v:string)=>{values.set(k,v);},deleteItemAsync:async(k:string)=>{values.delete(k);}};
 return {values,storage,store:createStatementDraftStore(storage)};
}
test("statement drafts restore incomplete fields without treating them as reviewed bills",()=>{
 const d=draft(); d.fields.amount="";
 const parsed=parseStatementDraft(JSON.stringify({...d,reviewed:true,file:{uri:"private-file"},fields:{...d.fields,payment_status:"paid"}}));
 assert.equal(parsed?.fields.amount,""); assert.equal(parsed?.fields.record_kind,"historical");
 assert.equal(parsed?.fields.payment_status,undefined); assert.equal("reviewed" in parsed!,false); assert.equal("file" in parsed!,false);
});
test("invalid, oversized, future and expired drafts cannot restore",()=>{
 const d=draft(),now=d.updatedAt;
 for(const value of [{...d,version:2},{...d,homeId:"invalid"},{...d,homeId:[alice]},{...d,fields:[]},{...d,updatedAt:now+60001},{...d,updatedAt:now-7*86400000-1},{...d,fields:{...d.fields,notes:"x".repeat(5001)}}]){
  assert.equal(parseStatementDraft(JSON.stringify(value),now),null);
 }
 assert.equal(parseStatementDraft("{"),null);
});
test("draft storage is isolated by account and survives a new store instance",async()=>{
 const f=fixture(); await f.store.write(alice,draft());
 assert.equal(await f.store.read(bob),null);
 const resumed=createStatementDraftStore(f.storage);
 assert.equal((await resumed.read(alice))?.fields.amount,"123.45");
 await resumed.clear(bob); assert.ok(await resumed.read(alice));
});
test("queued clear wins over an earlier in-flight write and stale drafts are purged",async()=>{
 const f=fixture(); let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const set=f.storage.setItemAsync;
 f.storage.setItemAsync=async(k,v)=>{await gate;await set(k,v);};
 const write=f.store.write(alice,draft()),clear=f.store.clear(alice);
 release(); await Promise.all([write,clear]); assert.equal(await f.store.read(alice),null);
 f.values.set("rezlee.statement-draft.v1."+alice,JSON.stringify({...draft(),updatedAt:0}));
 assert.equal(await f.store.read(alice),null); assert.equal(f.values.size,0);
});
test("a failed draft write does not erase prior work and later retry succeeds",async()=>{
 const f=fixture(); await f.store.write(alice,draft());
 const set=f.storage.setItemAsync; f.storage.setItemAsync=async()=>{throw Error("device storage unavailable");};
 await assert.rejects(f.store.write(alice,{...draft(),fileName:"new.pdf"}));
 assert.equal((await f.store.read(alice))?.fileName,"bill.pdf");
 f.storage.setItemAsync=set; await f.store.write(alice,{...draft(),fileName:"new.pdf"});
 assert.equal((await f.store.read(alice))?.fileName,"new.pdf");
});

import test from "node:test";
import assert from "node:assert/strict";
import {parseReceiptBatch,createReceiptBatchStore,batchCounts,type ReceiptBatch} from "../apps/mobile/src/lib/receipt-batch-core";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const batch=():ReceiptBatch=>({version:1,revision:0,homeId:a,homeName:"My home",items:[{requestId:b,name:"receipt.pdf",status:"review",readAttempted:false,fields:{title:"Receipt",category:"Receipt",issued_on:"",expires_on:"",notes:""}}]});
function fixture(){
 const values=new Map<string,string>();
 const storage={getItemAsync:async(k:string)=>values.get(k)??null,setItemAsync:async(k:string,v:string)=>{values.set(k,v);},deleteItemAsync:async(k:string)=>{values.delete(k);}};
 return {values,storage,store:createReceiptBatchStore(storage)};
}
test("receipt batch restores partial progress and original request IDs without file bytes",async()=>{
 const f=fixture(),initial=batch();
 initial.items[0].status="submitting";initial.items[0].readAttempted=true;
 const saved=await f.store.write(a,initial,null);
 const restored=await createReceiptBatchStore(f.storage).read(a);
 assert.deepEqual(restored,saved);assert.equal(restored?.items[0].requestId,b);
 assert.equal(await f.store.read(b),null);
 const injected=JSON.stringify({...initial,uri:"file://private",items:[{...initial.items[0],bytes:"private",uri:"file://private"}]});
 assert.doesNotMatch(JSON.stringify(parseReceiptBatch(injected)),/private|file:\/\//);
});
test("bounded queue refuses oversized batches, duplicate request IDs and corrupt fields",()=>{
 const d=batch();
 for(const value of [{...d,items:Array(6).fill(d.items[0])},{...d,items:[d.items[0],d.items[0]]},{...d,homeId:[a]},{...d,items:[{...d.items[0],fields:{...d.items[0].fields,notes:"x".repeat(5001)}}]},{...d,items:[{...d.items[0],status:"saved"}]}]){
  assert.equal(parseReceiptBatch(JSON.stringify(value)),null);
 }
});
test("a stale response cannot overwrite progress or clear a newer batch",async()=>{
 const f=fixture(),first=await f.store.write(a,batch(),null);
 const next=await f.store.write(a,{...first,items:[{...first.items[0],status:"saved",documentId:a}]},first.revision);
 await assert.rejects(f.store.write(a,first,first.revision),/changed/);
 await assert.rejects(f.store.clear(a,first.revision),/changed/);
 assert.equal((await f.store.read(a))?.items[0].status,"saved");
 await f.store.clear(a,next.revision);assert.equal(await f.store.read(a),null);
});
test("storage failure preserves last durable request for recovery",async()=>{
 const f=fixture(),saved=await f.store.write(a,batch(),null);
 f.storage.setItemAsync=async()=>{throw Error("storage unavailable");};
 await assert.rejects(f.store.write(a,{...saved,items:[{...saved.items[0],status:"submitting"}]},saved.revision));
 assert.equal((await f.store.read(a))?.items[0].status,"review");
});
test("progress never counts unfinished or skipped receipts as saved",()=>{
 const d=batch();d.items=[
 {...d.items[0],status:"saved",documentId:a},
 {...d.items[0],requestId:a,status:"duplicate",documentId:b},
 {...d.items[0],status:"needs_file"},
 {...d.items[0],status:"skipped"},
 ];
 assert.deepEqual(batchCounts(d),{saved:1,duplicates:1,pending:1,skipped:1});
});
test("concurrent batch creation cannot discard existing unfinished work",async()=>{
 const f=fixture();
 const results=await Promise.allSettled([f.store.write(a,batch(),null),f.store.write(a,batch(),null)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.ok(await f.store.read(a));
});

test("receipt originals and interrupted reading survive reopening without persisting file bytes",async()=>{
 const f=fixture(),value=batch();value.items[0].file={uri:"file:///cache/receipt.pdf",name:"receipt.pdf",mimeType:"application/pdf",size:123};value.items[0].readState="reading";value.items[0].readAttempted=true;
 await f.store.write(a,value,null);const restored=await createReceiptBatchStore(f.storage).read(a);
 assert.equal(restored?.items[0].file?.uri,value.items[0].file.uri);assert.equal(restored?.items[0].readState,"reading");
 const malicious={...value,items:[{...value.items[0],file:{...value.items[0].file,bytes:"secret"}}]};assert.doesNotMatch(JSON.stringify(parseReceiptBatch(JSON.stringify(malicious))),/secret/);
 for(const file of [{...value.items[0].file,uri:"https://external.invalid/a"},{...value.items[0].file,size:5*1024*1024},{...value.items[0].file,uri:3}])assert.equal(parseReceiptBatch(JSON.stringify({...value,items:[{...value.items[0],file}]})),null);
});
test("successful save drops the local attachment reference but keeps the server identity",async()=>{
 const f=fixture(),value=batch();value.items[0].file={uri:"file:///cache/receipt.pdf",name:"receipt.pdf"};const first=await f.store.write(a,value,null);
 await f.store.write(a,{...first,items:[{...first.items[0],status:"saved",documentId:a,file:undefined}]},first.revision);
 const restored=await f.store.read(a);assert.equal(restored?.items[0].file,undefined);assert.equal(restored?.items[0].documentId,a);
});

test("five detailed receipt drafts retain file references within the bounded store",async()=>{
 const f=fixture(),value=batch();
 value.items=Array.from({length:5},(_,index)=>({...value.items[0],requestId:`33333333-3333-4333-8333-33333333333${index}`,name:"n".repeat(250),message:"m".repeat(500),fields:{...value.items[0].fields,title:"t".repeat(200),notes:"Detail: \"reviewed\"\n".repeat(300).slice(0,5000)},file:{uri:"file://"+"p".repeat(1993),name:"n".repeat(250),mimeType:"application/pdf",size:4*1024*1024}}));
 const saved=await f.store.write(a,value,null);assert.deepEqual(await createReceiptBatchStore(f.storage).read(a),saved);
});

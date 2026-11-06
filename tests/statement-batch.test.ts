import test from "node:test";
import assert from "node:assert/strict";
import {parseStatementBatch,createStatementBatchStore,batchCounts,emptyStatementFields,type StatementBatch} from "../apps/mobile/src/lib/statement-batch-core";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const batch=():StatementBatch=>({version:1,revision:0,homeId:a,homeName:"My home",items:[{requestId:b,name:"receipt.pdf",status:"review",readAttempted:false,fields:{...emptyStatementFields,bill_title:"Statement"}}]});
function fixture(){
 const values=new Map<string,string>();
 const storage={getItemAsync:async(k:string)=>values.get(k)??null,setItemAsync:async(k:string,v:string)=>{values.set(k,v);},deleteItemAsync:async(k:string)=>{values.delete(k);}};
 return {values,storage,store:createStatementBatchStore(storage)};
}
test("statement batch restores partial progress and original request IDs without file bytes",async()=>{
 const f=fixture(),initial=batch();
 initial.items[0].status="submitting";initial.items[0].readAttempted=true;
 const saved=await f.store.write(a,initial,null);
 const restored=await createStatementBatchStore(f.storage).read(a);
 assert.deepEqual(restored,saved);assert.equal(restored?.items[0].requestId,b);
 assert.equal(await f.store.read(b),null);
 const injected=JSON.stringify({...initial,uri:"file://private",items:[{...initial.items[0],bytes:"private",uri:"file://private"}]});
 assert.doesNotMatch(JSON.stringify(parseStatementBatch(injected)),/private|file:\/\//);
});
test("bounded queue refuses oversized batches, duplicate request IDs and corrupt fields",()=>{
 const d=batch();
 for(const value of [{...d,items:Array(6).fill(d.items[0])},{...d,items:[d.items[0],d.items[0]]},{...d,homeId:[a]},{...d,items:[{...d.items[0],fields:{...d.items[0].fields,notes:"x".repeat(5001)}}]},{...d,items:[{...d.items[0],status:"saved"}]}]){
  assert.equal(parseStatementBatch(JSON.stringify(value)),null);
 }
});
test("a stale response cannot overwrite progress or clear a newer batch",async()=>{
 const f=fixture(),first=await f.store.write(a,batch(),null);
 const next=await f.store.write(a,{...first,items:[{...first.items[0],status:"saved",billId:a}]},first.revision);
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
test("progress never counts unfinished or skipped statements as saved",()=>{
 const d=batch();d.items=[
 {...d.items[0],status:"saved",billId:a},
 {...d.items[0],requestId:a,status:"duplicate",billId:b},
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

import test from "node:test";import assert from "node:assert/strict";import {randomUUID} from "node:crypto";
import {createInventoryIntentStore,type InventoryCreateIntent} from "../apps/mobile/src/lib/inventory-create-store";
function fixture(){const values=new Map<string,string>();let fail=false;return{values,setFail:(v:boolean)=>fail=v,storage:{getItemAsync:async(k:string)=>values.get(k)??null,setItemAsync:async(k:string,v:string)=>{if(fail)throw Error("Device storage full");values.set(k,v);},deleteItemAsync:async(k:string)=>{values.delete(k);}}};}
const intent=():InventoryCreateIntent=>({requestId:randomUUID(),homeId:randomUUID(),fields:{name:"Kitchen dishwasher",brand:"Test",model_number:"DW100",serial_number:"",room_or_area:"",category:"",product_barcode:"",warranty_expires_on:""}});
test("private item intent survives restart and isolates accounts",async()=>{
 const f=fixture(),a=randomUUID(),b=randomUUID(),value=intent();await createInventoryIntentStore(f.storage).remember(a,value);
 assert.deepEqual(await createInventoryIntentStore(f.storage).load(a),value);assert.equal(await createInventoryIntentStore(f.storage).load(b),null);
 assert(!JSON.stringify([...f.values.keys()]).includes(value.fields.name));
});
test("repeat tap keeps one intent; a new item cannot replace an unresolved save",async()=>{
 const f=fixture(),store=createInventoryIntentStore(f.storage),a=randomUUID(),value=intent();
 await Promise.all([store.remember(a,value),store.remember(a,value)]);
 await assert.rejects(store.remember(a,intent()),/previous save/);
 assert.deepEqual(await store.load(a),value);
 await assert.rejects(store.forget(a,randomUUID()),/different save/);
 await store.forget(a,value.requestId);assert.equal(await store.load(a),null);
});
test("failed persistence sends no usable intent; damaged pending storage fails closed",async()=>{
 const f=fixture(),store=createInventoryIntentStore(f.storage),a=randomUUID(),value=intent();f.setFail(true);
 await assert.rejects(store.remember(a,value),/storage full/);assert.equal(await store.load(a),null);
 f.setFail(false);await store.remember(a,value);
 f.values.delete([...f.values.keys()].find(k=>k.endsWith("-0"))!);
 await assert.rejects(store.load(a),/restore/);
 await assert.rejects(store.remember(a,intent()),/restore/);
});
test("Unicode details are chunked without splitting characters or exposing fields in the pointer",async()=>{
 const f=fixture(),store=createInventoryIntentStore(f.storage),a=randomUUID(),value=intent();value.fields.name="🏠".repeat(90);
 await store.remember(a,value);assert.deepEqual(await store.load(a),value);
 for(const raw of f.values.values())assert(Buffer.byteLength(raw,"utf8")<2000);
});

test("corrupt or incomplete stored fields cannot become a new request",async()=>{
 const f=fixture(),store=createInventoryIntentStore(f.storage),a=randomUUID(),value=intent();
 await store.remember(a,value);
 const chunk=[...f.values.keys()].find(k=>k.endsWith("-0"))!;
 const damaged=JSON.parse(f.values.get(chunk)!);damaged.fields={};f.values.set(chunk,JSON.stringify(damaged));
 await assert.rejects(store.load(a),/restore/);
 await assert.rejects(store.remember(a,intent()),/restore/);
});

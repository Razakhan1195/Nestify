import test from "node:test";
import assert from "node:assert/strict";
import {reconcileStoreEvent,storeEventSchema,handleStoreWebhook} from "../src/lib/membership/store-events";
const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002";
test("Sandbox renewal, cancellation and refund notifications reconcile only approved test accounts",async()=>{
 for(const type of ["INITIAL_PURCHASE","RENEWAL","CANCELLATION","EXPIRATION"]){
  const called:string[]=[];
  const deps={userExists:async()=>true,allowsSandbox:async(id:string)=>id===a,reconcile:async(id:string)=>{called.push(id);}};
  await reconcileStoreEvent({id:"test",type,environment:"SANDBOX",app_user_id:b},deps);
  assert.deepEqual(called,[]);
  await reconcileStoreEvent({id:"test",type,environment:"SANDBOX",app_user_id:a},deps);
  assert.deepEqual(called,[a]);
 }
});
test("Production and legacy notifications always consult authoritative state, not QA eligibility or event claims",async()=>{
 for(const environment of ["PRODUCTION",undefined] as const){
  const calls:string[]=[];
  await reconcileStoreEvent({id:"test",type:"CANCELLATION",environment,app_user_id:b},{
   userExists:async()=>true,allowsSandbox:async()=>{throw Error("must not consult QA");},
   reconcile:async id=>{calls.push(id);},
  });
  assert.deepEqual(calls,[b]);
 }
});
test("Transfers reconcile both real accounts once, ignore anonymous IDs and deleted accounts",async()=>{
 const calls:string[]=[];
 await reconcileStoreEvent({id:"test",type:"TRANSFER",environment:"PRODUCTION",transferred_from:[a,a,"$RCAnonymousID:fixture"],transferred_to:[b,a]},{
  userExists:async id=>id!==b,allowsSandbox:async()=>false,reconcile:async id=>{calls.push(id);},
 });
 assert.deepEqual(calls,[a]);
});
test("Upstream and QA lookup failures remain retryable rather than falsely acknowledging a renewal",async()=>{
 for(const phase of ["exists","qa","sync"]){
  await assert.rejects(reconcileStoreEvent({id:"test",type:"RENEWAL",environment:"SANDBOX",app_user_id:a},{
   userExists:async()=>{if(phase==="exists")throw Error("unavailable");return true;},
   allowsSandbox:async()=>{if(phase==="qa")throw Error("unavailable");return true;},
   reconcile:async()=>{if(phase==="sync")throw Error("unavailable");},
  }));
 }
});
test("Invalid environments and oversized transfer lists cannot enter reconciliation",()=>{
 const event={id:"test",type:"RENEWAL",app_user_id:a};
 assert.equal(storeEventSchema.safeParse({event:{...event,environment:"TEST"}}).success,false);
 assert.equal(storeEventSchema.safeParse({event:{...event,transferred_to:Array(31).fill(a)}}).success,false);
 assert.equal(storeEventSchema.safeParse({event:{...event,environment:"SANDBOX",entitlement_ids:["forged"]}}).success,true);
});

const secret="controlled-test-secret-longer-than-32-characters";
const payload={event:{id:"test",type:"RENEWAL",environment:"PRODUCTION",app_user_id:a}};
function request(body:unknown=payload,auth=secret){return new Request("https://example.test/webhook",{method:"POST",headers:{authorization:auth,"content-type":"application/json"},body:JSON.stringify(body)});}
test("Webhook HTTP authentication and configuration fail before any account lookup",async()=>{
 const deps={userExists:async()=>{throw Error("must not run");},allowsSandbox:async()=>false,reconcile:async()=>{}};
 assert.equal((await handleStoreWebhook(request(),{configured:false,secret},deps)).status,503);
 assert.equal((await handleStoreWebhook(request(),{configured:true,secret:"short"},deps)).status,503);
 for(const auth of ["","wrong"])assert.equal((await handleStoreWebhook(request(payload,auth),{configured:true,secret},deps)).status,401);
});
test("Webhook returns RevenueCat-required 200 after reconciliation or a safely ignored event",async()=>{
 for(const scenario of ["production","approved-sandbox","unapproved-sandbox","deleted"]){
  let calls=0;
  const data={event:{...payload.event,environment:scenario==="production"?"PRODUCTION":"SANDBOX"}};
  const result=await handleStoreWebhook(request(data),{configured:true,secret},{
   userExists:async()=>scenario!=="deleted",allowsSandbox:async()=>scenario==="approved-sandbox",reconcile:async()=>{calls++;},
  });
  assert.equal(result.status,200);
  assert.equal(calls,scenario==="production"||scenario==="approved-sandbox"?1:0);
 }
});
test("Webhook malformed, oversized and invalid-environment payloads are rejected without reconciliation",async()=>{
 let calls=0;const deps={userExists:async()=>true,allowsSandbox:async()=>true,reconcile:async()=>{calls++;}};
 for(const data of [null,{event:{...payload.event,environment:"invalid"}},{padding:"x".repeat(64001)}]){
  assert.equal((await handleStoreWebhook(request(data),{configured:true,secret},deps)).status,400);
 }
 assert.equal(calls,0);
});
test("Webhook upstream failure returns retryable 503 without leaking diagnostics",async()=>{
 const result=await handleStoreWebhook(request(),{configured:true,secret},{userExists:async()=>true,allowsSandbox:async()=>true,reconcile:async()=>{throw Error("private subscription details");}});
 assert.equal(result.status,503);assert.equal(await result.text(),"");
});

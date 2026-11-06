import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {createDeckV2Client} from "../src/lib/deck/v2-client";
import {BILL_AGENT} from "../src/lib/deck/bill-agent";
import {cancelOwnedBillWorkflows} from "../src/lib/deck/bill-workflow-cleanup";
function fixture(){
 const filters:unknown[]=[];const rows=[{id:"job",credential_id:"cred_test",phases:[{workflowRunId:"wrun_test",workflowId:BILL_AGENT.workflowId}]}];
 const q={select:()=>q,eq:(key:string,value:string)=>{filters.push([key,value]);return q;},order:()=>q,limit:async()=>({data:rows,error:null})};
 let cancels=0;const run={id:"wrun_test",workflow_id:BILL_AGENT.workflowId,status:"running",result:null,session_id:"sess_test",steps:[]};
 const credential={id:"cred_test",external_id:"u:p"};
 const deck={getWorkflowRun:async()=>run,getCredential:async()=>credential,cancelWorkflowRun:async()=>{cancels++;return {...run,status:"canceled"};}} as unknown as ReturnType<typeof createDeckV2Client>;
 return {db:{from:()=>q} as unknown as SupabaseClient,deck,filters,rows,run,credential,cancels:()=>cancels};
}
test("disconnect cleanup uses owner-scoped journal and cancels the workflow, not only a child",async()=>{
 const f=fixture();await cancelOwnedBillWorkflows(f.db,f.deck,"u","p");assert.equal(f.cancels(),1);assert.deepEqual(f.filters,[["user_id","u"],["provider_id","p"]]);
});
test("cleanup rejects credential ownership mismatch",async()=>{
 const f=fixture();f.credential.external_id="other:p";await assert.rejects(cancelOwnedBillWorkflows(f.db,f.deck,"u","p"));assert.equal(f.cancels(),0);
});
test("terminal workflows need no credential lookup or cancellation",async()=>{
 const f=fixture();f.run.status="completed";f.deck.getCredential=async()=>{throw Error("credential already revoked");};await cancelOwnedBillWorkflows(f.db,f.deck,"u","p");assert.equal(f.cancels(),0);
});
test("canceling is pending and must not be advertised as disconnected",async()=>{
 const f=fixture();f.deck.cancelWorkflowRun=async()=>({...f.run,status:"canceling"});await assert.rejects(cancelOwnedBillWorkflows(f.db,f.deck,"u","p"),/pending/);
});

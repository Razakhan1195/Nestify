import test from "node:test";
import assert from "node:assert/strict";
import { billWorkflowSteps, workflowPhaseTask } from "../src/lib/deck/bill-workflow";
import { BILL_AGENT } from "../src/lib/deck/bill-agent";
import type { DeckV2WorkflowRun } from "../src/lib/deck/v2-client";

test("all workflow steps receive the customer credential and preserve dynamic account binding",()=>{
 const steps=billWorkflowSteps("cred_customer","2026-03-01");
 assert.deepEqual(steps.map(s=>s.name),["log_in","extract_account","fetch_12_months"]);
 assert.ok(steps.every(s=>s.credential_id==="cred_customer"));
 assert.deepEqual(steps[2].input,{account_number:"{{ item.account_number }}",since_bill_date:"2026-02-28"});
 assert.throws(()=>billWorkflowSteps("wrong","2026-03-01"));
});
test("missing or ambiguous account runs fail closed and pending steps wait",()=>{
 const phase={kind:"history" as const,taskId:BILL_AGENT.historyTaskId,input:{account_number:"001"},workflowId:BILL_AGENT.workflowId,workflowRunId:"wrun_test"};
 const run:DeckV2WorkflowRun={id:"wrun_test",workflow_id:BILL_AGENT.workflowId,status:"running",result:null,session_id:"sess_test",steps:[{name:"fetch_12_months",status:"queued",output:null,task_runs:[]}]};
 assert.equal(workflowPhaseTask(run,phase),null);
 run.status="completed";run.result="failure";assert.throws(()=>workflowPhaseTask(run,phase));
 run.steps[0].task_runs=[{task_run_id:"trun_one",status:"completed",result:"success",item:{account_number:"001"}}];
 assert.equal(workflowPhaseTask(run,phase),"trun_one");
 assert.throws(()=>workflowPhaseTask(run,{...phase,input:{account_number:"1"}}));
 run.steps[0].task_runs.push({...run.steps[0].task_runs[0],task_run_id:"trun_duplicate"});
 assert.throws(()=>workflowPhaseTask(run,phase));
});

test("workflow API sends per-step overrides, idempotency and uses workflow cancellation",async t=>{
 const {createDeckV2Client}=await import("../src/lib/deck/v2-client");
 const before=process.env.DECK_API_KEY;process.env.DECK_API_KEY="synthetic-test-key";
 t.after(()=>{if(before===undefined)delete process.env.DECK_API_KEY;else process.env.DECK_API_KEY=before;});
 const requests:Array<{url:string,init:RequestInit}>=[];
 t.mock.method(globalThis,"fetch",async(url:string,init:RequestInit)=>{requests.push({url,init});return new Response(JSON.stringify({id:"wrun_test",workflow_id:BILL_AGENT.workflowId,status:"running",result:null,session_id:"sess_test",steps:[]}));});
 const deck=createDeckV2Client();
 await deck.runWorkflow({workflowId:BILL_AGENT.workflowId,steps:billWorkflowSteps("cred_test","2026-03-01"),idempotencyKey:"stable-key"});
 const body=JSON.parse(String(requests[0].init.body));
 assert.equal(body.interactions_suppressed,false);assert.equal(body.steps.length,3);
 assert.equal((requests[0].init.headers as Record<string,string>)["Idempotency-Key"],"stable-key");
 assert.ok(requests[0].url.endsWith(`/workflows/${BILL_AGENT.workflowId}/run`));
 await deck.getWorkflowRun("wrun_test");assert.ok(requests[1].url.endsWith("/workflow-runs/wrun_test"));
 await deck.cancelWorkflowRun("wrun_test","cancel-key");assert.ok(requests[2].url.endsWith("/workflow-runs/wrun_test/cancel"));
});

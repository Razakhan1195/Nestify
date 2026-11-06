import test from "node:test";
import assert from "node:assert/strict";
import { ezgbProgress } from "../apps/mobile/src/lib/ezgb-progress";
const base = { ok: true as const, ready: false, jobId: "saved", stats: { accountsSeen: 1, integrationsConnected: 1, billsImported: 0, quarantined: 0, errors: 0 } };
test("progress distinguishes active work, partial completion and stopped jobs", () => {
  assert.equal(ezgbProgress({ ...base, status: "idle" }), null);
  assert.equal(ezgbProgress({ ...base, status: "running" })?.active, true);
  assert.equal(ezgbProgress({ ...base, status: "waiting" })?.active, false);
  assert.equal(ezgbProgress({ ...base, status: "waiting", stats: { ...base.stats, billsImported: 2, errors: 1 } })?.title, "Some bills are ready");
  assert.equal(ezgbProgress({ ...base, status: "failed" })?.attention, true);
  assert.equal(ezgbProgress({ ...base, status: "succeeded" })?.attention, false);
});

test("saved bills replace progress without pretending intervals are analysis-ready", async () => {
 const { ezgbBillsAvailable } = await import("../apps/mobile/src/lib/ezgb-progress");
 const job = { status: "waiting" as const, stats: { billsImported: 24, integrationsConnected: 1, intervalAccountsPending: 1, errors: 0, quarantined: 0 } };
 assert.equal(ezgbBillsAvailable(job), true);
 assert.equal(ezgbBillsAvailable({ ...job, stats: { ...job.stats, errors: 1 } }), false);
 assert.equal(ezgbProgress(job)?.attention, false);
});

test("usable statements remain available when only interval retrieval failed", async()=>{
 const {ezgbBillsAvailable}=await import("../apps/mobile/src/lib/ezgb-progress");
 assert.equal(ezgbBillsAvailable({status:"waiting",stats:{billsImported:24,integrationsConnected:1,intervalErrors:1}}),true);
 assert.equal(ezgbBillsAvailable({status:"succeeded",stats:{billsImported:0,integrationsConnected:1}}),false);
 assert.match(ezgbProgress({status:"succeeded",stats:{billsImported:0}})!.detail,/hasn’t supplied/);
});

test("an import spinner is not an instruction to fix a connection", async()=>{
 const {buildActionQueue}=await import("../src/lib/product/action-queue");
 const provider={id:"p",name:"Example Gas",display_name:null,provider_priority:null,next_expected_bill_date:null,connection_status:"syncing",health_status:"needs_attention",requires_user_action:false};
 const input={billEvents:[],bills:[],documents:[],issues:[],providers:[provider],resolutions:[],tasks:[],today:new Date("2026-10-03")};
 assert.equal(buildActionQueue(input).length,0);
 assert.equal(buildActionQueue({...input,providers:[{...provider,requires_user_action:true}]}).length,1);
});

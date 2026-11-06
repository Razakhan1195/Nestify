
import test from "node:test";
import assert from "node:assert/strict";
import { ezgbConnectionConfirmed, ezgbBillsAvailable, ezgbProgress, type EzgbConnectionStatus } from "../apps/mobile/src/lib/ezgb-progress";
import { formatConnectionElapsed } from "../apps/mobile/src/lib/connection-elapsed";
const connection: EzgbConnectionStatus = { expectedUtility: "Elexicon Energy", phase: "importing", utilities: ["Elexicon Energy"], providerIds: [], canRetry: true };
const job = { status: "running" as const, stats: { billsImported: 0, integrationsConnected: 0 }, connection };
test("verified connection can hand off while history remains unavailable",()=>{
 assert.equal(ezgbConnectionConfirmed(job),true);
 assert.equal(ezgbBillsAvailable(job),false);
 assert.equal(ezgbProgress(job)?.active,true);
 assert.match(ezgbProgress(job)!.detail,/10 minutes/);
});
test("callback, old bills, mismatch, cancellation and failed retrieval cannot fake confirmation",()=>{
 for(const phase of ["awaiting_account","different_utility","import_failed"] as const){
  assert.equal(ezgbConnectionConfirmed({...job,stats:{billsImported:24,integrationsConnected:1},connection:{...connection,phase}}),false);
 }
 assert.equal(ezgbConnectionConfirmed({...job,connection:undefined}),false);
 assert.equal(ezgbConnectionConfirmed({...job,cancelled:true}),false);
 assert.equal(ezgbConnectionConfirmed({...job,status:"failed"}),false);
 assert.equal(ezgbConnectionConfirmed({...job,status:"waiting"}),false);
});
test("confirmed account without bills and completed bills can finish a new connection",()=>{
 assert.equal(ezgbConnectionConfirmed({...job,status:"waiting",connection:{...connection,phase:"no_bills"}}),true);
 assert.equal(ezgbConnectionConfirmed({...job,status:"succeeded",connection:{...connection,phase:"bills_ready"}}),true);
 assert.equal(ezgbConnectionConfirmed({...job,status:"idle",connection:{...connection,phase:"bills_ready"}}),false);
});
test("elapsed display handles minutes, resumed foreground time and invalid clocks without inventing completion",()=>{
 assert.equal(formatConnectionElapsed(0),"0:00");
 assert.equal(formatConnectionElapsed(61000),"1:01");
 assert.equal(formatConnectionElapsed(10*60000+59000),"10:59");
 assert.equal(formatConnectionElapsed(-1000),"0:00");
 assert.equal(formatConnectionElapsed(Number.NaN),"0:00");
});

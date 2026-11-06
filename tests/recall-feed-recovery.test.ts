import test from "node:test";
import assert from "node:assert/strict";
import { fetchRecallSnapshot } from "../src/lib/recalls/feed";
const notice = { NID:"123", Title:"Recall", Product:"Acme", Organization:"Consumer product safety", URL:"https://recalls-rappels.canada.ca/en/alert-recall/test", "Last updated":"2026-09-21" };
for (const failure of ["network", "temporary-status"] as const) test("recall feed recovers once after "+failure, async()=>{
 let calls=0;
 const request:typeof fetch=async()=>{ calls++;if(calls===1){if(failure==="network")throw new TypeError("network unavailable");return new Response("Unavailable",{status:503});}return Response.json([notice]); };
 const result=await fetchRecallSnapshot(request);assert.equal(calls,2);assert.equal(result.recalls.length,1);assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});
test("recall source failures remain failures after two attempts",async()=>{let calls=0;await assert.rejects(fetchRecallSnapshot(async()=>{calls++;return new Response("Unavailable",{status:503});}),/unavailable/);assert.equal(calls,2);});
test("recall permission and missing-source errors are not retried",async()=>{let calls=0;await assert.rejects(fetchRecallSnapshot(async()=>{calls++;return new Response("Unavailable",{status:403});}),/unavailable/);assert.equal(calls,1);});
test("an empty or malformed feed never becomes a recall-free result",async()=>{await assert.rejects(fetchRecallSnapshot(async()=>Response.json([])),/empty/);await assert.rejects(fetchRecallSnapshot(async()=>Response.json({})));});

import test from "node:test";
import assert from "node:assert/strict";
import { withAiAllowance } from "../src/lib/ai/allowance-result";
test("success consumes one allowance; failure returns it exactly once", async () => {
 let refunds=0; const release=async()=>{refunds++;};
 assert.equal((await withAiAllowance(release,async()=>Response.json({reply:"Answer"}),()=>{})).status,200);
 assert.equal(refunds,0);
 assert.equal((await withAiAllowance(release,async()=>Response.json({error:"Try again"},{status:502}),()=>{})).status,502);
 assert.equal(refunds,1);
 await assert.rejects(withAiAllowance(release,async()=>{throw new DOMException("Timed out","AbortError");},()=>{}),{name:"AbortError"});
 assert.equal(refunds,2);
});
test("recovery failure preserves customer failure and is reported; concurrent successes are not refunded", async()=>{
 let warnings=0; const response=Response.json({error:"Unavailable"},{status:500});
 assert.equal(await withAiAllowance(async()=>{throw Error("unavailable");},async()=>response,()=>{warnings++;}),response);
 assert.equal(warnings,1);
 let refunds=0;
 const results=await Promise.all([200,502,200,503].map(status=>withAiAllowance(async()=>{refunds++;},async()=>new Response(null,{status}),()=>{})));
 assert.deepEqual(results.map(r=>r.status),[200,502,200,503]);assert.equal(refunds,2);
 await withAiAllowance(undefined,async()=>new Response(null,{status:502}),()=>{throw Error("unexpected");});
});

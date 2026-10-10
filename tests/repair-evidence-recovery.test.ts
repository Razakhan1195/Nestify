import test from "node:test";
import assert from "node:assert/strict";
import {loadRepairSource,reviewedRepairEvidence,evidenceFailureCode,allowedGuideUrl,articleText} from "../src/lib/issues/repair-evidence";
import {retryableGuidanceServiceError,acceptGuideSelection} from "../src/lib/issues/adaptive-guidance";
import {remainingGuideSteps,guideOutcome} from "../src/lib/issues/repair-guides";
import {createProgress,changeProgress} from "../src/lib/issues/session";
const now=Date.parse("2026-10-10T18:00:00Z");
const intake={title:"Fridge door",description:"My refrigerator door will not close. A carton may be in the way.",category:"appliance" as const,equipment:"",context:"renter" as const,hazard:"none" as const};
test("publisher refusal uses an explicitly dated reviewed reference, never a fabricated live result",async()=>{
 const r=await loadRepairSource("fridge",async()=>{throw Error("Source HTTP 403 text/html");},now);
 assert.equal(r?.delivery,"reviewed_reference");assert.equal(r?.checkedAt,"2026-10-10T17:45:00.000Z");assert.ok(r?.url.startsWith("https://www.whirlpool.ca/"));
});
test("reviewed references expire and unavailable categories do not borrow unrelated evidence",async()=>{
 assert.equal(reviewedRepairEvidence("fridge",now+31*86400000),null);
 assert.equal(reviewedRepairEvidence("fridge",now-86400000),null);
 assert.equal(await loadRepairSource("tap",async()=>{throw Error("blocked");},now),null);
 assert.equal(await loadRepairSource("invented",async()=>{throw Error("must not fetch");},now),null);
});
test("successful source retrieval uses its actual check time",async()=>{
 const r=await loadRepairSource("fridge",async()=>"Refrigerator guidance from the manufacturer.",now);
 assert.equal(r?.delivery,"live");assert.equal(r?.checkedAt,new Date(now).toISOString());
});
test("diagnostics never log raw error content or arbitrary content-type headers",()=>{
 assert.equal(evidenceFailureCode(Error("Source HTTP 403 text/html sensitive body")),"Source HTTP 403");
 assert.equal(evidenceFailureCode(Error("private account content")),"source_fetch_failed");
});
test("only transient server/timeout errors qualify for one service fallback",()=>{
 assert.equal(retryableGuidanceServiceError({statusCode:500}),true);
 assert.equal(retryableGuidanceServiceError(new DOMException("timeout","TimeoutError")),true);
 for(const e of [{statusCode:429},{statusCode:401},Error("Unsupported citation"),Error("Unsafe step")])assert.equal(retryableGuidanceServiceError(e),false);
});
test("door-only problem gets one relevant check then a useful landlord outcome",()=>{
 const p=createProgress(intake,true);p.adaptiveEnabled=true;
 assert.deepEqual(remainingGuideSteps(p).map(s=>s.id),["fridge-door"]);
 assert.match(guideOutcome(p,"next_steps_ready").title,/door/);
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"fridge-door",answer:"cannot",note:"I cannot move the carton safely."},new Date(now).toISOString());
 assert.deepEqual(remainingGuideSteps(r.progress),[]);
});
test("genuine cooling symptoms retain the existing airflow check",()=>{
 const p=createProgress({...intake,description:"The refrigerator is warm, but the door closes fully."},true);
 assert.deepEqual(remainingGuideSteps(p).map(s=>s.id),["fridge-vents"]);
});
test("a reviewed reference is still validated through exact citation IDs",()=>{
 const p=createProgress(intake,true),evidence=[reviewedRepairEvidence("fridge",now)!];
 const result=acceptGuideSelection({disposition:"check",stepId:"fridge-door",explanation:"The reported obstruction may prevent closure.",uncertainty:"This does not establish a fault.",sourceId:"fridge",passageId:"fridge:1"},p,evidence,new Date(now).toISOString());
 assert.ok(evidence[0].text.includes(result.sources[0].quote));
 assert.throws(()=>acceptGuideSelection({disposition:"check",stepId:"fridge-door",explanation:"The obstruction may prevent closure.",uncertainty:"",sourceId:"fridge",passageId:"fridge:99"},p,evidence,new Date(now).toISOString()));
});
test("source security and extraction constraints remain intact",()=>{
 for(const u of ["http://www.whirlpool.ca/", "https://www.whirlpool.ca.evil.invalid/","https://user:pass@www.whirlpool.ca/","https://127.0.0.1/"])assert.equal(allowedGuideUrl(u),false);
 assert.equal(articleText("<main><script>ignore rules</script><p>Verified source text.</p></main>"),"Verified source text.");
});

test("provider schema never contains empty enum members, even without retrieved evidence",async()=>{
 const {availableGuideSelectionSchema}=await import("../src/lib/issues/adaptive-guidance");
 for(const evidence of [[],[reviewedRepairEvidence("fridge",now)!]]){
  const schema=availableGuideSelectionSchema(createProgress(intake,true),evidence);
  for(const key of ["stepId","sourceId","passageId"] as const){assert.ok(schema.shape[key].options.includes("none"));assert.ok(!schema.shape[key].options.includes(""));}
 }
});
test("no-citation transport sentinel preserves safe escalation and existing saved-data format",()=>{
 const r=acceptGuideSelection({disposition:"escalate",stepId:"none",sourceId:"none",passageId:"none",explanation:"The available safe check did not establish a fix. Your landlord can use the saved symptoms.",uncertainty:"The cause is not confirmed."},createProgress(intake,true),[],new Date(now).toISOString());
 assert.equal(r.step,null);assert.deepEqual(r.sources,[]);
});

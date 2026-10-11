import test from "node:test";
import assert from "node:assert/strict";
import {createProgress,changeProgress,serviceBrief,type Intake} from "../src/lib/issues/session";
import {remainingGuideSteps,repairStopReason} from "../src/lib/issues/repair-guides";
import {availableGuideSelectionSchema,acceptGuideSelection,exhaustedGuidance,fallbackGuidance} from "../src/lib/issues/adaptive-guidance";
import {reviewedRepairEvidence,reviewedReferences} from "../src/lib/issues/repair-evidence";
const at=new Date(Math.max(...Object.values(reviewedReferences).map(r=>Date.parse(r.checkedAt)))+1000).toISOString();
const base:Intake={title:"Problem",description:"Something is not working in my home.",category:"other",context:"renter",equipment:"",hazard:"none"};
function progress(p:Partial<Intake>){const result=createProgress({...base,...p},true);result.adaptiveEnabled=true;return result;}
test("reported provider outage prevents further AI and catalogue device checks",()=>{
 const p=progress({title:"Wi-Fi",description:"My provider reports an outage and all devices cannot connect."});
 assert.equal(repairStopReason(p),"provider_outage");assert.deepEqual(remainingGuideSteps(p),[]);
 assert.match(exhaustedGuidance(p,at)!.explanation,/restoration updates/);
});
test("a structured outage answer stops both guidance paths",()=>{
 const p=progress({title:"Wi-Fi",description:"All devices cannot connect to the internet."});
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"network-outage",answer:"checked",choice:"outage",note:""},at);
 assert.deepEqual(remainingGuideSteps(r.progress),[]);assert.ok(exhaustedGuidance(r.progress,at));
});
test("known single-device scope avoids repeating scope and household outage questions",()=>{
 const p=progress({description:"Only my laptop cannot connect. Other devices work normally on the same Wi-Fi."});
 assert.deepEqual(remainingGuideSteps(p).map(s=>s.id),["network-reconnect"]);
});
test("under-sink leak answer does not progress to an unrelated model question",()=>{
 const p=progress({description:"My kitchen faucet is leaking, but I cannot tell where."});
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"leak-location",answer:"checked",choice:"under",note:"Water under the sink"},at);
 assert.equal(repairStopReason(r.progress),"leak_needs_help");assert.deepEqual(remainingGuideSteps(r.progress),[]);
 assert.match(serviceBrief(r.progress,"waiting_on_landlord"),/Water under the sink/);
});
test("unable to establish water scope leads to a useful brief rather than unrelated checks",()=>{
 for(const answer of ["cannot","unsure"] as const){
  const p=progress({description:"My faucet has weak flow."});
  const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"tap-scope",answer,note:"I cannot compare another tap."},at);
  assert.deepEqual(remainingGuideSteps(r.progress),[]);assert.match(exhaustedGuidance(r.progress,at)!.explanation,/could not establish/);
 }
});
test("an unavailable AI service still provides a supported safe action",()=>{
 const p=progress({description:"Only my laptop cannot connect. Other devices work normally on the same Wi-Fi."});
 const g=fallbackGuidance(p,[reviewedRepairEvidence("network",Date.parse(at))!],at);
 assert.equal(g.step?.id,"network-reconnect");assert.equal(g.sources.length,1);
});
test("missing evidence never becomes a fabricated action or source",()=>{
 const p=progress({description:"My fridge door does not close."});
 const g=fallbackGuidance(p,[],at);assert.equal(g.disposition,"escalate");assert.equal(g.step,null);assert.deepEqual(g.sources,[]);
 const tap=progress({description:"The kitchen faucet has weak flow. Other taps are normal."});
 const observation=fallbackGuidance(tap,[],at);assert.equal(observation.step?.kind,"observe");assert.equal(observation.step?.source,undefined);
});
test("clarification without evidence does not carry an unverified catalogue citation",()=>{
 const p=progress({description:"The kitchen faucet has weak flow. Other taps are normal."});
 const g=acceptGuideSelection({disposition:"clarify",stepId:"tap-outlet",sourceId:"none",passageId:"none",explanation:"An observation can help prepare the request.",uncertainty:"The cause is unknown."},p,[],at);
 assert.equal(g.step?.source,undefined);assert.deepEqual(g.sources,[]);
});
test("citation for the wrong check is rejected even when the source URL matches",()=>{
 const p=progress({description:"The refrigerator is warm and the door is blocked."}),e=[reviewedRepairEvidence("fridge",Date.parse(at))!];
 assert.throws(()=>acceptGuideSelection({disposition:"check",stepId:"fridge-door",sourceId:"fridge",passageId:"fridge:0",explanation:"The door may be blocked.",uncertainty:"Cause unknown."},p,e,at),/Unsupported citation/);
});
test("specific unsupported problem gets an honest useful outcome without repeating the symptom question",()=>{
 const p=progress({description:"My microwave makes a grinding noise while running."});
 assert.deepEqual(remainingGuideSteps(p),[]);assert.match(exhaustedGuidance(p,at)!.explanation,/does not have a verified walkthrough/);
 assert.match(serviceBrief(p,"waiting_on_landlord"),/grinding noise/);
});
test("genuinely vague problems still get one clarifying step",()=>{
 assert.deepEqual(remainingGuideSteps(progress({})).map(s=>s.id),["problem-detail"]);
});
test("new reviewed sources expire instead of silently becoming current forever",()=>{
 for(const id of ["network","tap"]){assert.ok(reviewedRepairEvidence(id,Date.parse(at)));assert.equal(reviewedRepairEvidence(id,Date.parse(at)+31*86400000),null);}
});
test("explicitly unknown model is not asked for again",()=>{
 const p=progress({description:"The kitchen faucet has weak flow. Other taps are normal. I do not know the model."});
 assert.deepEqual(remainingGuideSteps(p).map(s=>s.id),["tap-outlet"]);
});

test("no-source observations cannot request a sourced check from the model",()=>{
 const p=progress({category:"heating_cooling",description:"The heating is not responding. I have not checked the display.",equipment:"Honeywell T6 (unverified)"});
 const schema=availableGuideSelectionSchema(p,[]);
 const candidate={disposition:"check",stepId:"heating-display",sourceId:"none",passageId:"none",explanation:"The display helps clarify what is happening.",uncertainty:"Cause unknown."};
 assert.equal(schema.safeParse(candidate).success,false);
 assert.equal(schema.safeParse({...candidate,disposition:"clarify"}).success,true);
});

test("plural taps with already established wider weak flow skip redundant questions",()=>{
 const p=progress({title:"Water supply",category:"plumbing",description:"All taps have weak flow throughout the home."});
 assert.equal(repairStopReason(p),"wider_water_supply");
 assert.deepEqual(remainingGuideSteps(p),[]);
 assert.match(exhaustedGuidance(p,at)!.explanation,/wider supply/);
});

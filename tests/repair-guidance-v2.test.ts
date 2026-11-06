import test from "node:test";
import assert from "node:assert/strict";
import {createProgress,nextStep,changeProgress,serviceBrief,type Intake} from "../src/lib/issues/session";
import {guideOutcome,inferGuide,guidanceKey} from "../src/lib/issues/repair-guides";
import {acceptedMatch} from "../src/lib/issues/ai-guidance";
const base:Intake={title:"Kitchen tap",description:"The kitchen faucet has weak water flow.",category:"other",equipment:"",context:"renter",hazard:"none"};
const at="2026-09-30T14:00:00Z";
test("one weak faucet gets relevant checks without an inventory, model or AI",()=>{
 let p=createProgress(base,true),status="next_steps_ready";
 assert.equal(nextStep(p,status)?.id,"tap-scope");
 let r=changeProgress(p,status,{action:"respond",stepId:"tap-scope",answer:"checked",choice:"one",note:""},at);p=r.progress;status=r.status;
 assert.equal(nextStep(p,status)?.id,"tap-outlet");
 r=changeProgress(p,status,{action:"respond",stepId:"tap-outlet",answer:"checked",choice:"buildup",note:""},at);p=r.progress;status=r.status;
 assert.equal(nextStep(p,status)?.id,"tap-model");
 r=changeProgress(p,status,{action:"respond",stepId:"tap-model",answer:"cannot",note:"No label is visible"},at);
 assert.equal(r.status,"waiting_on_landlord");
 assert.match(serviceBrief(r.progress,r.status),/Only this tap/);
 assert.match(serviceBrief(r.progress,r.status),/Visible buildup/);
 assert.match(guideOutcome(r.progress,r.status).next,/Nothing has been sent/);
});
test("multiple affected taps produce supply context instead of invented faucet repair",()=>{
 const r=changeProgress(createProgress(base,true),"next_steps_ready",{action:"respond",stepId:"tap-scope",answer:"checked",choice:"all",note:""},at);
 assert.equal(nextStep(r.progress,r.status),null);
 assert.match(guideOutcome(r.progress,r.status).next,/municipality/);
 assert.match(guideOutcome(r.progress,r.status).summary,/not proof/);
});
test("dripping faucet does not receive weak-flow or generic observation loop",()=>{
 const p=createProgress({...base,description:"Water drips out of the faucet after I turn it off."},true);
 assert.equal(nextStep(p,"next_steps_ready")?.id,"leak-location");
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"leak-location",answer:"checked",choice:"under",note:""},at);
 assert.equal(nextStep(r.progress,r.status),null);
});
test("reported outage stops unnecessary device actions",()=>{
 let p=createProgress({...base,title:"Internet",description:"Our Wi-Fi keeps disconnecting"},true),status="next_steps_ready";
 for(const [stepId,choice] of [["network-scope","all"],["network-outage","outage"]]){
  const r=changeProgress(p,status,{action:"respond",stepId,answer:"checked",choice,note:""},at);p=r.progress;status=r.status;
 }
 assert.equal(nextStep(p,status),null);assert.match(guideOutcome(p,status).title,/outage/);
});
test("one targeted follow-up can select a useful guide without a paid call",()=>{
 const p=createProgress({...base,title:"Something broken",description:"There is a problem in my kitchen"},true);
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"problem-detail",answer:"checked",note:"My faucet has very low water pressure"},at);
 assert.equal(guidanceKey(r.progress),"faucet_flow");assert.equal(nextStep(r.progress,r.status)?.id,"tap-scope");
});
test("successful safe check and recurrence retain evidence without repeating failed work",()=>{
 const p=createProgress({...base,title:"Fridge warm",description:"The refrigerator is warm and its door is blocked"},true);
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"fridge-door",answer:"worked",note:"Moved the large carton"},at);
 assert.equal(r.status,"resolved");
 const reopened=changeProgress(r.progress,r.status,{action:"reopen",note:"Warm again the following day"},at);
 assert.equal(nextStep(reopened.progress,reopened.status),null);
 assert.match(serviceBrief(reopened.progress,reopened.status),/Moved the large carton/);
});
test("unknown equipment and model-specific faults do not get an unrelated cooling guide",()=>{
 assert.equal(inferGuide({...base,title:"Fridge",description:"The ice maker is making a knocking sound"}),"general");
 const p=createProgress({...base,title:"Unknown",description:"It stopped working yesterday"},true);
 assert.equal(nextStep(p,"next_steps_ready")?.id,"problem-detail");
 assert.throws(()=>changeProgress(p,"next_steps_ready",{action:"respond",stepId:"problem-detail",answer:"checked",note:""},at));
});
test("AI output is restricted to catalogue IDs and cannot overwrite a concrete symptom match",()=>{
 assert.throws(()=>acceptedMatch(base,{guide:"remove-electrical-cover",hazard:false}));
 assert.deepEqual(acceptedMatch(base,{guide:"internet",hazard:false}),{key:"faucet_flow",hazard:false});
 assert.equal(acceptedMatch(base,{guide:"general",hazard:true}).hazard,true);
});
test("invalid choice, stale step and a new hazard cannot advance",()=>{
 const p=createProgress(base,true);
 assert.throws(()=>changeProgress(p,"next_steps_ready",{action:"respond",stepId:"tap-scope",answer:"checked",choice:"invented",note:""},at));
 const r=changeProgress(p,"next_steps_ready",{action:"respond",stepId:"tap-scope",answer:"checked",choice:"one",note:"Water near electrical wiring"},at);
 assert.equal(r.progress.blocked,true);assert.equal(nextStep(r.progress,r.status),null);
});

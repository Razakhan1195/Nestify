import test from "node:test";
import assert from "node:assert/strict";
import { startSchema,createProgress,nextStep,changeProgress,serviceBrief,hazardDetected,type Intake } from "../src/lib/issues/session";
const input:Intake={title:"Wi-Fi disconnects",description:"The laptop loses its Wi-Fi connection each evening.",category:"internet",equipment:"Unknown",context:"renter",hazard:"none"};
const at="2026-09-26T15:00:00Z";
test("new household with unknown equipment receives a useful, safe first step",()=>{
 const p=createProgress({...input,category:"appliance",equipment:""});assert.equal(nextStep(p,"next_steps_ready")?.id,"symptoms");
 assert.match(serviceBrief(p,"next_steps_ready"),/Exact model not identified/);
});
test("safety gate blocks normal steps, including dangerous symptoms despite no hazard choice",()=>{
 for(const description of ["I smell gas","There is a rotten egg smell","CO alarm is sounding","Sparks from outlet","Flooding in basement","Exposed wires","electric shock","Smoke from the appliance"]){
  const p=createProgress({...input,description});assert.equal(p.blocked,true,description);assert.equal(nextStep(p,"next_steps_ready"),null);
 }
 assert.equal(hazardDetected({...input,hazard:"unsure"}),true);
 assert.equal(hazardDetected(input),false);
});
test("attempts survive resume, never repeat, and exhausted checks lead to landlord brief",()=>{
 let p=createProgress(input),status="next_steps_ready";
 for(const id of ["devices","outage","wifi"]){
  assert.equal(nextStep(p,status)?.id,id);
  const r=changeProgress(p,status,{action:"respond",stepId:id,answer:id==="wifi"?"did_not_work":"checked",note:"Observed, not a diagnosis"},at);
  p=JSON.parse(JSON.stringify(r.progress));status=r.status;
 }
 assert.equal(status,"waiting_on_landlord");assert.equal(nextStep(p,status),null);assert.equal(p.attempts.length,3);
 assert.match(serviceBrief(p,status),/did not work/);
});
test("cannot, unsure and stop provide an escalation outcome without fabricating repair",()=>{
 for(const answer of ["cannot","unsure","stop"] as const){
  const result=changeProgress(createProgress(input),"next_steps_ready",{action:"respond",stepId:"devices",answer,note:""},at);
  assert.equal(result.status,"waiting_on_landlord");assert.equal(nextStep(result.progress,result.status),null);
 }
});
test("old step replay and unsupported observation outcomes cannot advance",()=>{
 const p=createProgress(input);
 assert.throws(()=>changeProgress(p,"next_steps_ready",{action:"respond",stepId:"wifi",answer:"worked",note:""},at));
 assert.throws(()=>changeProgress(p,"next_steps_ready",{action:"respond",stepId:"devices",answer:"worked",note:""},at));
});
test("resolution, recurrence and editable brief preserve underlying evidence",()=>{
 const p=createProgress(input);
 const resolved=changeProgress(p,"next_steps_ready",{action:"resolve",note:"Provider replaced damaged line."},at);
 assert.equal(resolved.status,"resolved");assert.equal(nextStep(resolved.progress,resolved.status),null);
 const reopened=changeProgress(resolved.progress,resolved.status,{action:"reopen",note:"Connection failed again."},at);
 assert.equal(reopened.progress.attempts.length,2);assert.equal(nextStep(reopened.progress,reopened.status),null);
 const edited=changeProgress(reopened.progress,reopened.status,{action:"brief",text:"Please inspect the returning problem."},at);
 assert.equal(edited.progress.attempts.length,2);assert.equal(edited.progress.brief,"Please inspect the returning problem.");
 assert.throws(()=>changeProgress(edited.progress,edited.status,{action:"reopen",note:"again"},at));
});
test("intake is bounded and safety choice cannot be omitted",()=>{
 const {hazard,...missing}=input;void hazard;
 assert.equal(startSchema.safeParse(missing).success,false);
 assert.equal(startSchema.safeParse({...input,description:"x".repeat(1501)}).success,false);
 assert.equal(startSchema.safeParse({...input,category:"invented"}).success,false);
});

test("a newly reported hazard stops the next step",()=>{const r=changeProgress(createProgress(input),"next_steps_ready",{action:"respond",stepId:"devices",answer:"checked",note:"I now see smoke near the router"},at);assert.equal(r.progress.blocked,true);assert.equal(nextStep(r.progress,r.status),null);});

test("long history still permits resolution and creates a bounded recent brief",()=>{const p=createProgress(input);p.attempts=Array.from({length:100},()=>({stepId:"note",title:"Saved observation",answer:"checked",note:"x".repeat(1000),at}));const r=changeProgress(p,"waiting_on_professional",{action:"resolve",note:"Professional completed the repair."},at);assert.equal(r.status,"resolved");const brief=serviceBrief(r.progress,r.status);assert.ok(brief.length<6000);assert.match(brief,/Professional completed/);});

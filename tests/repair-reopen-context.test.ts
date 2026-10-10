import test from "node:test";
import assert from "node:assert/strict";
import {createProgress,changeProgress,nextStep,serviceBrief,type Intake} from "../src/lib/issues/session";
test("recurring problems preserve history and the renter or owner escalation path",()=>{
 for(const context of ["renter","owner"] as const){
  const intake:Intake={title:"Faucet drips",description:"The kitchen tap drips after it is turned off.",category:"plumbing",equipment:"",context,hazard:"none"};
  const resolved=changeProgress(createProgress(intake,true),"next_steps_ready",{action:"resolve",note:"Technician repaired the tap."},"2026-10-10T12:00:00Z");
  const reopened=changeProgress(resolved.progress,resolved.status,{action:"reopen",note:"The dripping returned."},"2026-10-11T12:00:00Z");
  assert.equal(reopened.status,context==="renter"?"waiting_on_landlord":"waiting_on_professional");
  assert.equal(nextStep(reopened.progress,reopened.status),null);
  assert.match(serviceBrief(reopened.progress,reopened.status),/Technician repaired/);
  assert.match(serviceBrief(reopened.progress,reopened.status),/dripping returned/);
 }
});

import {availableGuideSelectionSchema,acceptGuideSelection} from "../src/lib/issues/adaptive-guidance";
test("model identifiers are constrained to supplied evidence without weakening acceptance",()=>{
 const p=createProgress({title:"Fridge door",description:"The refrigerator is warm and the door is blocked.",category:"appliance",equipment:"",context:"owner",hazard:"none"},true);
 const source={id:"fridge",label:"Manufacturer",url:"https://www.whirlpool.ca/en_ca/blog/kitchen/refrigerator-troubleshooting.html",checkedAt:"2026-10-10",scope:"general" as const,text:"Move containers preventing the refrigerator door from closing."};
 const schema=availableGuideSelectionSchema(p,[source]);
 const choice={disposition:"check",stepId:"fridge-door",explanation:"An obstruction can prevent closure.",uncertainty:"The exact model is unknown.",sourceId:"fridge",passageId:"fridge:0"};
 assert.equal(schema.safeParse(choice).success,true);
 assert.equal(schema.safeParse({...choice,passageId:"fridge:999"}).success,false);
 assert.equal(schema.safeParse({...choice,sourceId:"invented"}).success,false);
 assert.equal(schema.safeParse({...choice,stepId:"invented"}).success,false);
 assert.equal(acceptGuideSelection(choice,p,[source],"2026-10-10").sources[0].quote,source.text);
 assert.throws(()=>acceptGuideSelection({...choice,sourceId:"",passageId:""},p,[],"2026-10-10"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {acceptGuideSelection} from "../src/lib/issues/adaptive-guidance";
import {createProgress,nextStep} from "../src/lib/issues/session";
import {remainingGuideSteps} from "../src/lib/issues/repair-guides";
const p=()=>createProgress({title:"Kitchen tap",description:"Only the kitchen tap has weak flow. Other taps seem normal.",category:"plumbing",equipment:"",context:"renter",hazard:"none"},true);
const evidence=[{id:"tap",label:"Moen",url:"https://solutions.moen.com/Article_Library/Faucet_Aerator_Cleaning",checkedAt:"2026-10-01",scope:"general" as const,text:"Debris at the aerator can restrict the water flow at a faucet."}];
const response={disposition:"check",stepId:"tap-outlet",explanation:"The reported problem is limited to one tap; visible buildup is one possible clue.",uncertainty:"This is not a confirmed fault.",sourceId:"tap",passageId:"tap:0"};
test("fallback does not ask known scope again",()=>assert.equal(nextStep(p(),"next_steps_ready")?.id,"tap-outlet"));
test("AI chooses a safe authored step with actual evidence",()=>{const result=acceptGuideSelection(response,p(),evidence,new Date().toISOString());assert.equal(result.step?.id,"tap-outlet");assert.match(result.step!.detail,/without removing/);assert.equal(result.sources[0].quote,evidence[0].text);});
test("invented actions, mismatched sources and unsupported quotations fail closed",()=>{for(const patch of [{stepId:"remove-aerator"},{sourceId:"invented"},{passageId:"tap:999"}])assert.throws(()=>acceptGuideSelection({...response,...patch},p(),evidence,new Date().toISOString()));});
test("failed authored step cannot be repeated",()=>{const progress=p();progress.attempts=[{stepId:"tap-outlet",title:"Previous check",answer:"cannot",note:"",at:"2026-10-01"}];assert.throws(()=>acceptGuideSelection(response,progress,evidence,new Date().toISOString()));});
test("whole-home low pressure does not trigger faucet disassembly questions",()=>{const progress=p();progress.intake.description="All taps have weak flow.";assert.deepEqual(remainingGuideSteps(progress),[]);});
test("escalation retains uncertainty without inventing a repair",()=>{const r=acceptGuideSelection({...response,disposition:"escalate",stepId:"",sourceId:"",passageId:"",explanation:"The available checks do not establish the cause. The saved symptoms can help your landlord arrange the next investigation."},p(),[],new Date().toISOString());assert.equal(r.step,null);assert.equal(r.disposition,"escalate");});

test("unsafe advice cannot be smuggled into explanation or uncertainty",()=>{for(const patch of [{explanation:"Unthread the aerator to inspect the inside."},{uncertainty:"Unscrew the cover to investigate further."}])assert.throws(()=>acceptGuideSelection({...response,...patch},p(),evidence,new Date().toISOString()));});

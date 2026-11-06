import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {warrantyClaimInput,checkedClaimEvidence,claimWarnings,manualWarrantyDraft,type ClaimSource} from "../src/lib/product/warranty-claim";
import {isProviderCreditExhausted,AI_CREDIT_MESSAGE} from "../src/lib/ai/service-failure";
import {requestUsesAi} from "../apps/mobile/src/lib/ai-sharing-policy";
import {scanMobileUpload} from "../src/lib/ai/mobile-scan";
const id=randomUUID();
const source:ClaimSource={id,title:"Dishwasher warranty",updated_at:"2026-10-01T00:00:00Z",notes:"Parts only. Labour and accidental damage excluded. Contact us within 30 days of a fault.",expires_on:"2026-10-31",hasFile:false};
test("warranty reading requires selected unique records and explicit review confirmation",()=>{
 const valid={requestId:randomUUID(),documentIds:[id],itemName:"Dishwasher",issue:"Water leaks from the door.",recordsConfirmed:true};
 assert.equal(warrantyClaimInput.safeParse(valid).success,true);
 for(const change of [{documentIds:[]},{documentIds:[id,id]},{recordsConfirmed:false},{issue:"short"},{userId:randomUUID()}])assert.equal(warrantyClaimInput.safeParse({...valid,...change}).success,false);
});
test("missing and expired evidence prompts checks without claiming denial or approval",()=>{
 const evidence={facts:[],relationship:"unclear" as const};
 const warnings=claimWarnings(evidence,[source],"2026-11-02").join(" ");
 assert.match(warnings,/No coverage wording/);assert.match(warnings,/No explicit claim deadline/);assert.match(warnings,/saved expiry date has passed/);assert.match(warnings,/unclear/);
 const draft=manualWarrantyDraft("Dishwasher","Water leaks from the door.");
 assert.match(draft,/whether warranty coverage may apply/);assert.match(draft,/Please confirm/);
 assert.doesNotMatch(draft,/you must|guaranteed|eligible|paid in full/i);
});
test("verbatim grounding rejects changed text, foreign references and fabricated text pages",()=>{
 const fact={sourceId:id,kind:"coverage",excerpt:"Parts only. Labour and accidental damage excluded.",page:null};
 assert.deepEqual(checkedClaimEvidence({facts:[fact],relationship:"consistent"},[source]).facts,[fact]);
 for(const change of [{excerpt:"All parts and labour covered."},{sourceId:randomUUID()},{page:1}])assert.throws(()=>checkedClaimEvidence({facts:[{...fact,...change}],relationship:"consistent"},[source]));
});
test("conflicting product documents are flagged, with exclusions preserved verbatim",()=>{
 const fact={sourceId:id,kind:"exclusion",excerpt:"Labour and accidental damage excluded.",page:null};
 const checked=checkedClaimEvidence({facts:[fact],relationship:"conflicting"},[source]);
 assert.match(claimWarnings(checked,[source],"2026-11-02").join(" "),/different products or conflicting terms/);
 assert.equal(checked.facts[0].excerpt,fact.excerpt);
});
test("credit exhaustion handles nested structured errors without reflecting sensitive bodies",()=>{
 assert.equal(isProviderCreditExhausted({cause:{responseBody:JSON.stringify({error:{code:"credit_balance_exhausted",message:"PRIVATE DOCUMENT"}})}}),true);
 assert.equal(isProviderCreditExhausted({errors:[{code:"insufficient_quota"}]}),true);
 assert.equal(isProviderCreditExhausted({statusCode:429,error:{code:"rate_limit_exceeded"}}),false);
 assert.equal(isProviderCreditExhausted({message:"credit_balance_exhausted"}),false);
 const cyclic:{cause?:unknown}={};cyclic.cause=cyclic;assert.equal(isProviderCreditExhausted(cyclic),false);
 assert.doesNotMatch(AI_CREDIT_MESSAGE,/PRIVATE|API key|billing/i);
});
test("failed credit-funded extraction returns allowance and keeps manual entry available",async()=>{
 let releases=0;
 const form=new FormData();form.set("kind","document");
 form.set("file",new File([new Uint8Array([0xff,0xd8,0xff,0xe0,0,1,2,3])],"receipt.jpg",{type:"image/jpeg"}));
 const response=await scanMobileUpload(new Request("https://rezlee.invalid/scan",{method:"POST",body:form}),{
  reserve:async()=>({ok:true,release:async()=>{releases++;}}),
  extract:async()=>{throw {responseBody:JSON.stringify({error:{code:"credit_balance_exhausted",message:"secret"}})};},
 });
 assert.equal(response.status,429);assert.equal(releases,1);assert.deepEqual(await response.json(),{error:AI_CREDIT_MESSAGE});
});
test("only explicit warranty reads trigger the existing AI consent path",()=>{
 assert.equal(requestUsesAi("/api/mobile/v1/warranty-claims",{recordsConfirmed:true}),true);
 assert.equal(requestUsesAi("/api/mobile/v1/vault/records"),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRogersVerification, ROGERS_REGISTRY_ID, telecomFailureMessage, isCodeInteraction } from "../src/lib/deck/telecom-auth";
import { telecomTaskSpecs } from "../src/lib/deck/telecom-spec";
const otp = {type:"mfa",fields:[{name:"code",type:"string",label:"Verification code"}]};
test("Rogers code validation preserves leading zero and removes copy/paste whitespace before claiming submission",()=>{
 assert.deepEqual(normalizeRogersVerification(ROGERS_REGISTRY_ID,otp,{code:" 012 345\n"}),{code:"012345"});
 assert.deepEqual(normalizeRogersVerification(ROGERS_REGISTRY_ID,otp,{code:"012-345"}),{code:"012345"});
 for(const code of ["12345","1234567","12a456",true,"code: 123456"])assert.throws(()=>normalizeRogersVerification(ROGERS_REGISTRY_ID,otp,{code}),/has not been submitted/);
});
test("other providers and non-code interactions retain their original dynamic contracts",()=>{
 const values={code:"abc1234"};
 assert.equal(normalizeRogersVerification("bell",otp,values),values);
 assert.equal(normalizeRogersVerification(ROGERS_REGISTRY_ID,{type:"security_question",fields:[{name:"code"}]},values),values);
 assert.equal(isCodeInteraction({type:"mfa",fields:[{name:"method",type:"select",options:[{value:"email",label:"Email"}]}]}),false);
 assert.equal(isCodeInteraction({type:"mfa",fields:[{name:"confirmed",type:"boolean"}]}),false);
});
test("generic task failure neither blames the provider nor claims nonexistent saved bills",()=>{
 assert.match(telecomFailureMessage("task_failed",0),/No statements were imported/);
 assert.match(telecomFailureMessage("task_failed",2),/saved bills are still available/);
 assert.doesNotMatch(telecomFailureMessage("task_failed",0),/provider stopped|wrong code|try again/i);
 assert.match(telecomFailureMessage("verification_loop",0),/prevent more repeated prompts/);
});
test("Rogers-specific task revisions address observed form-entry and loading states without automatic resend",()=>{
 for(const spec of telecomTaskSpecs("rogers")){
  assert.match(spec.name,/auth-guard-2/);assert.match(spec.prompt,/one digit per field/);
  assert.match(spec.prompt,/Never click Resend code automatically/);assert.match(spec.prompt,/up to 90 seconds/);
 }
 for(const spec of telecomTaskSpecs("bell"))assert.doesNotMatch(spec.prompt,/ROGERS SIGN-IN REQUIREMENTS/);
});

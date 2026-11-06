import test from "node:test";
import assert from "node:assert/strict";
import { readSocialAttempt, verifiedSocialCode, type SocialAttempt } from "../apps/mobile/src/auth/social-callback";
const now=1700000000000;
const attempt:SocialAttempt={version:1,id:"11111111-1111-4111-8111-111111111111",provider:"google",createdAt:now,flowId:"flow-1"};
const callback="rezlee://auth-return?attempt="+attempt.id+"&sb_flow_id=flow-1&code=single-use";
test("OAuth callback accepts only the locally initiated unexpired PKCE flow",()=>{
 assert.equal(verifiedSocialCode(callback,attempt,now),"single-use");
 assert.equal(readSocialAttempt(JSON.stringify(attempt),now)?.provider,"google");
 assert.equal(readSocialAttempt(JSON.stringify({...attempt,provider:"apple"}),now)?.provider,"apple");
});
test("unsolicited expired future and malformed attempts cannot sign in",()=>{
 for(const raw of [null,"{",JSON.stringify({...attempt,createdAt:now-600001}),JSON.stringify({...attempt,createdAt:now+1}),JSON.stringify({...attempt,version:2}),JSON.stringify({...attempt,provider:"unknown"})])
 assert.equal(readSocialAttempt(raw,now),null);
 assert.throws(()=>verifiedSocialCode(callback,null,now));
 assert.throws(()=>verifiedSocialCode(callback,{...attempt,createdAt:now-600001},now));
});
test("wrong scheme host path attempt and flow are rejected before exchange",()=>{
 for(const value of [callback.replace("rezlee:","https:"),callback.replace("auth-return","other"),callback.replace("?","/other?"),callback.replace(attempt.id,"22222222-2222-4222-8222-222222222222"),callback.replace("flow-1","flow-2"),callback.replace("auth-return","user@auth-return"),callback.replace("auth-return","auth-return:123")])
 assert.throws(()=>verifiedSocialCode(value,attempt,now));
});
test("ambiguous duplicate parameters and bearer-token fragments are rejected",()=>{
 for(const value of [callback+"&code=other",callback+"&attempt="+attempt.id,callback+"&sb_flow_id=flow-1",callback+"#access_token=untrusted",callback.replace("code=single-use","code=")])
 assert.throws(()=>verifiedSocialCode(value,attempt,now));
});
test("provider failures do not expose their descriptions",()=>{
 assert.throws(()=>verifiedSocialCode(callback+"&error=access_denied&error_description=private",attempt,now),e=>e instanceof Error&&!e.message.includes("private"));
});

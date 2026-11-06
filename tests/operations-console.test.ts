import test from "node:test";
import assert from "node:assert/strict";
import { operatorAllowed, operatorVerified, safeJob } from "../src/lib/ops/policy";
const id = "68f4e6ba-f9b8-425e-b2c8-4d588241091a";
test("operations is disabled by default and IDs never accept emails or wildcards", () => {
 assert.equal(operatorAllowed(id, {}), false);
 assert.equal(operatorAllowed(id, { REZLEE_OPS_ENABLED: "true", REZLEE_OPS_USER_IDS: "*" }), false);
 assert.equal(operatorAllowed(id, { REZLEE_OPS_ENABLED: "true", REZLEE_OPS_USER_IDS: ` ${id} ` }), true);
});
test("verified MFA claims must match the authenticated user", () => {
 assert.equal(operatorVerified(id, {sub:id,aal:"aal1"}),false);
 assert.equal(operatorVerified(id, {sub:"other",aal:"aal2"}),false);
 assert.equal(operatorVerified(id, {sub:id,aal:"aal2"}),true);
});
test("snapshot projection strips identity, sensitive errors, raw payload and provider credentials", () => {
 const result = safeJob("ezgb", {id,status:"failed",created_at:"2026-09-29T00:00:00Z",user_id:"SECRET",last_error:"PASSWORD",metadata:{password:"SENSITIVE"},result:{bill:"PRIVATE"}});
 assert.equal(JSON.stringify(result).includes("SECRET"),false);
 assert.equal(JSON.stringify(result).includes("PASSWORD"),false);
 assert.equal(JSON.stringify(result).includes("PRIVATE"),false);
 assert.equal(result.attention,true);
});
test("expired jobs become stalled; successful jobs are never rewritten", () => {
 const row={id,status:"running",created_at:"2026-09-28T00:00:00Z",expires_at:"2026-09-28T00:06:00Z"};
 assert.equal(safeJob("ezgb",row,Date.parse("2026-09-29")).state,"stalled");
 assert.equal(safeJob("ezgb",{...row,status:"succeeded"},Date.parse("2026-09-29")).state,"succeeded");
});
test("unknown states are not reported as healthy", () => {assert.equal(safeJob("deck",{id,status:"unexpected"}).attention,true);});

test("Deck success stays healthy and MFA appears in the attention queue", () => {
 assert.equal(safeJob("deck",{id,status:"success"}).attention,false);
 const job=safeJob("deck",{id,status:"requires_user_action"});
 assert.equal(job.attention,true);assert.match(job.nextStep,/verification/);
});


test("Gmail diagnostics explain limits without exposing mailbox or credentials",()=>{
 const now=Date.parse("2026-10-02T05:00:00Z"),base={id:"11111111-1111-4111-8111-111111111111",created_at:"2026-10-01T05:00:00Z",updated_at:new Date(now-600000).toISOString(),lease_until:null,work_phase:"read",email:"private@example.invalid",token_cipher:"secret",work:{ids:["private-message"]}};
 const limit=safeJob("gmail",{...base,status:"paused",error_code:"capacity"},now);
 assert.equal(limit.state,"usage_limit");assert.equal(limit.attention,true);assert.match(limit.nextStep,/hosting upgrade/);
 assert.ok(!JSON.stringify(limit).includes("private"));assert.ok(!JSON.stringify(limit).includes("secret"));
 assert.equal(safeJob("gmail",{...base,status:"paused",error_code:null},now).attention,false);
 assert.equal(safeJob("gmail",{...base,status:"active"},now).state,"stalled");
 assert.equal(safeJob("gmail",{...base,status:"active",lease_until:new Date(now+60000).toISOString()},now).attention,false);
 assert.equal(safeJob("gmail",{...base,status:"active",work_phase:"complete"},now).attention,false);
 assert.equal(safeJob("gmail",{...base,status:"disconnected"},now).attention,false);
 assert.equal(safeJob("gmail",{...base,status:"paused",error_code:"private arbitrary error"},now).state,"needs_attention");
 assert.equal(safeJob("gmail",{...base,status:"reconnect"},now).state,"reconnect_needed");
});

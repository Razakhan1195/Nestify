import test from "node:test";
import assert from "node:assert/strict";
import { completeOperatorOAuth, operatorSignInMessage } from "../src/lib/ops/oauth";

test("cancelled Google consent never exchanges a code or exposes provider text", async () => {
  const result = await completeOperatorOAuth(new URLSearchParams("error=access_denied&code=ignored&error_description=SECRET"), async () => { throw Error("must not run"); });
  assert.equal(result, "cancelled"); assert.doesNotMatch(operatorSignInMessage(result)!, /SECRET/);
});
test("missing and oversized authorization codes fail before exchange", async () => {
  for (const value of ["", "x".repeat(4097)]) {
    let calls = 0;
    assert.equal(await completeOperatorOAuth(new URLSearchParams({code:value}), async () => { calls++; return {error:null}; }), "failed");
    assert.equal(calls, 0);
  }
});
test("valid code exchanges once; untrusted next destination grants nothing", async () => {
  const calls: string[] = [];
  const result = await completeOperatorOAuth(new URLSearchParams("code=test-code&next=https://evil.invalid/admin"), async code => {calls.push(code);return {error:null};});
  assert.equal(result, null); assert.deepEqual(calls, ["test-code"]);
});
test("expired exchanges and service failures return only a safe error", async () => {
  assert.equal(await completeOperatorOAuth(new URLSearchParams("code=expired"), async () => ({error:{message:"PRIVATE"}})), "failed");
  assert.equal(await completeOperatorOAuth(new URLSearchParams("code=expired"), async () => {throw Error("PRIVATE");}), "failed");
  assert.equal(operatorSignInMessage("<script>PRIVATE</script>"), null);
});

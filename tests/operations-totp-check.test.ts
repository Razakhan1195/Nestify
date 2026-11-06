import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { checkSetupCode, setupCodeAdvice } from "../src/lib/ops/totp-check";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const fixture = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // RFC 6238 SHA-1 test secret; NOT a customer secret.
test("accepts a time-aligned 6 digit TOTP solely for diagnostic purposes", async () => {
  assert.equal(await checkSetupCode(fixture, "287082", 59000), "matches-current-qr");
});
test("rejects malformed values without attempting any server check", async () => {
  assert.equal(await checkSetupCode(fixture, "abc", 59000), "unavailable");
  assert.equal(await checkSetupCode("!invalid", "287082", 59000), "unavailable");
});
test("detects a different QR entry without accepting access", async () => {
  assert.equal(await checkSetupCode(fixture, "000000", 59000), "different-entry");
  assert.match(setupCodeAdvice("matches-current-qr"), /Supabase rejected/);
  assert.match(setupCodeAdvice("time-skew"), /automatic date and time/);
});

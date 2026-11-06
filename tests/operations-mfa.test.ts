import test from "node:test";
import assert from "node:assert/strict";
import { incompleteOperatorFactors, operatorMfaError, verifiedOperatorFactor } from "../src/lib/ops/mfa";

const verified = { id: "safe-existing", factor_type: "totp", status: "verified", friendly_name: "Rezlee operations" };
const stale = { id: "expired-setup", factor_type: "totp", status: "unverified", friendly_name: "Rezlee operations" };

test("a verified Rezlee factor is reused and never selected for cleanup", () => {
  const factors = [stale, { id: "other", factor_type: "phone", status: "verified" }, verified];
  assert.equal(verifiedOperatorFactor(factors)?.id, verified.id);
  assert.deepEqual(incompleteOperatorFactors(factors).map(f => f.id), [stale.id]);
});

test("unverified factors are not accepted as linked authenticators", () => {
  assert.equal(verifiedOperatorFactor([stale]), null);
  assert.deepEqual(incompleteOperatorFactors([stale]), [stale]);
});

test("never clean up another app's factor or a verified operator factor", () => {
  const factors = [verified, { id: "outside", factor_type: "totp", status: "unverified", friendly_name: "Another app" }];
  assert.deepEqual(incompleteOperatorFactors(factors), []);
});

test("MFA failures distinguish expired setup, invalid code, service outage, and rate limit", () => {
  assert.match(operatorMfaError({code:"mfa_verification_failed",status:422}, "verify"), /code mismatch/);
  assert.match(operatorMfaError({code:"mfa_ip_address_mismatch",status:422}, "verify"), /different network addresses/);
  assert.match(operatorMfaError({code:"mfa_verification_rejected",status:422}, "verify"), /security policy/);
  assert.match(operatorMfaError({code:"mfa_totp_verify_not_enabled",status:422}, "verify"), /configuration/);
  assert.match(operatorMfaError({code:"new_provider_reason",status:422}, "verify"), /new_provider_reason/);
  assert.match(operatorMfaError({code:"mfa_factor_not_found",status:404}, "verify"), /no longer valid/);
  assert.match(operatorMfaError({status:429}, "verify"), /Too many attempts/);
  assert.match(operatorMfaError({status:401}, "verify"), /session expired/);
  assert.match(operatorMfaError({status:503}, "verify"), /service could not be reached/);
  assert.match(operatorMfaError({code:"mfa_totp_verify_disabled"}, "verify"), /configuration/);
});

test("unknown errors do not leak sensitive messages", () => {
  const message = operatorMfaError({ message: "private secret should never appear", status:400 }, "verify");
  assert.doesNotMatch(message, /private|secret/);
});

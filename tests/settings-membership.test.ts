import test from "node:test";
import assert from "node:assert/strict";
import { membershipPresentation } from "../apps/mobile/src/lib/membership-presentation";
const base = { plan: "pro" as const, source: "founder", lifetime: true, household: false, expiresAt: null, homeId: null, founderSeen: true, activated: true };
test("household inheritance never promises personally owned lifetime Pro", () => {
 const own = membershipPresentation({ enabled: true, purchasesAvailable: false, membership: base }); assert.equal(own.lifetime, true);
 const shared = membershipPresentation({ enabled: true, purchasesAvailable: false, membership: { ...base, household: true } }); assert.equal(shared.lifetime, false); assert.match(shared.badge, /HOUSEHOLD/); assert.doesNotMatch(shared.detail, /yours for life/);
});
test("unknown membership never masquerades as a free or paid plan", () => {
 assert.equal(membershipPresentation(null).badge, "CHECKING ACCESS"); assert.equal(membershipPresentation({ enabled: true, purchasesAvailable: false }).badge, "CHECKING ACCESS");
 assert.equal(membershipPresentation({ enabled: false, purchasesAvailable: false }).title, "Rezlee");
});

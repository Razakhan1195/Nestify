import test from "node:test";
import assert from "node:assert/strict";
import { proWelcomeCopy } from "../apps/mobile/src/lib/membership-welcome";
import type { Membership } from "../apps/mobile/src/lib/membership-types";
const base: Membership = { plan: "pro", source: "founder", lifetime: true, household: false, expiresAt: null, homeId: null, founderSeen: false, activated: true };
test("Pro welcomes explain the actual benefit without promising lifetime to temporary or shared members", () => {
 assert.match(proWelcomeCopy({...base,founderReason:"waitlist"}).detail,/waitlist/);
 assert.match(proWelcomeCopy({...base,founderReason:"first_1000"}).detail,/1,000/);
 assert.doesNotMatch(proWelcomeCopy({...base,household:true}).detail,/for life/);
 assert.match(proWelcomeCopy({...base,lifetime:false,source:"referral"}).detail,/No card needed and no automatic renewal/);
 assert.match(proWelcomeCopy({...base,lifetime:false,source:"store"}).detail,/subscription is confirmed/);
 assert.doesNotMatch(proWelcomeCopy({...base,lifetime:false,source:"goodwill"}).detail,/subscription|for life/);
});

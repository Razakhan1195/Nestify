import test from "node:test";
import assert from "node:assert/strict";
import { householdInviterName } from "../src/lib/household/inviter-name";

test("invitations use the profile name the customer last saved, before a stale table name", () => {
 assert.equal(householdInviterName({ full_name: "Sunbul Butt", name: "Older name" }, "Old table name"), "Sunbul Butt");
 assert.equal(householdInviterName({ full_name: "  ", name: "Amélie O’Neil" }), "Amélie O’Neil");
 assert.equal(householdInviterName({}, "Raza Khan"), "Raza Khan");
});
test("missing names have a natural fallback and never expose email or control characters", () => {
 assert.equal(householdInviterName({ email: "sunbul.butt4@example.com" }), "Someone in your household");
 assert.equal(householdInviterName({ full_name: "user@example.com" }), "Someone in your household");
 assert.equal(householdInviterName({ full_name: "Sunbul\nButt" }), "Sunbul Butt");
 assert.equal(householdInviterName({ full_name: "x".repeat(101) }), "Someone in your household");
});

test("invitations respect the customer preference over refreshed provider metadata",()=>{
 assert.equal(householdInviterName({rezlee_display_name:"Amélie",full_name:"Old provider"}),"Amélie");
});

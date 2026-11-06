import assert from "node:assert/strict";
import test from "node:test";
import { homeAvailability, homeSources } from "../src/lib/product/home-availability";
import { homeBrief } from "../apps/mobile/src/lib/home-brief";
type Input = Parameters<typeof homeBrief>[0];
const home = { accessRole: "owner", dashboardState: "EMPTY", attentionItems: [], upcoming: [] } as unknown as Input;
test("failed Home sections cannot produce empty success for older clients", () => {
 for (const source of homeSources) assert.equal(homeAvailability([source], false).reject, true);
 assert.equal(homeAvailability([], false).reject, false);
});
test("partial clients retain successful sections but cannot revive handled attention", () => {
 const availability = homeAvailability(["resolutions"], true);
 assert.equal(availability.reject, false);
 assert.equal(availability.canShowAttention, false);
 assert.equal(homeAvailability(homeSources, true).reject, true);
});
test("unavailable Home overrides empty, steady and attention outcomes", () => {
 for (const dashboardState of ["EMPTY", "EARLY", "ACTIVE", "ATTENTION", "STABLE"] as const) {
  const result = homeBrief({ ...home, dashboardState }, true);
  assert.equal(result.kind, "retry");
  assert.ok(!result.title.includes("Nothing urgent"));
 }
});
test("a member first visit directs to shared Care, never adding private bills", () => {
 assert.equal(homeBrief({ ...home, accessRole: "member" }, false).kind, "care");
 assert.equal(homeBrief(home, false).kind, "add");
});
test("first attention item outranks upcoming and setup", () => {
 const input = { ...home, attentionItems: [{ title: "Statement changed", explanation: "Review the saved statement.", cta: "Review" }] } as Input;
 assert.equal(homeBrief(input, false).kind, "attention");
});

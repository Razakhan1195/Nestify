import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleStatements, readStartingGoal, startingHistory } from "../apps/mobile/src/lib/home-start";

test("a starting preference survives serialization, is scoped to its home, and accepts only known goals", () => {
  const metadata = JSON.parse(JSON.stringify({ rezlee_start: { version: 1, homeId: "home-a", goal: "records" } }));
  assert.equal(readStartingGoal(metadata, "home-a"), "records");
  assert.equal(readStartingGoal(metadata, "home-b"), null);
  assert.equal(readStartingGoal({ rezlee_start: { version: 1, homeId: "home-a", goal: "admin" } }, "home-a"), null);
  assert.equal(readStartingGoal(null, "home-a"), null);
});

test("first statements unlock only their own account's comparison", () => {
  const first = startingHistory(exampleStatements.slice(0, 1), true, "2026-07-01")!;
  assert.equal(first.canBuild, true); assert.equal(first.completed, 1); assert.equal(first.ready, false);
  const second = startingHistory(exampleStatements.slice(0, 2), true, "2026-07-01")!;
  assert.equal(second.completed, 2); assert.equal(second.ready, false);
  const mixed = startingHistory(exampleStatements.map((bill, i) => ({ ...bill, accountNumber: `account-${i}` })), true, "2026-07-01")!;
  assert.equal(mixed.completed, 1); assert.equal(mixed.ready, false);
  const duplicate = startingHistory([exampleStatements[0], exampleStatements[0]], true, "2026-07-01")!;
  assert.equal(duplicate.completed, 1);
});

test("the example's 20% comparison is generated from actual statement arithmetic", () => {
  const result = startingHistory(exampleStatements, true, "2026-07-01")!;
  assert.equal(result.ready, true); assert.equal(result.completed, 3);
  assert.equal(result.analysis.latest?.dailyMinor, 360);
  assert.equal(result.analysis.comparison?.baselineDailyMinor, 300);
  assert.equal(result.analysis.comparison?.percent, 20);
});

test("partial, overlapping, future or unidentified history never receives an unlock promise", () => {
  for (const [rows, complete] of [
    [exampleStatements, false],
    [exampleStatements.map((bill, i) => i === 2 ? { ...bill, billingPeriodStart: "2026-05-15" } : bill), true],
    [exampleStatements.map(bill => ({ ...bill, accountNumber: null })), true],
    [exampleStatements.map((bill, i) => i === 2 ? { ...bill, billingPeriodEnd: "2027-06-30" } : bill), true],
  ] as const) {
    const result = startingHistory([...rows], complete, "2026-07-01")!;
    assert.equal(result.ready, false); assert.equal(result.canBuild, false); assert.equal(result.completed, null);
  }
});

test("connected data does not count toward manual progress", () => {
  assert.equal(startingHistory(exampleStatements.map(bill => ({ ...bill, source: "ezgb" })), true, "2026-07-01"), null);
});

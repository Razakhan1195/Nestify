import test from "node:test";
import assert from "node:assert/strict";
import { tasksForRoutine } from "../apps/mobile/src/lib/cleaning-routines";

test("routine dates are calculated when opened, not frozen when the app bundle loads", () => {
  const before = tasksForRoutine("balanced", new Date(2026, 8, 24, 23, 30));
  const after = tasksForRoutine("balanced", new Date(2026, 8, 25, 0, 30));
  assert.equal(before[0].due_date, "2026-09-24"); assert.equal(after[0].due_date, "2026-09-25");
  assert.equal(after.find(t => t.title === "Take out household bins")?.due_date, "2026-09-27");
});
test("all cleaning levels produce valid recurring tasks and preserve month/year rollover", () => {
  for (const level of ["light", "balanced", "thorough"] as const) {
    const rows = tasksForRoutine(level, new Date(2026, 11, 31, 23));
    assert.ok(rows.length > 0 && rows.length <= 12);
    assert.equal(new Set(rows.map(r => r.title)).size, rows.length);
    for (const row of rows) { assert.match(row.due_date, /^202[67]-\d{2}-\d{2}$/); assert.ok(["daily", "weekly", "biweekly", "monthly"].includes(row.recurrence)); }
    assert.equal(rows.find(t => t.title === "Take out household bins")?.due_date, "2027-01-02");
  }
});

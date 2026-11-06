import assert from "node:assert/strict";
import test from "node:test";
import { hasCompleteUsage } from "../src/lib/utility/coverage";

function readings(date: string, hours: number) {
  const clock = Array.from({ length: 24 }, (_, i) => i);
  if (date === "2026-03-08") clock.splice(2, 1);
  if (date === "2026-11-01") clock.splice(1, 0, 1);
  return clock.slice(0, hours).map((hour) => ({
    intervalStartLocal: date + " " + String(hour).padStart(2, "0") + ":00:00",
    intervalMinutes: 60, valueKwh: 1,
  }));
}
test("coverage rejects missing hours and accepts complete normal and DST days", () => {
  for (const [date, hours] of [["2026-07-15", 24], ["2026-03-08", 23], ["2026-11-01", 25]] as const) {
    const period = { start: date, end: date };
    assert.equal(hasCompleteUsage(readings(date, hours), period), true);
    assert.equal(hasCompleteUsage(readings(date, hours - 1), period), false);
  }
  assert.equal(hasCompleteUsage([], { start: "2026-07-15", end: "2026-07-15" }), false);
});

test("duplicate hours cannot hide a missing hour", () => {
  const rows = readings("2026-07-15", 24);
  rows[12] = { ...rows[11] };
  assert.equal(hasCompleteUsage(rows, { start: "2026-07-15", end: "2026-07-15" }), false);
});

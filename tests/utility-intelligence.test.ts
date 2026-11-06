import assert from "node:assert/strict";
import test from "node:test";

import {
  compareOntarioPlans,
  touPeriodFor,
  uloPeriodFor,
} from "../src/lib/utility/ontario-rpp";
import {
  billReconciliation,
  buildUsageIntelligence,
} from "../src/lib/utility/intelligence";

test("Ontario TOU classifies summer weekdays, weekends and holidays correctly", () => {
  assert.equal(touPeriodFor("2026-07-15 12:00:00"), "on_peak");
  assert.equal(touPeriodFor("2026-07-15 18:00:00"), "mid_peak");
  assert.equal(touPeriodFor("2026-07-15 23:00:00"), "off_peak");
  assert.equal(touPeriodFor("2026-07-18 12:00:00"), "off_peak");
  assert.equal(touPeriodFor("2026-09-07 12:00:00"), "off_peak");
});

test("Ontario ULO uses overnight and weekday peak windows", () => {
  assert.equal(uloPeriodFor("2026-07-15 23:00:00"), "ultra_low");
  assert.equal(uloPeriodFor("2026-07-15 18:00:00"), "on_peak");
  assert.equal(uloPeriodFor("2026-07-18 12:00:00"), "weekend_off_peak");
});
test("plan replay uses the published November 2025 Ontario RPP prices", () => {
  const comparison = compareOntarioPlans([
    { intervalStartLocal: "2026-07-15 12:00:00", valueKwh: 100, intervalMinutes: 60 },
    { intervalStartLocal: "2026-07-15 18:00:00", valueKwh: 100, intervalMinutes: 60 },
    { intervalStartLocal: "2026-07-15 23:00:00", valueKwh: 100, intervalMinutes: 60 },
  ]);

  assert.ok(Math.abs(comparison.tou.cost - 45.8) < 0.001);
  assert.ok(Math.abs(comparison.ulo.cost - 58.7) < 0.001);
  assert.ok(Math.abs(comparison.tiered.cost - 36) < 0.001);
  assert.equal(comparison.cheapestPlan, "tiered");
});

test("bill validation treats a few cents of meter-to-bill variance as matched", () => {
  const result = billReconciliation({
    billedEnergyCharge: 177.36,
    calculatedEnergyCharge: 177.40569,
  });

  assert.equal(result.status, "matched");
  assert.ok(Math.abs((result.difference ?? 0) + 0.04569) < 0.0001);
});
test("usage intelligence reports period change and TOU shares", () => {
  const current = [
    { intervalStartLocal: "2026-07-15 12:00:00", valueKwh: 4, intervalMinutes: 60 },
    { intervalStartLocal: "2026-07-15 18:00:00", valueKwh: 3, intervalMinutes: 60 },
    { intervalStartLocal: "2026-07-15 23:00:00", valueKwh: 3, intervalMinutes: 60 },
  ];
  const previous = [
    { intervalStartLocal: "2026-06-15 12:00:00", valueKwh: 2, intervalMinutes: 60 },
    { intervalStartLocal: "2026-06-15 18:00:00", valueKwh: 2, intervalMinutes: 60 },
    { intervalStartLocal: "2026-06-15 23:00:00", valueKwh: 1, intervalMinutes: 60 },
  ];

  const result = buildUsageIntelligence({
    current,
    previous,
    currentPeriod: { start: "2026-07-15", end: "2026-07-15" },
    previousPeriod: { start: "2026-06-15", end: "2026-06-15" },
    currentRatePlan: "tou",
  });

  assert.equal(result.totalKwh, 10);
  assert.equal(result.previousTotalKwh, 5);
  assert.equal(result.vsPreviousPercent, 100);
  assert.equal(result.tou.onPeakPercent, 40);
  assert.equal(result.tou.midPeakPercent, 30);
  assert.equal(result.tou.offPeakPercent, 30);
});

test("shifting ten percent of on-peak use preserves consumption and estimates only the TOU difference", () => {
  const result = buildUsageIntelligence({
    current: [{ intervalStartLocal: "2026-07-15 12:00:00", valueKwh: 100, intervalMinutes: 60 }],
    previous: [], currentPeriod: { start: "2026-07-15", end: "2026-07-15" }, currentRatePlan: "tou",
  });
  assert.equal(result.shiftScenario.shiftedKwh, 10);
  assert.ok(Math.abs(result.shiftScenario.estimatedSavings - 1.05) < 0.000001);
  assert.equal(result.totalKwh, 100);
});

test("unknown plans cannot produce switching savings or a successful bill check", () => {
  const result = buildUsageIntelligence({
    current: [{ intervalStartLocal: "2026-07-15 12:00:00", valueKwh: 10, intervalMinutes: 60 }],
    previous: [], currentPeriod: { start: "2026-07-15", end: "2026-07-15" },
  });
  assert.equal(result.ratePlanComparison.potentialSavings, null);
  assert.equal(billReconciliation({ billedEnergyCharge: 12, calculatedEnergyCharge: result.ratePlanComparison.currentPlanCost }).status, "unavailable");
});

test("daily usage comparison accounts for different billing period lengths", () => {
  const result = buildUsageIntelligence({
    current: [{ intervalStartLocal: "2026-07-15 12:00:00", valueKwh: 310, intervalMinutes: 60 }],
    previous: [{ intervalStartLocal: "2026-06-15 12:00:00", valueKwh: 300, intervalMinutes: 60 }],
    currentPeriod: { start: "2026-07-01", end: "2026-07-31" },
    previousPeriod: { start: "2026-06-01", end: "2026-06-30" },
  });
  assert.equal(result.vsPreviousPercent, 3);
  assert.equal(result.dailyUsageChangePercent, 0);
  assert.equal(result.averageDailyKwh, 10);
});
test("tiered threshold estimate scales with period and splits at season boundaries", () => {
  const long = compareOntarioPlans([], undefined, { start: "2026-06-01", end: "2026-07-30" });
  assert.ok(Math.abs(long.tiered.thresholdKwh - 1200) < 0.001);
  const crossing = compareOntarioPlans([
    { intervalStartLocal: "2025-10-31 12:00:00", valueKwh: 10, intervalMinutes: 60 },
    { intervalStartLocal: "2025-11-01 12:00:00", valueKwh: 10, intervalMinutes: 60 },
  ], undefined, { start: "2025-10-31", end: "2025-11-01" });
  assert.ok(Math.abs(crossing.tiered.thresholdKwh - (600 + 1000) / 30) < 0.001);
  assert.ok(Math.abs(crossing.tiered.cost - 2.13) < 0.001);
});

import test from "node:test";
import assert from "node:assert/strict";
import { currentOntarioRates, isPlanScenario, manualPlanScenario, ratesAreCurrent, recordedElectricityPlan, scenarioTierThreshold } from "../apps/mobile/src/lib/ontario-plan-scenario";
import { evidenceDefaults } from "../apps/mobile/src/lib/statement-evidence";
import type { EnergyEvidence, EnergyLine } from "../apps/mobile/src/lib/energy-evidence";
import type { HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
import { buildCurrentPlanScenario, selectCurrentPlanStatement } from "../src/lib/utility/current-plan";
import { compareOntarioPlans, touPeriodFor, uloPeriodFor, type UsageReading } from "../src/lib/utility/ontario-rpp";
import type { SavedStatement } from "../src/lib/utility/multi-period";

const today = "2026-09-27";
function line(band: EnergyLine["band"], quantity: string): EnergyLine { return { label: band, kind: "energy", amount: "", quantity, unit: "kWh", rate: "", rateUnit: "", band, quote: "" }; }
function bill(patch: Partial<HistoryBill> = {}): HistoryBill { return { id: "manual-a", label: "Electricity", providerName: "Example Hydro", providerId: null, category: "Electricity", categoryId: "electricity", accountNumber: "Home A", currency: "CAD", source: "manual", isHistoricalStatement: true,
  amount: 123, billingPeriodStart: "2026-08-01", billingPeriodEnd: "2026-08-30",
  reviewedEvidence: { ...evidenceDefaults, usage: "600", unit: "kWh", reading: "actual", ratePlan: "Time-of-Use" },
  reviewedEnergyEvidence: { version: 1, service: "electricity", scope: "single_service", lines: [line("off_peak", "300"), line("mid_peak", "200"), line("on_peak", "100")] }, ...patch }; }
function readings(start: string, end = start): UsageReading[] {
  const rows: UsageReading[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) for (let h = 0; h < 24; h++) rows.push({ intervalStartLocal: new Date(t).toISOString().slice(0, 10) + ` ${String(h).padStart(2, "0")}:00:00`, intervalMinutes: 60, valueKwh: 1 });
  return rows;
}
function saved(start: string, end = start): SavedStatement { return { id: "connected-a", billing_period_start: start, billing_period_end: end, raw_data: { ezgb_export: { charge_totals: { "Off-Peak": 20, "On-Peak": 1 } } } }; }

test("OEB verified rates are bounded by a separate review deadline", () => {
  assert.equal(currentOntarioRates.tou.on_peak, .203); assert.equal(currentOntarioRates.ulo.on_peak, .391);
  assert.equal(ratesAreCurrent(today), true); assert.equal(ratesAreCurrent("2026-10-26"), true);
  assert.equal(ratesAreCurrent("2026-10-27"), false); assert.equal(ratesAreCurrent("2026-09-26"), false);
  const stale = manualPlanScenario(bill(), "2026-11-01"); assert.equal(stale.status, "rates_need_review"); assert.deepEqual(stale.plans, []);
});
test("one reviewed TOU bill calculates exact band products and does not invent ULO", () => {
  const result = manualPlanScenario(bill(), today);
  assert.equal(result.status, "ready"); assert.equal(result.recordedPlan, "tou");
  assert.deepEqual(result.plans, [{ plan: "tou", minor: 8110 }, { plan: "tiered", minor: 7200 }]);
  assert.equal(result.missing[0].plan, "ulo"); assert.equal(result.kwh, 600); assert.equal(result.thresholdKwh, 600);
  assert.equal("savings" in result, false); assert.equal("recommendedPlan" in result, false);
});
test("balance, amount due and previous payments never enter plan estimates", () => {
  const a = bill(), b = bill({ amount: 9999, reviewedEvidence: { ...a.reviewedEvidence!, amountDue: "99999", previousBalance: "4444" } });
  assert.deepEqual(manualPlanScenario(a, today).plans, manualPlanScenario(b, today).plans);
});
test("corrected usage recomputes and non-reconciling or missing bands do not become zero", () => {
  const a = bill();
  const corrected = manualPlanScenario(bill({ reviewedEvidence: { ...a.reviewedEvidence!, usage: "700" } }), today);
  assert.deepEqual(corrected.plans, [{ plan: "tiered", minor: 8620 }]);
  const missing = manualPlanScenario(bill({ reviewedEnergyEvidence: { ...a.reviewedEnergyEvidence!, lines: [line("off_peak", "300"), line("mid_peak", "300")] } }), today);
  assert.equal(missing.plans.some(p => p.plan === "tou"), false);
  const duplicate = manualPlanScenario(bill({ reviewedEnergyEvidence: { ...a.reviewedEnergyEvidence!, lines: [line("off_peak", "300"), line("off_peak", "300")] } }), today);
  assert.equal(duplicate.plans.length, 1);
});
test("confirmed ULO totals stay ULO; identical labels do not become TOU periods", () => {
  const a = bill({ reviewedEvidence: { ...bill().reviewedEvidence!, usage: "100", ratePlan: "ULO" }, reviewedEnergyEvidence: { version: 1, service: "electricity", scope: "single_service", lines: [line("ultra_low", "50"), line("off_peak", "10"), line("mid_peak", "20"), line("on_peak", "20")] } });
  const result = manualPlanScenario(a, today); assert.equal(result.plans.find(p => p.plan === "ulo")?.minor, 1389); assert.equal(result.plans.some(p => p.plan === "tou"), false);
});
test("unknown plan never infers TOU from names or a provider", () => {
  assert.equal(recordedElectricityPlan("Special TOU contract"), null);
  const a = bill({ reviewedEvidence: { ...bill().reviewedEvidence!, ratePlan: "" } });
  assert.equal(manualPlanScenario(a, today).recordedPlan, null); assert.equal(manualPlanScenario(a, today).plans.length, 1);
});
test("estimated, mixed, missing, foreign-currency and net-metering evidence stays out", () => {
  for (const reading of ["estimated", "mixed", "unknown", ""]) assert.equal(manualPlanScenario(bill({ reviewedEvidence: { ...bill().reviewedEvidence!, reading } }), today).status, "unavailable");
  for (const scope of ["mixed_or_unclear", "net_metering"] as EnergyEvidence["scope"][]) assert.equal(manualPlanScenario(bill({ reviewedEnergyEvidence: { ...bill().reviewedEnergyEvidence!, scope } }), today).plans.length, 0);
  assert.equal(manualPlanScenario(bill({ currency: "USD" }), today).plans.length, 0);
  assert.equal(manualPlanScenario(bill({ reviewedEvidence: null }), today).plans.length, 0);
});
test("ongoing, invalid and excessive periods fail without guessed dates", () => {
  for (const [start, end] of [["2026-09-01", today], ["2026-02-30", "2026-03-01"], ["2026-08-30", "2026-08-01"], ["2023-01-01", "2026-08-01"]]) {
    assert.equal(manualPlanScenario(bill({ billingPeriodStart: start, billingPeriodEnd: end }), today).status, "unavailable");
  }
});
test("tiered scenario crosses seasonal threshold without applying today’s season to old usage", () => {
  assert.ok(Math.abs(scenarioTierThreshold({ start: "2026-04-30", end: "2026-05-01" }) - (1000 + 600) / 30) < 1e-8);
  assert.ok(Math.abs(scenarioTierThreshold({ start: "2024-02-01", end: "2024-02-29" }) - 1000 * 29 / 30) < 1e-8);
});
test("current-rate replay differs from historical prices without moving dates", () => {
  const rows = readings("2024-06-03"), b = saved("2024-06-03"), result = buildCurrentPlanScenario(b, rows, today);
  // Monday in summer: 12 off-peak, 6 mid-peak, 6 on-peak hours.
  assert.equal(result.plans.find(p => p.plan === "tou")?.minor, 334);
  assert.notEqual(result.plans.find(p => p.plan === "tou")?.minor, Math.round(compareOntarioPlans(rows).tou.cost * 100));
  assert.equal(result.olderUsage, true); assert.deepEqual(result.period, { start: "2024-06-03", end: "2024-06-03" });
});
test("holiday and overnight classification uses actual local dates", () => {
  assert.equal(touPeriodFor("2026-07-01 12:00:00"), "off_peak");
  assert.equal(uloPeriodFor("2026-07-01 12:00:00"), "weekend_off_peak");
  const result = buildCurrentPlanScenario(saved("2026-07-01"), readings("2026-07-01"), today);
  assert.equal(result.plans.find(p => p.plan === "tou")?.minor, 235);
  assert.equal(result.plans.find(p => p.plan === "ulo")?.minor, 188);
});
test("DST days accept only the actual local-hour coverage", () => {
  const spring = readings("2026-03-08").filter(r => !r.intervalStartLocal.includes(" 02:"));
  assert.equal(buildCurrentPlanScenario(saved("2026-03-08"), spring, today).status, "ready");
  assert.equal(buildCurrentPlanScenario(saved("2026-03-08"), readings("2026-03-08"), today).status, "unavailable");
  const fall = readings("2025-11-02"); fall.push({ ...fall[1] });
  assert.equal(buildCurrentPlanScenario(saved("2025-11-02"), fall, today).status, "ready");
});
test("missing, duplicate, out-of-period, negative and offset intervals never rank plans", () => {
  const rows = readings("2026-08-01"), b = saved("2026-08-01");
  for (const input of [rows.slice(1), [...rows, rows[0]], [...rows, ...readings("2026-08-02")], rows.map((r,i) => i ? r : { ...r, valueKwh: -1 }), rows.map(r => ({ ...r, intervalStartLocal: r.intervalStartLocal.replace(":00:00", ":15:00") }))]) {
    assert.equal(buildCurrentPlanScenario(b, input, today).plans.length, 0);
  }
});
test("overlapping and revised statements require resolution; another period is not silently substituted", () => {
  const a = saved("2026-08-01", "2026-08-30");
  assert.equal(selectCurrentPlanStatement([a, { ...a, id: "revised" }], today).blocked?.status, "unavailable");
  assert.equal(selectCurrentPlanStatement([a, { ...saved("2026-09-01", today), id: "ongoing" }], today).blocked?.status, "unavailable");
  assert.equal(selectCurrentPlanStatement([], today).bill, null);
});
test("same-provider accounts are calculated independently and nothing is mutated", () => {
  const a = bill(), b = bill({ id: "manual-b", accountNumber: "Home B", reviewedEvidence: { ...bill().reviewedEvidence!, usage: "700" } });
  const before = JSON.stringify([a,b]);
  assert.notDeepEqual(manualPlanScenario(a,today).plans, manualPlanScenario(b,today).plans);
  assert.equal(JSON.stringify([a,b]),before);
});

test("manual account uncertainty and overlap do not show a selected-revision comparison", () => {
  assert.equal(manualPlanScenario(bill(), today, {complete:false,overlap:false}).plans.length, 0);
  assert.equal(manualPlanScenario(bill(), today, {complete:true,overlap:true}).plans.length, 0);
});
test("old or malformed backend responses fail safely; current contract is recognized", () => {
  assert.equal(isPlanScenario({plans:[{plan:"tou",cost:20}],confidence:"historical_comparison"}), false);
  assert.equal(isPlanScenario(manualPlanScenario(bill(),today)),true);
  assert.equal(isPlanScenario({...manualPlanScenario(bill(),today),period:{start:"bad",end:"bad"}}),false);
  assert.equal(isPlanScenario(null),false);
});

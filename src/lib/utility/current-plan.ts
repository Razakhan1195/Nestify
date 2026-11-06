import { emptyPlanScenario, finishPlanScenario, scenarioPeriod, scenarioTierCost, scenarioTierThreshold, currentOntarioRates } from "../../../apps/mobile/src/lib/ontario-plan-scenario";
import { touPeriodFor, uloPeriodFor, type UsageReading } from "./ontario-rpp";
import { hasCompleteUsage } from "./coverage";
import { inferRatePlan, objectValue } from "../ezgb/sync-state";
import type { SavedStatement } from "./multi-period";

export function buildCurrentPlanScenario(bill: SavedStatement | null, readings: UsageReading[], today: string) {
  const base = emptyPlanScenario("saved_intervals", today, "No completed electricity statement is saved for this account. You can still compare with the OEB using a bill from your utility.", bill?.id ?? null);
  if (!bill || base.status === "rates_need_review") return base;
  const period = scenarioPeriod(bill.billing_period_start, bill.billing_period_end, today);
  if (!period) return { ...base, message: "The latest saved service period is incomplete or has unsupported dates. Your bills remain available; no new utility retrieval has been requested." };
  if (!hasCompleteUsage(readings, period) || readings.some(r => ![15, 30, 60].includes(r.intervalMinutes) || Number(r.intervalStartLocal.slice(14, 16)) % r.intervalMinutes !== 0 || r.intervalStartLocal.slice(0, 10) < period.start || r.intervalStartLocal.slice(0, 10) > period.end)) {
    return { ...base, period, message: "This saved period does not have complete, usable interval readings. Compare using your statement in the OEB calculator, or return when the readings have actually been added. No retrieval is running here." };
  }
  const kwh = readings.reduce((sum, r) => sum + r.valueKwh, 0);
  if (!kwh) return { ...base, period, message: "The saved readings total zero kWh. There is no electricity-use difference to compare for this period." };
  const recordedPlan = inferRatePlan(objectValue(objectValue(objectValue(bill.raw_data).ezgb_export).charge_totals));
  return finishPlanScenario(base, { period, kwh, recordedPlan, today, costs: {
    tou: readings.reduce((sum, r) => sum + r.valueKwh * currentOntarioRates.tou[touPeriodFor(r.intervalStartLocal)], 0),
    ulo: readings.reduce((sum, r) => sum + r.valueKwh * currentOntarioRates.ulo[uloPeriodFor(r.intervalStartLocal)], 0),
    tiered: scenarioTierCost(kwh, scenarioTierThreshold(period)),
  } });
}

export function selectCurrentPlanStatement(bills: SavedStatement[], today: string) {
  const bill = [...bills].sort((a,b) => b.billing_period_end.localeCompare(a.billing_period_end) || a.id.localeCompare(b.id))[0] ?? null;
  if (!bill) return {bill, blocked: null};
  const period = scenarioPeriod(bill.billing_period_start, bill.billing_period_end, today);
  if (!period) return {bill, blocked: buildCurrentPlanScenario(bill, [], today)};
  if (bills.some(other => other.id !== bill.id && other.billing_period_start <= period.end && other.billing_period_end >= period.start)) {
    const blocked = emptyPlanScenario("saved_intervals", today, "Saved statements overlap this period. Review the originals or corrections before comparing plans; no period has been counted twice.", bill.id);
    return {bill, blocked};
  }
  return {bill, blocked: null};
}

export { emptyPlanScenario };

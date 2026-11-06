import { parseEnergyEvidence, printedTimeBands } from "./energy-evidence";
import { historyDate, type HistoryBill } from "./manual-history-insights";
import { parseEvidence } from "./statement-evidence";

export type ElectricityPlan = "tou" | "ulo" | "tiered";
export const planNames: Record<ElectricityPlan, string> = { tou: "Time-of-Use", ulo: "Ultra-Low Overnight", tiered: "Tiered" };
export const ontarioPlanSources = {
  rates: "https://www.oeb.ca/consumer-information-and-protection/electricity-rates",
  calculator: "https://www.oeb.ca/consumer-information-and-protection/bill-calculator",
  switching: "https://www.oeb.ca/consumer-information-and-protection/electricity-rates/choosing-your-electricity-price-plan",
};
// Reviewed against the OEB on this date. Reverification deadline is a product
// guard, not an asserted tariff expiry. Never silently carry these forward.
export const currentOntarioRates = {
  effectiveDate: "2025-11-01", verifiedAt: "2026-09-27", reviewBefore: "2026-10-27",
  tou: { off_peak: 0.098, mid_peak: 0.157, on_peak: 0.203 },
  ulo: { ultra_low: 0.039, weekend_off_peak: 0.098, mid_peak: 0.157, on_peak: 0.391 },
  tiered: { tier1: 0.12, tier2: 0.142 },
} as const;
export type PlanScenario = {
  status: "ready" | "unavailable" | "rates_need_review";
  basis: "current_rates_saved_usage";
  source: "reviewed_statement" | "saved_intervals";
  period: { start: string; end: string } | null;
  statementId: string | null;
  kwh: number | null;
  recordedPlan: ElectricityPlan | null;
  rates: { effectiveDate: string; verifiedAt: string; reviewBefore: string };
  plans: Array<{ plan: ElectricityPlan; minor: number }>;
  missing: Array<{ plan: ElectricityPlan; reason: string }>;
  thresholdKwh: number | null;
  message: string;
  olderUsage: boolean;
};
export function ratesAreCurrent(today: string) {
  return historyDate(today) && today >= currentOntarioRates.verifiedAt && today < currentOntarioRates.reviewBefore;
}
export function recordedElectricityPlan(value: string | null | undefined): ElectricityPlan | null {
  const name = value?.trim().toLowerCase().replace(/[–-]/g, " ").replace(/\s+/g, " ");
  if (["tou", "time of use", "time of use (tou)"].includes(name ?? "")) return "tou";
  if (["ulo", "ultra low overnight", "ultra low overnight (ulo)"].includes(name ?? "")) return "ulo";
  return name === "tiered" ? "tiered" : null;
}
export function scenarioPeriod(start: string | null, end: string | null, today: string) {
  if (!historyDate(start) || !historyDate(end) || !historyDate(today) || start > end || end >= today) return null;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  return days <= 370 ? { start, end } : null;
}
// Explicit scenario assumption shared by manual and interval inputs. The SSSC
// permits distributor allocation; this is not an exact distributor bill replay.
export function scenarioTierThreshold(period: { start: string; end: string }) {
  let threshold = 0;
  for (let t = Date.parse(period.start); t <= Date.parse(period.end); t += 86400000) {
    const month = new Date(t).getUTCMonth() + 1;
    threshold += (month >= 5 && month <= 10 ? 600 : 1000) / 30;
  }
  return threshold;
}
export function scenarioTierCost(kwh: number, threshold: number) {
  return Math.min(kwh, threshold) * currentOntarioRates.tiered.tier1 + Math.max(0, kwh - threshold) * currentOntarioRates.tiered.tier2;
}
export function emptyPlanScenario(source: PlanScenario["source"], today: string, message: string, statementId: string | null = null): PlanScenario {
  const { effectiveDate, verifiedAt, reviewBefore } = currentOntarioRates;
  return { status: ratesAreCurrent(today) ? "unavailable" : "rates_need_review", basis: "current_rates_saved_usage", source,
    period: null, statementId, kwh: null, recordedPlan: null, rates: { effectiveDate, verifiedAt, reviewBefore }, plans: [], missing: [], thresholdKwh: null,
    message: ratesAreCurrent(today) ? message : "Rezlee’s saved rates need checking before a new comparison. Use the OEB calculator for current prices; your saved bills are unchanged.", olderUsage: false };
}
export function finishPlanScenario(base: PlanScenario, input: {
  period: { start: string; end: string }; kwh: number; recordedPlan: ElectricityPlan | null; costs: Partial<Record<ElectricityPlan, number>>; today: string;
}) {
  if (base.status === "rates_need_review") return base;
  const plans = (["tou", "ulo", "tiered"] as const).flatMap(plan => {
    const cost = input.costs[plan];
    return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && Number.isSafeInteger(Math.round(cost * 100)) ? [{ plan, minor: Math.round((cost + Number.EPSILON) * 100) }] : [];
  });
  if (!plans.length) return base;
  return { ...base, status: "ready" as const, plans, period: input.period, kwh: input.kwh, recordedPlan: input.recordedPlan,
    thresholdKwh: scenarioTierThreshold(input.period), olderUsage: Date.parse(input.today) - Date.parse(input.period.end) > 62 * 86400000,
    message: "The same saved usage at today’s verified prices. These are electricity-charge scenarios, not your next bill or verified savings." };
}
export function manualPlanScenario(bill: HistoryBill, today: string, context?: { complete: boolean; overlap: boolean }): PlanScenario {
  const base = emptyPlanScenario("reviewed_statement", today, "Review this statement’s total kWh and reading type to estimate Tiered charges. Printed TOU quantities can also support a Time-of-Use scenario.", bill.id);
  if (base.status === "rates_need_review") return base;
  if (context && !context.complete) return { ...base, message: "The saved account history hasn’t finished loading. Retry the account view before comparing plans." };
  if (context?.overlap) return { ...base, message: "Saved statements overlap this period. Review the originals or corrections before comparing plans." };
  const period = scenarioPeriod(bill.billingPeriodStart, bill.billingPeriodEnd, today);
  if (!period) return { ...base, message: "A completed service period is needed. Your current bill remains available; compare once its actual usage is known." };
  const fields = parseEvidence(bill.reviewedEvidence), energy = parseEnergyEvidence(bill.reviewedEnergyEvidence);
  if (bill.categoryId !== "electricity" || bill.currency !== "CAD") return { ...base, message: "This comparison is for Canadian-dollar electricity statements only." };
  if (energy && (energy.scope !== "single_service" || energy.service !== "electricity")) return { ...base, message: "Net metering, combined meters or mixed services need a separate utility calculation. Use your utility’s guidance with the original statement." };
  if (!fields || fields.unit !== "kWh" || !fields.usage || fields.reading !== "actual" || !Number.isFinite(Number(fields.usage)) || Number(fields.usage) <= 0) return base;
  const kwh = Number(fields.usage), recordedPlan = recordedElectricityPlan(fields.ratePlan);
  const costs: Partial<Record<ElectricityPlan, number>> = { tiered: scenarioTierCost(kwh, scenarioTierThreshold(period)) };
  const bands = printedTimeBands(energy, fields.usage, fields.unit);
  // TOU and ULO bands with the same names cover different hours. Never map one
  // to the other, assume an omitted band is zero, or reconstruct overnight use.
  const exact = (names: string[]) => bands?.length === names.length && names.every(name => bands.some(b => b.band === name));
  if (recordedPlan === "tou" && exact(["off_peak", "mid_peak", "on_peak"])) {
    costs.tou = bands!.reduce((sum, b) => sum + Number(b.quantity) * currentOntarioRates.tou[b.band as keyof typeof currentOntarioRates.tou], 0);
  }
  if (recordedPlan === "ulo" && exact(["ultra_low", "off_peak", "mid_peak", "on_peak"])) {
    costs.ulo = bands!.reduce((sum, b) => sum + Number(b.quantity) * currentOntarioRates.ulo[b.band === "off_peak" ? "weekend_off_peak" : b.band as "ultra_low" | "mid_peak" | "on_peak"], 0);
  }
  const result = finishPlanScenario(base, { period, kwh, recordedPlan, costs, today });
  result.missing = (["tou", "ulo"] as const).filter(plan => costs[plan] === undefined).map(plan => ({ plan, reason: plan === "ulo"
    ? "Needs complete ULO time bands or interval readings. TOU totals do not reveal overnight usage."
    : "Needs a confirmed TOU plan with all three printed time bands, or complete interval readings." }));
  return result;
}

// Older backends ignore unknown query parameters. Never treat the historical
// response as a current-rate scenario or crash after a backend rollback.
export function isPlanScenario(value: unknown): value is PlanScenario {
  if (!value || typeof value !== "object") return false;
  const v = value as PlanScenario;
  return v.basis === "current_rates_saved_usage" && ["ready", "unavailable", "rates_need_review"].includes(v.status) &&
    ["saved_intervals", "reviewed_statement"].includes(v.source) && typeof v.message === "string" &&
    Boolean(v.rates && historyDate(v.rates.effectiveDate) && historyDate(v.rates.verifiedAt) && historyDate(v.rates.reviewBefore)) &&
    Array.isArray(v.plans) && v.plans.every(p => p && ["tou", "ulo", "tiered"].includes(p.plan) && Number.isSafeInteger(p.minor) && p.minor >= 0) &&
    Array.isArray(v.missing) && v.missing.every(p => p && ["tou", "ulo", "tiered"].includes(p.plan) && typeof p.reason === "string") &&
    (v.status !== "ready" || Boolean(v.period && historyDate(v.period.start) && historyDate(v.period.end) && Number.isFinite(v.kwh) && Number.isFinite(v.thresholdKwh)));
}

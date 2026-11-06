import { compareOntarioPlans, type UsageReading } from "./ontario-rpp";
import { hasCompleteUsage } from "./coverage";
import { billedEnergyCharge, billReconciliation } from "./intelligence";
import { inferRatePlan, objectValue } from "../ezgb/sync-state";

export type SavedStatement = { id: string; billing_period_start: string; billing_period_end: string; raw_data: unknown };
const plans = ["tou", "ulo", "tiered"] as const;
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}
export function supportedPeriod(bill: SavedStatement) {
  const start = bill.billing_period_start, end = bill.billing_period_end;
  return validDate(start) && validDate(end) && start <= end &&
    (Date.parse(end) - Date.parse(start)) / 86400000 < 370 &&
    start >= "2023-11-01" && end < "2026-11-01";
}
export function buildMultiPeriodComparison(bills: SavedStatement[], readings: UsageReading[]) {
  const included: Array<{ id: string; start: string; end: string; days: number; currentPlan: string | null; matched: boolean; costs: Record<typeof plans[number], number> }> = [];
  const excluded: Array<{ id: string; start: string; end: string; reason: string }> = [];
  for (const bill of [...bills].sort((a,b) => b.billing_period_end.localeCompare(a.billing_period_end) || a.id.localeCompare(b.id))) {
    const start = bill.billing_period_start, end = bill.billing_period_end;
    let reason = !supportedPeriod(bill) ? "Dates fall outside the supported historical rate window." : "";
    if (!reason && included.some(row => start <= row.end && end >= row.start)) reason = "Overlaps another included statement.";
    const rows = reason ? [] : readings.filter(row => row.intervalStartLocal.slice(0,10) >= start && row.intervalStartLocal.slice(0,10) <= end);
    if (!reason && !hasCompleteUsage(rows, {start,end})) reason = "Missing, duplicate or invalid meter readings.";
    if (reason) { excluded.push({id:bill.id,start,end,reason}); continue; }
    const charges = objectValue(objectValue(objectValue(bill.raw_data).ezgb_export).charge_totals);
    const currentPlan = inferRatePlan(charges);
    const comparison = compareOntarioPlans(rows, undefined, {start,end});
    const costs = {tou:comparison.tou.cost,ulo:comparison.ulo.cost,tiered:comparison.tiered.cost};
    const validation = billReconciliation({ billedEnergyCharge: billedEnergyCharge(charges), calculatedEnergyCharge: currentPlan ? costs[currentPlan] : null });
    included.push({id:bill.id,start,end,days:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1,currentPlan,matched:validation.status==="matched",costs});
  }
  const chronological = [...included].reverse();
  const gapDays = chronological.slice(1).reduce((sum,row,i) => sum + Math.max(0,Math.round((Date.parse(row.start)-Date.parse(chronological[i].end))/86400000)-1),0);
  const days = included.reduce((sum,row)=>sum+row.days,0);
  const totals = plans.map(plan => ({plan,cost:included.reduce((sum,row)=>sum+row.costs[plan],0)})).sort((a,b)=>a.cost-b.cost);
  const verified = included.length > 0 && included.every(row=>row.currentPlan && row.matched);
  const historicalBaseline = verified ? included.reduce((sum,row)=>sum+row.costs[row.currentPlan as typeof plans[number]],0) : null;
  const enough = included.length >= 3 && days >= 90 && !excluded.length && !gapDays && verified;
  const reasons = [
    ...(included.length < 3 || days < 90 ? ["At least three complete statements covering 90 days are needed for a broader savings comparison."] : []),
    ...(excluded.length ? ["Some saved periods were excluded; totals cover only the included periods."] : []),
    ...(gapDays ? [`${gapDays} days between included periods are not represented.`] : []),
    ...(!verified && included.length ? ["One or more recorded plans or electricity charges could not be reconciled within $1."] : []),
    "Historical electricity-charge estimates only, not a forecast or a recommendation to switch. Delivery, tax, rebates and distributor loss adjustments are excluded. Tiered uses approximate 30-day threshold proration.",
  ];
  return {
    considered: bills.length, included, excluded, days, gapDays,
    range: chronological.length ? {start:chronological[0].start,end:chronological[chronological.length-1].end} : null,
    plans: included.length ? totals : [],
    lowestPlan: included.length ? totals[0].plan : null,
    baseline: historicalBaseline,
    savings: enough && historicalBaseline !== null ? Math.max(0,historicalBaseline-totals[0].cost) : null,
    confidence: enough ? "historical_comparison" : "limited",
    reasons,
    source: "saved_data_only",
  };
}

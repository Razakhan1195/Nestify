import {moneyCents} from "./statement-evidence";
import type { analyzeManualHistory, HistoryPeriod } from "./manual-history-insights";

type Analysis = ReturnType<typeof analyzeManualHistory>;
function usage(period: HistoryPeriod) {
  const evidence=period.bill.reviewedEvidence;
  // New APIs explicitly distinguish current reviewed evidence from stale/missing
  // details. Older clients/fixtures retain their prior recorded-usage behavior.
  if(evidence!==undefined&&(!evidence||evidence.reading!=="actual"||!evidence.usage))return null;
  const amount = evidence?Number(evidence.usage):period.bill.usageAmount;
  const unit = (evidence?evidence.unit:period.bill.usageUnit)?.trim().toLowerCase();
  const units: Record<string, string> = { kwh: "kWh", wh: "Wh", gj: "GJ", m3: "m³", "m³": "m³", l: "L", litres: "L" };
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER || !unit || !units[unit]) return null;
  return { amount, daily: amount / period.days, unit: units[unit] };
}

// A counterfactual at the previous daily average, not a causal attribution.
// All original identity, completeness, date, credit and overlap guards still apply.
export function explainStatementChange(analysis: Analysis) {
  if (analysis.issues.some(issue=>issue!=="history") || !analysis.latest || analysis.window.length<2) return null;
  const latest = analysis.latest, previous = analysis.window[1];
  if (!previous || previous.minor <= 0) return null;
  const scaled = previous.minor * latest.days;
  if (!Number.isSafeInteger(scaled)) return null;
  const referenceMinor = Math.round(scaled / previous.days);
  const lengthAdjustmentMinor = referenceMinor - previous.minor;
  const remainderMinor = latest.minor - referenceMinor;
  const changeMinor = latest.minor - previous.minor;
  if (![referenceMinor, lengthAdjustmentMinor, remainderMinor, changeMinor].every(Number.isSafeInteger)) return null;
  const latestUsage = usage(latest), previousUsage = usage(previous);
  const percent = latestUsage && previousUsage && previousUsage.daily > 0 ? (latestUsage.daily - previousUsage.daily) / previousUsage.daily * 100 : null;
  const comparableUsage = latestUsage && previousUsage && latestUsage.unit === previousUsage.unit ? {
    latest: latestUsage, previous: previousUsage,
    dailyPercent: percent !== null && Number.isFinite(percent) ? percent : null,
  } : null;
  function breakdown(period:HistoryPeriod){
   const fields=period.bill.reviewedEvidence;if(!fields)return null;
   const subtotal=moneyCents(fields.subtotal),tax=moneyCents(fields.tax),credits=moneyCents(fields.credits);
   if(subtotal===null||tax===null||credits===null||subtotal+tax-credits!==period.minor)return null;
   return {subtotal,tax,credits};
  }
  const latestBreakdown=breakdown(latest),previousBreakdown=breakdown(previous);
  const chargeBreakdown=latestBreakdown&&previousBreakdown?{
   subtotalChange:latestBreakdown.subtotal-previousBreakdown.subtotal,
   taxChange:latestBreakdown.tax-previousBreakdown.tax,
   creditEffect:previousBreakdown.credits-latestBreakdown.credits,
  }:null;
  const gapDays = Math.max(0, Math.round((Date.parse(latest.start) - Date.parse(previous.end)) / 86_400_000) - 1);
  const stale = (analysis.daysSinceLatest ?? 0) > 62;
  const next: keyof typeof changeGuidance = stale ? "newer" : remainderMinor > 0 ? "increase" : remainderMinor < 0 ? "decrease" : "steady";
  return { latest, previous, changeMinor, referenceMinor, lengthAdjustmentMinor, remainderMinor,
    dayDifference: latest.days - previous.days, gapDays, usage: comparableUsage, chargeBreakdown, next };
}

export const changeGuidance = {
  newer: { title: "Bring the comparison up to date", detail: "Add your newest statement before deciding whether this pattern still applies.", action: "Add a newer statement" },
  increase: { title: "Check the lines that changed", detail: "Compare usage, unit prices, fixed charges and discounts on both originals. A daily-charge increase does not tell us which of these changed.", action: "Review latest statement" },
  decrease: { title: "Check whether the reduction will last", detail: "Look for a one-off adjustment or a discount with an end date before treating this as an ongoing saving.", action: "Review latest statement" },
  steady: { title: "Keep building your history", detail: "Daily charges are similar after allowing for the period length. Another statement will help you see whether that pattern continues.", action: "Add another statement" },
} as const;

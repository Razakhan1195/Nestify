import {parseEnergyEvidence,summarizeEnergyEvidence,compareEnergyEvidence,printedTimeBands} from "./energy-evidence";
import { analyzeManualHistory, historyDate, historyIssueCopy, type HistoryAccount, type HistoryBill, type HistoryPeriod } from "./manual-history-insights";
import { explainStatementChange } from "./statement-change";
import { moneyCents, parseEvidence } from "./statement-evidence";

export function energyAccountKind(account: HistoryAccount): "electricity" | "gas" | null {
  const kinds = new Set(account.bills.map(b => b.categoryId));
  if (kinds.size !== 1) return null;
  return kinds.has("electricity") ? "electricity" : kinds.has("gas") ? "gas" : null;
}
function reviewedUsage(bill: HistoryBill, days: number | null) {
  const energy=parseEnergyEvidence(bill.reviewedEnergyEvidence);
  if(energy&&(energy.scope!=="single_service"||energy.service!==bill.categoryId))return null;
  const fields = bill.reviewedEvidence && parseEvidence(bill.reviewedEvidence);
  if (!fields?.usage || !fields.unit || fields.unit === "Other") return null;
  const amount = Number(fields.usage);
  const compatible = bill.categoryId === "electricity" ? fields.unit === "kWh" : bill.categoryId === "gas" && ["m³", "GJ"].includes(fields.unit);
  if (!compatible || !Number.isFinite(amount) || amount < 0) return null;
  return { amount, unit: fields.unit, daily: days ? amount / days : null, actual: fields.reading === "actual",
    reading: fields.reading === "estimated" ? "Estimated reading" : fields.reading === "mixed" ? "Partly estimated" : fields.reading === "actual" ? "Actual reading" : "Reading type not recorded" };
}
function periodDays(bill: HistoryBill) {
  if (!historyDate(bill.billingPeriodStart) || !historyDate(bill.billingPeriodEnd) || bill.billingPeriodStart > bill.billingPeriodEnd) return null;
  return (Date.parse(bill.billingPeriodEnd) - Date.parse(bill.billingPeriodStart)) / 86400000 + 1;
}
export type EnergyNextStep = { title: string; detail: string; action: "add" | "details" | "statement" | null; label?: string; billId?: string };
export function buildEnergyBillStory(account: HistoryAccount, options: { today: string; complete: boolean }) {
  const bill = account.bills[0];
  const analysis = analyzeManualHistory(account, options);
  const rawChange = explainStatementChange(analysis);
  const latestUsage = rawChange ? reviewedUsage(rawChange.latest.bill, rawChange.latest.days) : null;
  const previousUsage = rawChange ? reviewedUsage(rawChange.previous.bill, rawChange.previous.days) : null;
  // Energy comparisons require currently reviewed compatible units; no legacy fallback.
  const change = rawChange ? { ...rawChange, usage: latestUsage?.actual && previousUsage?.actual && latestUsage.unit === previousUsage.unit ? rawChange.usage : null } : null;
  const fields = bill.reviewedEvidence && parseEvidence(bill.reviewedEvidence);
  const usage = reviewedUsage(bill, periodDays(bill));
  const subtotal = fields ? moneyCents(fields.subtotal) : null, tax = fields ? moneyCents(fields.tax) : null, credits = fields ? moneyCents(fields.credits) : null;
  const minor = bill.amount === null ? null : moneyCents(String(bill.amount));
  const energy=parseEnergyEvidence(bill.reviewedEnergyEvidence);
  const energySummary=energy?.service===energyAccountKind(account)?summarizeEnergyEvidence(energy,minor):null;
  const energyChanges=change&&energySummary?compareEnergyEvidence(energy,change.previous.bill.reviewedEnergyEvidence,change.latest.minor,change.previous.minor):null;
  const timeBands=energySummary&&fields?printedTimeBands(energy,fields.usage,fields.unit):null;
  const breakdownDifference = minor !== null && subtotal !== null && tax !== null && credits !== null ? minor - (subtotal + tax - credits) : null;

  // Display at most 12 *saved periods*, never call these calendar months or fill gaps with zero.
  // Scan all dates for overlaps before trimming, including older enclosing/revised bills.
  const candidates: HistoryPeriod[] = [];
  let excluded = 0;
  for (const row of account.bills) {
    const single = analyzeManualHistory({ ...account, bills: [row] }, options).latest;
    const overlaps = single && account.bills.some(other => other.id !== row.id && historyDate(other.billingPeriodStart) && historyDate(other.billingPeriodEnd) && other.billingPeriodStart <= single.end && other.billingPeriodEnd >= single.start);
    if (!single || single.minor < 0 || overlaps) { excluded++; continue; }
    candidates.push(single);
  }
  const periods = candidates.slice(0, 12).reverse();
  const unit = usage?.unit ?? [...periods].reverse().map(p => reviewedUsage(p.bill, p.days)?.unit).find(Boolean) ?? null;
  const points = periods.map(period => {
    const value = reviewedUsage(period.bill, period.days);
    return { ...period, usage: value?.actual && value.unit === unit ? value : null };
  });
  const missingUsage = points.filter(p => !p.usage).length;
  const gapDays = periods.reduce((sum, p, i) => i ? sum + Math.max(0, (Date.parse(p.start) - Date.parse(periods[i - 1].end)) / 86400000 - 1) : sum, 0);
  const chargeDailyPercent = change && change.previous.dailyMinor > 0 ? (change.latest.dailyMinor - change.previous.dailyMinor) / change.previous.dailyMinor * 100 : null;

  let next: EnergyNextStep;
  const blocker = analysis.issues.find(issue => !["history", "zero_baseline"].includes(issue));
  if (blocker) {
    const blockedBill = blocker === "overlap"
      ? account.bills.find(b => historyDate(b.billingPeriodStart) && historyDate(b.billingPeriodEnd) && account.bills.some(other => other.id !== b.id && historyDate(other.billingPeriodStart) && historyDate(other.billingPeriodEnd) && other.billingPeriodStart <= b.billingPeriodEnd! && other.billingPeriodEnd >= b.billingPeriodStart!))
      : blocker === "credit" ? account.bills.find(b => b.amount !== null && b.amount < 0)
      : account.bills.find(b => !historyDate(b.billingPeriodStart) || !historyDate(b.billingPeriodEnd) || b.billingPeriodStart > b.billingPeriodEnd || b.amount === null || moneyCents(String(b.amount)) === null);
    next = { title: blocker === "coverage" ? "Showing saved information" : blocker === "ongoing" ? "This service period is still open" : "Check the saved statements",
      detail: historyIssueCopy[blocker], action: ["coverage", "ongoing"].includes(blocker) ? null : "statement", label: "Review statement", billId: blockedBill?.id ?? bill.id };
  } else if (breakdownDifference !== null && breakdownDifference !== 0) {
    next = { title: "Check the saved breakdown", detail: "The saved subtotal, tax and credits do not add up to this period’s charges. Check the extracted details before drawing a conclusion about the bill.", action: "details", label: "Review breakdown" };
  } else if (usage && !usage.actual && fields && ["estimated", "mixed"].includes(fields.reading)) {
    next = { title: "Part of this bill is estimated", detail: "Compare the printed meter readings with your provider’s reading history. An estimate alone does not establish a billing error.", action: "statement", label: "Review statement" };
  } else if ((analysis.daysSinceLatest ?? 0) > 62) {
    next = { title: "Bring this account up to date", detail: "Add a newer statement if you have one to see whether this pattern still applies.", action: "add", label: "Upload a newer bill" };
  } else if (energy && (energy.scope !== "single_service" || energy.service !== bill.categoryId)) {
    next = { title: energy.scope === "net_metering" ? "Read net metering separately" : "Separate service details", detail: energy.scope === "net_metering" ? "Your bill includes imported or exported energy. The saved charge lines remain available, but a net amount is not treated as household consumption or used to recommend a plan." : "These details cover multiple meters, services or an unclear allocation. Review the original for a separate usage total for this account before comparing consumption.", action: "statement", label: "Review statement" };
  } else if (!usage) {
    next = { title: "See usage alongside cost", detail: "Review the saved original for its total usage and unit. These let Rezlee separate a change in daily consumption from a change in daily charges.", action: "details", label: "Review usage details" };
  } else if (account.bills.length === 1) {
    next = { title: "Compare with an earlier bill", detail: "Add one earlier statement for this account to compare billing days, charges and recorded usage.", action: "add", label: "Upload an earlier bill" };
  } else if (change && !change.usage) {
    next = { title: "Complete the usage comparison", detail: "Both statements need matching units and actual readings to compare consumption per day. Estimated or unconfirmed readings stay out of this comparison.", action: "details", label: "Review usage details", billId: !usage.actual ? bill.id : change.previous.bill.id };
  } else {
    next = { title: "What this comparison means", detail: "These are changes in recorded bills, not proof of overpayment or savings. The saved totals cannot establish a cheaper plan or identify which appliance used more energy.", action: null };
  }
  return { bill, kind: energyAccountKind(account), analysis, change, fields: fields || null, usage, minor, breakdownDifference, chargeDailyPercent,
    energySummary,energyChanges,timeBands,
    history: { points, unit, excluded, older: Math.max(0, candidates.length - 12), missingUsage, gapDays }, next };
}
export type EnergyBillStory = ReturnType<typeof buildEnergyBillStory>;

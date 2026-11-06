import type {EnergyEvidence} from "./energy-evidence";
import type { BillTargetSummary } from "./bill-outcome";
import type {StatementEvidence} from "./statement-evidence";
// Recorded statement arithmetic only. Never estimates consumption or savings.
export type HistoryBill = {
  accountKey?: string | null;
  outcomeKind?: "agreed_amount" | "usage_change" | null;
  outcomeSummary?: BillTargetSummary | null;
  originalDocumentId?: string | null;
  reviewedEvidence?: StatementEvidence | null;
  reviewedEnergyEvidence?: EnergyEvidence | null;
  id: string; label: string; providerName: string | null; providerId: string | null;
  category: string; categoryId: string; accountNumber: string | null;
  currency: string; source: string | null; isHistoricalStatement: boolean;
  usageAmount?: number | null; usageUnit?: string | null;
  amount: number | null; billingPeriodStart: string | null; billingPeriodEnd: string | null;
};
export type HistoryAccount = { key: string; provider: string; nickname: string; category: string; currency: string; identified: boolean; bills: HistoryBill[] };
export type HistoryPeriod = { bill: HistoryBill; start: string; end: string; days: number; minor: number; dailyMinor: number };
export type HistoryIssue = "identity" | "coverage" | "dates" | "ongoing" | "amount" | "overlap" | "credit" | "history" | "zero_baseline";
const dayMs = 86_400_000;
const normalize = (value: string | null) => value?.trim().toLowerCase() ?? "";
export function historyDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}
function dateRank(b: HistoryBill) { return historyDate(b.billingPeriodEnd) ? b.billingPeriodEnd : ""; }
export function manualHistoryAccounts(rows: HistoryBill[]): HistoryAccount[] {
  const groups = new Map<string, HistoryAccount>();
  const seen = new Set<string>();
  for (const bill of rows) {
    if (bill.source !== "manual" || !bill.isHistoricalStatement || seen.has(bill.id)) continue;
    seen.add(bill.id);
    const provider = bill.providerName?.trim() || bill.label.trim();
    const nickname = bill.accountNumber?.trim() || "Account nickname missing";
    const identified = Boolean(provider && normalize(bill.accountNumber) && /^[A-Z]{3}$/.test(bill.currency));
    // Missing identity stays isolated. Matching spelling is not account reconciliation.
    const key = JSON.stringify([bill.providerId || normalize(provider), bill.categoryId, bill.currency, identified ? normalize(bill.accountNumber) : bill.id]);
    const group = groups.get(key) ?? { key, provider: provider || "Saved statement", nickname, category: bill.category, currency: bill.currency, identified, bills: [] };
    group.bills.push(bill); groups.set(key, group);
  }
  for (const group of groups.values()) group.bills.sort((a, b) => dateRank(b).localeCompare(dateRank(a)) || a.id.localeCompare(b.id));
  return [...groups.values()].sort((a, b) => dateRank(b.bills[0]).localeCompare(dateRank(a.bills[0])) || a.key.localeCompare(b.key));
}
function asPeriod(bill: HistoryBill, today: string): HistoryPeriod | null {
  const start = bill.billingPeriodStart, end = bill.billingPeriodEnd;
  if (!historyDate(start) || !historyDate(end) || start > end || end >= today || bill.amount === null || !Number.isFinite(bill.amount)) return null;
  const minor = Math.round(bill.amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor / 100 - bill.amount) > 0.0000001) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / dayMs) + 1;
  return { bill, start, end, days, minor, dailyMinor: minor / days };
}
export function analyzeManualHistory(account: HistoryAccount, options: { today: string; complete: boolean }) {
  const rows = account.bills;
  const periods = rows.map(b => asPeriod(b, options.today));
  const latest = periods[0] ?? null;
  const window = periods.slice(0, 4).filter((p): p is HistoryPeriod => p !== null);
  const issues: HistoryIssue[] = [];
  if (!account.identified) issues.push("identity");
  if (!options.complete) issues.push("coverage");
  const invalidDates = (b: HistoryBill) => !historyDate(b.billingPeriodStart) || !historyDate(b.billingPeriodEnd) || b.billingPeriodStart > b.billingPeriodEnd;
  if (!historyDate(options.today) || rows.some(invalidDates)) issues.push("dates");
  // Issued advance bills are valid saved records, not dates the customer must fix.
  if (historyDate(options.today) && rows.some(b => !invalidDates(b) && b.billingPeriodEnd! >= options.today)) issues.push("ongoing");
  if (rows.slice(0, 4).some(b => b.amount === null || !Number.isFinite(b.amount) || !Number.isSafeInteger(Math.round(b.amount * 100)) || Math.abs(Math.round(b.amount * 100) / 100 - b.amount) > 0.0000001)) issues.push("amount");
  // Include older intervals when checking overlap with the selected window.
  // This catches a long statement enclosing several newer periods.
  const overlap = window.some(p => rows.some(b => b.id !== p.bill.id && historyDate(b.billingPeriodStart) && historyDate(b.billingPeriodEnd) && b.billingPeriodStart <= p.end && b.billingPeriodEnd >= p.start));
  if (overlap) issues.push("overlap");
  if (window.some(p => p.minor < 0)) issues.push("credit");
  if (rows.length < 3) issues.push("history");
  const baseline = window.slice(1);
  const baselineDays = baseline.reduce((sum, p) => sum + p.days, 0);
  const baselineMinor = baseline.reduce((sum, p) => sum + p.minor, 0);
  if (baseline.length >= 2 && baselineMinor === 0) issues.push("zero_baseline");
  const ordered = [...window].reverse();
  const gapDays = ordered.reduce((sum, p, i) => i ? sum + Math.max(0, Math.round((Date.parse(p.start) - Date.parse(ordered[i - 1].end)) / dayMs) - 1) : sum, 0);
  const baselineDailyMinor = baselineDays ? baselineMinor / baselineDays : null;
  const comparison = !issues.length && latest && baselineDailyMinor !== null && baselineDailyMinor > 0 ? {
    percent: (latest.dailyMinor - baselineDailyMinor) / baselineDailyMinor * 100,
    dailyDifferenceMinor: latest.dailyMinor - baselineDailyMinor,
    baselineDailyMinor, baselineDays, baselineMinor, baselineCount: baseline.length,
  } : null;
  return { latest, window, issues, comparison, gapDays, extraCount: Math.max(0, rows.length - 4), daysSinceLatest: latest ? Math.round((Date.parse(options.today) - Date.parse(latest.end)) / dayMs) : null };
}

export const historyIssueCopy: Record<HistoryIssue, string> = {
  identity: "Add a provider and account nickname to match statements safely. Different spellings remain separate accounts.",
  coverage: "The full saved history could not be confirmed. Individual statements are available, but the comparison is withheld.",
  dates: "A statement has missing or invalid service-period dates. Check them against the original before comparing.",
  ongoing: "A saved statement covers a service period that has not ended yet. Its charges are kept as billed. Comparisons wait until that period is complete; you do not need to change valid dates.",
  amount: "A recent statement is missing valid period charges. Review its amount before comparing.",
  overlap: "Some billing periods overlap. Check for a duplicate or corrected statement before comparing.",
  credit: "Recent history includes a net credit. Review the originals; a credit is not evidence of ongoing savings.",
  history: "Save at least three completed statements for this same account to compare the latest with earlier periods.",
  zero_baseline: "The earlier periods total zero. A percentage change would be misleading, so review the amounts individually.",
};

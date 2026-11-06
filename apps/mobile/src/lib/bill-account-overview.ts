import { analyzeManualHistory, historyDate, manualHistoryAccounts, type HistoryBill } from "./manual-history-insights";
import { analyzeTelecom, type TelecomInsightBill } from "./telecom-insights";
import { explainStatementChange } from "./statement-change";

export type OverviewBill = HistoryBill & TelecomInsightBill & { issueDate?: string | null; dueDate?: string | null; status?: string };
export type OverviewBills = {
  bills: OverviewBill[];
  historyCoverage?: { complete: boolean };
  utilityInsights: { providerId: string; providerName: string; category: string; categoryId: string; lastSyncAt?: string | null }[];
};
export type BillAccountOverview = {
  key: string; provider: string; category: string; categoryId: string;
  accountLabel: string | null; sourceLabel: string; currency: string;
  count: number; statementCount: number; latest: OverviewBill | null;
  title: string; detail: string; action: string; href: string;
  stale: boolean; important: boolean; priority: number; magnitude: number;
  chart: { label: string; amount: number }[];
  chartDateBasis?: "issued";
  providerId: string | null;
};
const normalize = (value: string | null) => value?.trim().toLowerCase() ?? "";
const rank = (bill: OverviewBill) => [bill.billingPeriodEnd, bill.issueDate, bill.dueDate].find((value): value is string => historyDate(value ?? null)) ?? "";
const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount); }
  catch { return `${amount.toFixed(2)} ${currency}`; }
};

// Presentation grouping only. Never reconciles records, combines balances, or
// merges manual and connected accounts based on a similar provider name.
export function billAccountOverview(data: OverviewBills, today: string, fresh = true): BillAccountOverview[] {
  const groups = new Map<string, OverviewBill[]>();
  const seen = new Set<string>();
  for (const bill of data.bills) {
    if (seen.has(bill.id)) continue;
    seen.add(bill.id);
    const source = bill.source === "manual" ? "manual" : bill.providerId ? "connected" : bill.source ?? "other";
    const provider = bill.providerName?.trim() || bill.label;
    // Unknown manual identities remain individually reviewable. A provider ID
    // scopes a connected account whose number has not yet been supplied.
    const identity = bill.source === "deck" ? bill.accountKey || bill.id : normalize(bill.accountNumber) || (source === "connected" ? "unknown" : bill.id);
    const key = JSON.stringify([source, bill.providerId || normalize(provider), bill.categoryId, bill.currency, identity]);
    const rows = groups.get(key) ?? [];
    rows.push(bill); groups.set(key, rows);
  }
  const histories = manualHistoryAccounts(data.bills);
  const providerGroupCount = new Map<string, number>();
  for (const rows of groups.values()) {
    const first = rows[0];
    if (first.providerId && first.source !== "manual") providerGroupCount.set(first.providerId, (providerGroupCount.get(first.providerId) ?? 0) + 1);
  }
  const result: BillAccountOverview[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => rank(b).localeCompare(rank(a)) || a.id.localeCompare(b.id));
    const latest = rows[0], manual = latest.source === "manual";
    const utility = !manual ? data.utilityInsights.find(u => u.providerId === latest.providerId) : undefined;
    const currentSource = utility?.lastSyncAt ? `Connected · Updated ${utility.lastSyncAt.slice(0, 10)}` : manual ? "Uploaded or manually entered" : latest.providerId ? "From provider records" : "Saved bill";
    const latestEnd = latest.billingPeriodEnd;
    const stale = historyDate(latestEnd) && historyDate(today) && (Date.parse(today) - Date.parse(latestEnd)) / 86_400_000 > 62;
    const amount = typeof latest.amount === "number" && Number.isFinite(latest.amount) ? money(latest.amount, latest.currency) : null;
    const item: BillAccountOverview = {
      key, provider: latest.providerName?.trim() || latest.label, category: latest.category, categoryId: latest.categoryId,
      accountLabel: latest.accountNumber ? manual || !/\d/.test(latest.accountNumber) ? latest.accountNumber : `Account ending ${latest.accountNumber.slice(-4)}` : null,
      currency: latest.currency, sourceLabel: currentSource, count: rows.length,
      statementCount: rows.filter(b => b.isHistoricalStatement).length, latest,
      title: latest.isHistoricalStatement ? "Understand your latest statement" : "Your saved bill",
      detail: latest.isHistoricalStatement ? `${amount ? `${amount}. ` : ""}Review the recorded charges and original details.` : "Review its amount, due date and recorded payment status.",
      action: latest.isHistoricalStatement ? "Understand this bill" : "Review bill",
      href: `/bill/${latest.id}`, stale, important: false, priority: 1, magnitude: 0, chart: [], providerId: latest.providerId,
    };
    if (manual && latest.isHistoricalStatement) {
      const history = histories.find(h => h.bills.some(b => b.id === latest.id));
      if (history) {
        const analysis = analyzeManualHistory(history, { today, complete: fresh && data.historyCoverage?.complete === true });
        const paired = explainStatementChange(analysis);
        const comparison = analysis.comparison;
        item.href = `/bill/history-insights?billId=${latest.id}`;
        if ((comparison || paired) && !stale) {
          const percent = comparison?.percent ?? (paired!.latest.dailyMinor / paired!.previous.dailyMinor - 1) * 100;
          const rounded = Math.round(Math.abs(percent));
          item.title = rounded === 0 ? "Daily charges are about the same" : `${rounded}% ${percent > 0 ? "higher" : "lower"} daily charges`;
          item.detail = comparison ? `Compared with ${comparison.baselineCount} earlier saved periods, allowing for their length.` : "Compared with the previous saved period, allowing for its length.";
          if (analysis.gapDays > 0) item.detail += " Some periods are missing.";
          item.action = "Review what changed"; item.important = percent > 0 && rounded > 0;
          item.priority = item.important ? 3 : 2; item.magnitude = rounded;
          item.chart = [...analysis.window].reverse().map(p => ({ label: p.end, amount: p.minor / 100 }));
        } else if (history.bills.length > 1) {
          item.title = "Review your saved statements";
          item.detail = "Open this account’s history to review periods and details before comparing charges.";
          item.action = "Review history";
        }
      }
    } else if (latest.source === "deck") {
      const story = analyzeTelecom(rows, latest.id, today, fresh && data.historyCoverage?.complete === true);
      item.href = "/bill/telecom-insights?billId=" + latest.id;
      item.action = "Explore charges & credits";
      item.title = story.headline; item.detail = story.detail;
      item.chartDateBasis = "issued";
      item.chart = story.chart.map(p => ({label:p.date,amount:p.amount}));
      item.important = story.difference !== null && story.difference > 0;
      item.priority = story.previous ? item.important ? 3 : 2 : 1;
      item.magnitude = Math.abs(story.difference ?? 0);
    } else if (utility) {
      // Existing utility analysis is provider-scoped. Multiple accounts and
      // currencies must not open a pooled analysis masquerading as one account.
      if (providerGroupCount.get(latest.providerId!) === 1) {
        item.href = `/utility/${latest.providerId}`;
        item.action = latest.categoryId === "electricity" ? "Explore usage & plan comparisons" : "Explore statement history";
      }
      const valid = fresh && data.historyCoverage?.complete === true && !stale && rows.every(b => b.isHistoricalStatement && historyDate(b.billingPeriodStart) && historyDate(b.billingPeriodEnd) && b.billingPeriodEnd < today && b.billingPeriodStart <= b.billingPeriodEnd && typeof b.amount === "number" && Number.isFinite(b.amount) && b.amount >= 0);
      const ordered = [...rows].reverse();
      const overlaps = ordered.some((b, i) => i > 0 && b.billingPeriodStart! <= ordered[i - 1].billingPeriodEnd!);
      if (valid && !overlaps && rows.length > 1) {
        const difference = Math.round((latest.amount! - rows[1].amount!) * 100) / 100;
        item.title = difference === 0 ? "Your latest statements have the same amount" : `${money(Math.abs(difference), latest.currency)} ${difference > 0 ? "more" : "less"} on your latest statement`;
        item.detail = "Compared with the previous saved statement. Billing periods can differ; open the details to understand the change.";
        item.important = difference > 0; item.priority = item.important ? 3 : 2; item.magnitude = Math.abs(difference);
        // Stable ordering, not cross-account monetary comparisons.
        item.chart = ordered.slice(-4).map(b => ({ label: b.billingPeriodEnd!, amount: b.amount! }));
      }
    }
    if (stale) { item.title = "Your saved bill history"; item.detail = "The latest saved period ended over two months ago. Review it or add a recent statement."; item.important = false; item.priority = 0; item.chart = []; }
    if (!fresh) { item.important = false; item.priority = 0; item.chart = []; }
    if (latest.status === "draft" || latest.status === "incomplete") {
      item.title = "Finish your bill details";
      item.detail = "This record is incomplete. Review its details before using it in comparisons.";
      item.action = "Review details"; item.href = "/bill/" + latest.id;
      item.important = false; item.priority = 0; item.chart = [];
    }
    result.push(item);
  }
  // Keep imported/connected sources without readable statements discoverable.
  for (const utility of data.utilityInsights) if (!result.some(a => a.providerId === utility.providerId && a.sourceLabel !== "Uploaded or manually entered")) {
    result.push({ key: `utility:${utility.providerId}`, providerId: utility.providerId, provider: utility.providerName,
      category: utility.category, categoryId: utility.categoryId, accountLabel: null, currency: "CAD", sourceLabel: "Provider records",
      count: 0, statementCount: 0, latest: null, title: "Review your provider’s saved details", detail: "A dated statement amount isn’t available yet.", action: "Review saved details", href: `/utility/${utility.providerId}`, stale: false, important: false, priority: 0, magnitude: 0, chart: [] });
  }
  return result.sort((a, b) => a.provider.localeCompare(b.provider) || a.category.localeCompare(b.category) || (a.accountLabel ?? "").localeCompare(b.accountLabel ?? "") || a.key.localeCompare(b.key));
}

/** Home promises the latest statements; alphabetical order remains in Accounts. */
export function latestBillAccounts(accounts: BillAccountOverview[], limit = 3) {
  return [...accounts].sort((a, b) =>
    (b.latest ? rank(b.latest) : "").localeCompare(a.latest ? rank(a.latest) : "") ||
    a.provider.localeCompare(b.provider) || a.key.localeCompare(b.key)
  ).slice(0, limit);
}

export function featuredBillAccounts(accounts: BillAccountOverview[]) {
  const sorted = [...accounts].sort((a, b) => b.priority - a.priority || (b.latest ? rank(b.latest) : "").localeCompare(a.latest ? rank(a.latest) : "") || a.key.localeCompare(b.key));
  const important = sorted.filter(a => a.important);
  return important.length ? important.slice(0, 2) : sorted.slice(0, 1);
}

export function billAccountCoverageLabel(accounts: BillAccountOverview[], complete: boolean) {
  if (!complete) return "View available bill accounts";
  const providerKey = (name: string) => normalize(name).replace(/^(elexicon) energy$/, "$1").replace(/^(enbridge) gas$/, "$1");
  const unknownIdentity = accounts.some(a => !a.latest?.accountNumber || !(a.latest.providerId || a.latest.providerName));
  const unmatchedSources = accounts.some(a => a.latest?.source === "manual" && accounts.some(b => b.latest?.source !== "manual" && providerKey(a.provider) === providerKey(b.provider)));
  if (unknownIdentity || unmatchedSources) return "View all saved bill histories";
  return accounts.length === 1 ? "View your bill account" : `View all ${accounts.length} bill accounts`;
}

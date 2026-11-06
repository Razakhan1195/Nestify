import { connectedStatementHistory, type ConnectedPeriodComparison } from "./statement-history";

export type UtilityStatementInput = {
  id: string;
  providerId: string;
  providerName: string;
  category: string;
  categoryId: string;
  amount: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string | null;
  usage: number | null;
  usageUnit: string | null;
  currency?: string;
  readingQuality?: string | null;
};

export type UtilityConnectionMeta = {
  providerId: string;
  intervalReadingCount: number | null;
  usageSummaryCount: number | null;
  intervalAnalysisReady?: boolean;
  lastSyncAt: string | null;
};

export type UtilityInsightHistoryPoint = {
  billId: string;
  periodStart: string | null;
  periodEnd: string | null;
  label: string;
  amount: number | null;
  usageIndex: number | null;
  dailyUsageIndex?: number | null;
};

export type UtilityInsight = {
  providerId: string;
  providerName: string;
  category: string;
  categoryId: string;
  statementCount: number;
  amountBasis?: "amount_due";
  currency?: string | null;
  amountStatementCount?: number;
  periodComparison?: ConnectedPeriodComparison | null;
  comparisonNote?: string | null;
  usageBasis?: "daily";
  usageComparisonCount?: number;
  firstPeriodStart: string | null;
  latestPeriodEnd: string | null;
  latestBillId: string | null;
  latestBillAmount: number | null;
  previousBillAmount: number | null;
  latestVsPreviousPercent: number | null;
  latestVsAveragePercent: number | null;
  trailing12Average: number | null;
  trailing12Total: number | null;
  highestBillAmount: number | null;
  highestBillPeriod: string | null;
  recent3VsPrior3Percent: number | null;
  usageTrendPercent: number | null;
  usageUnit: string | null;
  absoluteUsageReliable: boolean;
  intervalReadingCount: number | null;
  usageSummaryCount: number | null;
  intervalDataReported: boolean;
  intervalAnalysisReady: boolean;
  lastSyncAt: string | null;
  savingsSignal: {
    tone: "attention" | "positive" | "neutral";
    title: string;
    body: string;
  };
  history: UtilityInsightHistoryPoint[];
};

function numeric(values: Array<number | null>) {
  return values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value),
  );
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function percentChange(current: number | null, previous: number | null) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function monthLabel(value: string | null) {
  if (!value) return "Earlier";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function usageScaleLooksReliable(values: number[], unit: string | null) {
  if (!values.length || !unit) return false;
  const lowered = unit.toLowerCase();
  const max = Math.max(...values);
  const avg = average(values) ?? 0;

  // Green Button feeds can carry a meter multiplier even when the display unit
  // is kWh. Until interval/multiplier normalization is applied, avoid showing
  // implausible residential values and comparisons until the scale is verified.
  if (lowered === "kwh" && (max > 20_000 || avg > 10_000)) return false;
  return true;
}

export function buildUtilityInsights(
  statements: UtilityStatementInput[],
  connectionMeta: UtilityConnectionMeta[] = [],
  options: { today?: string; complete?: boolean } = {},
): UtilityInsight[] {
  const groups = new Map<string, UtilityStatementInput[]>();

  for (const statement of statements) {
    const current = groups.get(statement.providerId) ?? [];
    current.push(statement);
    groups.set(statement.providerId, current);
  }

  const metaByProvider = new Map(
    connectionMeta.map((item) => [item.providerId, item] as const),
  );

  return [...groups.entries()]
    .map(([providerId, rows]) => {
      const periods = connectedStatementHistory(rows, options.today ?? new Date().toISOString().slice(0, 10), options.complete ?? true);
      const ordered = periods.ordered;
      const latest = ordered.at(-1) ?? null;
      const previous = ordered.at(-2) ?? null;
      const trailing12 = ordered.slice(-12);
      const prior3 = ordered.slice(-6, -3);
      const recent3 = ordered.slice(-3);

      const trailing12Amounts = numeric(trailing12.map((row) => row.amount));
      const recent3Amounts = numeric(recent3.map((row) => row.amount));
      const prior3Amounts = numeric(prior3.map((row) => row.amount));

      const trailing12Average = average(trailing12Amounts);
      const trailing12Total = trailing12Amounts.length
        ? trailing12Amounts.reduce((sum, value) => sum + value, 0)
        : null;

      const highest = ordered.reduce<UtilityStatementInput | null>(
        (best, row) => {
          if (row.amount === null) return best;
          if (!best || best.amount === null || row.amount > best.amount) return row;
          return best;
        },
        null,
      );

      const latestVsPreviousPercent = periods.comparison ? percentChange(latest?.amount ?? null, previous?.amount ?? null) : null;
      const priorAmounts = ordered.slice(-13, -1);
      const latestVsAveragePercent = latest && periods.comparisonAllowed && periods.eligible(latest) && priorAmounts.length >= 2 && priorAmounts.every(periods.eligible)
        ? percentChange(latest.amount, average(numeric(priorAmounts.map(row => row.amount)))) : null;
      const recent3VsPrior3Percent = periods.recentSixComparable ? percentChange(average(recent3Amounts), average(prior3Amounts)) : null;

      const usageRows = trailing12.filter(
        (row) => typeof row.usage === "number" && Number.isFinite(row.usage),
      );
      const usageValues = usageRows.map((row) => row.usage as number);
      const averageUsage = average(usageValues);
      const latestUsage = latest?.usage ?? null;
      const previousUsage = previous?.usage ?? null;
      const usageTrendPercent = periods.comparison?.usageUnit && periods.comparison.latestDays === periods.comparison.previousDays ? percentChange(latestUsage, previousUsage) : null;
      const usageUnit =
        latest?.usageUnit ??
        [...ordered].reverse().find((row) => row.usageUnit)?.usageUnit ??
        null;
      const absoluteUsageReliable = usageScaleLooksReliable(
        usageValues,
        usageUnit,
      );

      const meta = metaByProvider.get(providerId);
      const intervalReadingCount = meta?.intervalReadingCount ?? null;
      const usageSummaryCount =
        (meta?.usageSummaryCount ?? ordered.length) || null;

      const savingsSignal: UtilityInsight["savingsSignal"] = {
        tone: "neutral", title: latestVsPreviousPercent === null ? "Your saved statement history" : "Your statement amount changed",
        body: periods.note ?? "Amounts due can include previous balances and credits. Compare billing days and recorded usage before drawing a conclusion about costs or savings.",
      };

      const history = trailing12.map((row) => ({
        billId: row.id,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        label: monthLabel(row.periodEnd ?? row.periodStart ?? row.issueDate),
        amount: row.amount,
        dailyUsageIndex: periods.dailyUsageIndex(row.id),
        usageIndex:
          absoluteUsageReliable && periods.dailyUsage.has(row.id) && periods.comparisonAllowed && periods.eligible(row) &&
          trailing12.every(other => periods.dailyUsage.has(other.id) && periods.durations.get(other.id) === periods.durations.get(row.id)) &&
          typeof row.usage === "number" &&
          averageUsage !== null &&
          averageUsage > 0
            ? Math.round((row.usage / averageUsage) * 100)
            : null,
      }));

      return {
        providerId,
        providerName: latest?.providerName ?? rows[0]?.providerName ?? "Utility",
        category: latest?.category ?? rows[0]?.category ?? "Utility",
        categoryId: latest?.categoryId ?? rows[0]?.categoryId ?? "other",
        statementCount: ordered.length,
        amountBasis: "amount_due",
        currency: latest?.currency ?? "CAD",
        amountStatementCount: periods.amountCount,
        periodComparison: periods.comparison,
        comparisonNote: periods.note,
        usageBasis: "daily",
        usageComparisonCount: periods.usageCount,
        firstPeriodStart: ordered[0]?.periodStart ?? null,
        latestPeriodEnd: latest?.periodEnd ?? null,
        latestBillId: latest?.id ?? null,
        latestBillAmount: latest?.amount ?? null,
        previousBillAmount: previous?.amount ?? null,
        latestVsPreviousPercent,
        latestVsAveragePercent,
        trailing12Average: periods.comparisonAllowed ? trailing12Average : null,
        trailing12Total: periods.comparisonAllowed ? trailing12Total : null,
        highestBillAmount: periods.comparisonAllowed ? highest?.amount ?? null : null,
        highestBillPeriod: highest?.periodEnd ?? highest?.periodStart ?? null,
        recent3VsPrior3Percent,
        usageTrendPercent,
        usageUnit: absoluteUsageReliable ? usageUnit : null,
        absoluteUsageReliable,
        intervalReadingCount,
        usageSummaryCount,
        intervalDataReported:
          typeof intervalReadingCount === "number" && intervalReadingCount > 0,
        intervalAnalysisReady: meta?.intervalAnalysisReady ?? false,
        lastSyncAt: meta?.lastSyncAt ?? null,
        savingsSignal,
        history,
      } satisfies UtilityInsight;
    })
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

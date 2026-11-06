import { isUnreliableReadingQuality } from "./reading-quality";
import type { UtilityStatementInput } from "./analytics";

const dayMs = 86_400_000;
function date(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function days(row: UtilityStatementInput, today: string) {
  if (!date(today) || !date(row.periodStart) || !date(row.periodEnd) || row.periodStart > row.periodEnd || row.periodEnd >= today) return null;
  return (Date.parse(row.periodEnd) - Date.parse(row.periodStart)) / dayMs + 1;
}
function unit(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "kwh" ? "kWh" : normalized === "m3" || normalized === "m³" ? "m³" : normalized === "gj" ? "GJ" : normalized === "l" ? "L" : null;
}
function validUsage(row: UtilityStatementInput, expected: string | null) {
  const amount = row.usage;
  if (!expected || unit(row.usageUnit) !== expected || amount === null || !Number.isFinite(amount) || amount < 0) return false;
  if (isUnreliableReadingQuality(row.readingQuality)) return false;
  const compatible = row.categoryId === "electricity" ? expected === "kWh" : row.categoryId === "gas" ? ["m³", "GJ"].includes(expected) : row.categoryId === "water" && ["m³", "L"].includes(expected);
  // Preserve the existing conservative multiplier check. Do not infer a scale.
  return compatible && !(expected === "kWh" && amount > 20_000);
}
function percent(current: number, previous: number) {
  return previous > 0 ? Math.round((current / previous - 1) * 1000) / 10 : null;
}
export type ConnectedPeriodComparison = {
  latestDays: number; previousDays: number; gapDays: number;
  latestUsagePerDay: number | null; previousUsagePerDay: number | null;
  usageUnit: string | null; usageChangePercent: number | null;
};

export function connectedStatementHistory(rows: UtilityStatementInput[], today: string, complete: boolean) {
  const unique = [...new Map(rows.map(row => [row.id, row])).values()];
  const ordered = unique.sort((a, b) => (a.periodEnd ?? a.issueDate ?? "").localeCompare(b.periodEnd ?? b.issueDate ?? "") || a.id.localeCompare(b.id));
  const durations = new Map(ordered.map(row => [row.id, days(row, today)]));
  const overlaps = new Set(ordered.filter(row => date(row.periodStart) && date(row.periodEnd) && ordered.some(other => other.id !== row.id && date(other.periodStart) && date(other.periodEnd) && other.periodStart <= row.periodEnd! && other.periodEnd >= row.periodStart!)).map(row => row.id));
  const currencies = new Set(ordered.map(row => row.currency ?? "CAD"));
  const categories = new Set(ordered.map(row => row.categoryId));
  const latest = ordered.at(-1), previous = ordered.at(-2);
  const usablePeriod = (row: UtilityStatementInput) => durations.get(row.id) !== null && !overlaps.has(row.id);
  const eligible = (row: UtilityStatementInput) => usablePeriod(row) && row.amount !== null && Number.isFinite(row.amount) && row.amount >= 0;
  const comparisonAllowed = complete && currencies.size === 1 && categories.size === 1;
  let comparison: ConnectedPeriodComparison | null = null;
  if (latest && previous && comparisonAllowed && eligible(latest) && eligible(previous)) {
    const latestDays = durations.get(latest.id)!, previousDays = durations.get(previous.id)!;
    const expected = unit(latest.usageUnit);
    const validPair = validUsage(latest, expected) && validUsage(previous, expected);
    const latestUsagePerDay = validPair ? latest.usage! / latestDays : null;
    const previousUsagePerDay = validPair ? previous.usage! / previousDays : null;
    comparison = { latestDays, previousDays, gapDays: Math.max(0, (Date.parse(latest.periodStart!) - Date.parse(previous.periodEnd!)) / dayMs - 1),
      latestUsagePerDay, previousUsagePerDay, usageUnit: validPair ? expected : null,
      usageChangePercent: latestUsagePerDay !== null && previousUsagePerDay !== null ? percent(latestUsagePerDay, previousUsagePerDay) : null };
  }
  const latest12 = ordered.slice(-12);
  const usageUnit = latest ? unit(latest.usageUnit) : null;
  const usageRows = comparisonAllowed ? latest12.filter(row => usablePeriod(row) && validUsage(row, usageUnit)) : [];
  // A weighted daily baseline respects different billing lengths and missing periods.
  const totalDays = usageRows.reduce((sum, row) => sum + durations.get(row.id)!, 0);
  const usageDailyAverage = usageRows.length >= 2 && totalDays ? usageRows.reduce((sum, row) => sum + row.usage!, 0) / totalDays : null;
  const dailyUsage = new Map(usageRows.map(row => [row.id, row.usage! / durations.get(row.id)!]));
  const note = !complete ? "Only part of your saved history is available. Refresh to check for the remaining statements."
    : currencies.size > 1 || categories.size > 1 ? "These records contain different currencies or services. Review the statements separately."
    : !latest ? "No statements are saved yet."
    : durations.get(latest.id) === null ? "The latest statement has missing dates or a service period that has not ended. Its saved amount remains available."
    : overlaps.has(latest.id) || (previous && overlaps.has(previous.id)) ? "The latest periods overlap. Review the statements for a correction or duplicate before comparing."
    : latest.amount === null || !Number.isFinite(latest.amount) ? "The latest amount is unavailable. Open the statement to review its saved details."
    : latest.amount < 0 || (previous?.amount !== null && previous?.amount !== undefined && previous.amount < 0) ? "A recent statement includes a net credit. A credit does not establish ongoing savings."
    : !previous ? "Your first statement is saved. A second completed period lets you compare billing days and recorded usage."
    : !comparison ? "The previous statement is missing comparable dates or an amount. You can still review both originals."
    : null;
  return { ordered, latest12, comparison, note, durations, eligible, comparisonAllowed, usageUnit,
    dailyUsage, usageDailyAverage, usageCount: usageRows.length,
    amountCount: latest12.filter(row => row.amount !== null && Number.isFinite(row.amount)).length,
    recentSixComparable: comparisonAllowed && ordered.length >= 6 && ordered.slice(-6).every(eligible),
    dailyUsageIndex: (id: string) => usageDailyAverage !== null && usageDailyAverage > 0 && dailyUsage.has(id) ? Math.round(dailyUsage.get(id)! / usageDailyAverage * 100) : null };
}

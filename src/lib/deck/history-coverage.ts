
type Range = { since_date: string; until_date: string };
function record(value: unknown): Record<string, unknown> {
 return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function date(value: unknown): value is string {
 if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const time = new Date(value + "T00:00:00Z");
 return Number.isFinite(time.getTime()) && time.toISOString().slice(0,10) === value;
}
/** Only published coverage for the exact requested range; no inferred monthly count. */
export function publicHistoryCoverage(value: unknown, range: Range): { listedStatements: number | null; missingBillDates: string[] } {
 const accounts = new Map<string,Record<string,unknown>>();
 for (const item of Array.isArray(value) ? value : []) {
  const row = record(item);
  if (typeof row.account_id === "string" && row.account_id && row.since_date === range.since_date && row.until_date === range.until_date)
   accounts.set(row.account_id, row);
 }
 const rows = [...accounts.values()];
 const countsKnown = rows.length > 0 && rows.every(row => Number.isSafeInteger(row.listed_bill_count) && Number(row.listed_bill_count) >= 0);
 const listedStatements = countsKnown ? rows.reduce((sum,row)=>sum+Number(row.listed_bill_count),0) : null;
 const missingBillDates = [...new Set(rows.flatMap(row => (Array.isArray(row.missing_bill_dates) ? row.missing_bill_dates : [])
  .filter((value): value is string => date(value) && value >= range.since_date && value <= range.until_date)))].sort();
 return { listedStatements: listedStatements !== null && Number.isSafeInteger(listedStatements) ? listedStatements : null, missingBillDates };
}

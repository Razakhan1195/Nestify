export type SnapshotBill = { id: string; providerId: string | null; isHistoricalStatement: boolean; billingPeriodStart: string | null; billingPeriodEnd: string | null; amount: number | null; currency: string; accountNumber: string | null };
export type SnapshotUtility = { providerId: string; providerName: string; categoryId: string };

export type StatementPoint = { id: string; amount: number; start: string; end: string };
export type UtilitySnapshot = {
  providerId: string; providerName: string; categoryId: string; currency: string; accountNumber: string | null;
  latest: StatementPoint; points: StatementPoint[]; difference: number | null;
  previousEnd: string | null; note: string | null;
};

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// Statement amounts are observations, never a household total, balance or savings estimate.
export function utilitySnapshots(bills: SnapshotBill[], utilities: SnapshotUtility[]): UtilitySnapshot[] {
  return utilities.flatMap(utility => {
    const accounts = [...new Set(bills.filter(b => b.providerId === utility.providerId && b.isHistoricalStatement).map(b => b.accountNumber))];
    return accounts.flatMap(accountNumber => {
    const saved = bills.filter(b => b.providerId === utility.providerId && b.accountNumber === accountNumber && b.isHistoricalStatement && validDate(b.billingPeriodStart) && validDate(b.billingPeriodEnd) && b.billingPeriodStart! <= b.billingPeriodEnd!)
      .sort((a, b) => b.billingPeriodEnd!.localeCompare(a.billingPeriodEnd!) || a.id.localeCompare(b.id));
    const latest = saved[0];
    if (!latest || typeof latest.amount !== "number" || !Number.isFinite(latest.amount) || !/^[A-Z]{3}$/.test(latest.currency)) return [];
    const sameAccount = saved.filter(b => b.accountNumber === latest.accountNumber);
    const mixed = sameAccount.some(b => b.currency !== latest.currency);
    const missing = sameAccount.some(b => typeof b.amount !== "number" || !Number.isFinite(b.amount));
    const rows = sameAccount.filter(b => b.currency === latest.currency && typeof b.amount === "number" && Number.isFinite(b.amount)).slice(0, 6).reverse();
    const points = rows.map(b => ({ id: b.id, amount: b.amount!, start: b.billingPeriodStart!, end: b.billingPeriodEnd! }));
    const overlap = points.some((p, i) => i > 0 && p.start <= points[i - 1].end);
    const credits = points.some(p => p.amount < 0);
    const unavailable = mixed || overlap || credits || missing;
    const previous = !unavailable && points.length > 1 ? points[points.length - 2] : null;
    const point = { id: latest.id, amount: latest.amount!, start: latest.billingPeriodStart!, end: latest.billingPeriodEnd! };
    return [{ accountNumber, providerId: utility.providerId, providerName: utility.providerName, categoryId: utility.categoryId, currency: latest.currency, latest: point,
      points: unavailable ? [] : points,
      difference: previous ? Math.round((point.amount - previous.amount) * 100) / 100 : null,
      previousEnd: previous?.end ?? null,
      note: missing ? "Some statement amounts are missing. Review the saved details." : mixed ? "History contains different currencies. Review statements individually." : overlap ? "Statement periods overlap. A trend isn’t shown." : credits ? "History includes credits. Review the individual statements." : points.length < 2 ? "One saved statement. A trend appears when more are available." : null }];
    });
  }).sort((a, b) => b.latest.end.localeCompare(a.latest.end) || a.providerId.localeCompare(b.providerId));
}

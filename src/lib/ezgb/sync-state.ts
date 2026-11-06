import type { EzgbBill } from "./types";

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function inferRatePlan(charges: Record<string, unknown>) {
  const labels = Object.keys(charges).map((label) => label.toLowerCase());
  if (labels.some((label) => /ultra.low/.test(label))) return "ulo";
  if (labels.some((label) => /tier ?1/.test(label))) return "tiered";
  if (labels.includes("off-peak") && labels.includes("on-peak")) return "tou";
  return null;
}

export function billEnrichment(bill: Pick<EzgbBill, "services"> & Partial<Pick<EzgbBill, "quality_of_reading" | "meterSummary_calculated">> | undefined) {
  const service = bill?.services?.electricity;
  if (!service) return null;
  const charges: Record<string, number> = {};
  for (const [label, amount] of Object.entries(service.chargeTotals ?? {})) {
    if (typeof amount === "number" && Number.isFinite(amount)) charges[label] = amount;
  }
  if (!Object.keys(charges).length) {
    for (const charge of service.charges ?? []) {
      if (charge.description && typeof charge.amount === "number" && Number.isFinite(charge.amount)) {
        charges[charge.description] = (charges[charge.description] ?? 0) + charge.amount;
      }
    }
  }
  if (!Object.keys(charges).length) return null;
  return {
    commodity: "electricity", unit: service.unit ?? null,
    charge_totals: charges, inferred_rate_plan: inferRatePlan(charges),
    quality_of_reading: bill?.quality_of_reading ?? null,
    meter_summary_calculated: bill?.meterSummary_calculated ?? null,
  };
}

export function mergeBillRawData(existing: unknown, incoming: unknown, enrichment: ReturnType<typeof billEnrichment>): Record<string, unknown> {
  return {
    ...objectValue(existing), ...objectValue(incoming),
    ...(enrichment ? { ezgb_export: { ...objectValue(objectValue(existing).ezgb_export), ...enrichment } } : {}),
  };
}

export function publicSyncError(status?: number) {
  if (status === 401 || status === 403) return "The utility connection could not be verified. Try again or reconnect if access has expired.";
  if (status === 429) return "The utility service is busy. Try again later; your saved history is still available.";
  return "Utility data could not be refreshed. Your previously saved data is still available.";
}

export function effectiveJobStatus(status: string, expiresAt: string, now = Date.now()) {
  const expires=Date.parse(expiresAt);
  return ["queued", "running"].includes(status) && (!Number.isFinite(expires)||expires<=now) ? "waiting" : status;
}

export function disconnectScope(
  rows: { user_id: string; home_id: string }[],
  userId: string,
  homeId: string,
  confirmShared: boolean,
): "allowed" | "missing" | "outside_home" | "confirmation_required" {
  if (!rows.length) return "missing";
  if (rows.some((row) => row.user_id !== userId || row.home_id !== homeId)) return "outside_home";
  if (rows.length > 1 && !confirmShared) return "confirmation_required";
  return "allowed";
}

export function syncIsReady(stats: { billsImported?: number; integrationsConnected: number; errors: number; quarantined: number; intervalErrors?: number; intervalAccountsPending?: number }) {
  return stats.billsImported !== 0 && stats.integrationsConnected > 0 && stats.errors === 0 && stats.quarantined === 0 && !stats.intervalErrors && !stats.intervalAccountsPending;
}

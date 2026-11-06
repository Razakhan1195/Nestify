import { createHash } from "node:crypto";

import type {
  EzgbAccountRow,
  EzgbBill,
  EzgbBillData,
} from "@/lib/ezgb/types";

const PLACEHOLDERS = new Set(["unknown", "null", "none", "n/a", "na", "-", ""]);

export function cleanEzgbValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim();
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? null : trimmed;
}

export function ezgbInteger(value: unknown): number | null {
  const cleaned = cleanEzgbValue(value);
  if (cleaned === null) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function ezgbNumber(value: unknown): number | null {
  const cleaned = cleanEzgbValue(value);
  if (cleaned === null) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ezgbDate(value: unknown): string | null {
  const cleaned = cleanEzgbValue(value);
  if (!cleaned) return null;
  const date = cleaned.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function normalizedUtility(row: EzgbAccountRow) {
  return (
    cleanEzgbValue(row.custodian?.humanName) ??
    cleanEzgbValue(row.custodian?.utilityName) ??
    "unknown"
  );
}

export function ezgbServicePointKey(row: EzgbAccountRow) {
  const usagePointUuid = cleanEzgbValue(row.child?.usagePointUUID)?.toLowerCase();
  if (!usagePointUuid) return null;
  return `${normalizedUtility(row).trim().toLowerCase()}:${usagePointUuid}`;
}

export function normalizeEzgbAccount(row: EzgbAccountRow) {
  const servicePointKey = ezgbServicePointKey(row);
  const usagePointUuid =
    cleanEzgbValue(row.child?.usagePointUUID)?.toLowerCase() ?? null;

  return {
    servicePointKey,
    keyable: Boolean(servicePointKey),
    ezgbId: cleanEzgbValue(row.child?._id),
    authorizationId: cleanEzgbValue(row.parent?.authorization),
    utility: normalizedUtility(row),
    utilityCode: cleanEzgbValue(row.custodian?.utilityName),
    usagePointUuid,
    accountNumber: cleanEzgbValue(row.child?.accountNumber),
    meterNumber: cleanEzgbValue(row.child?.meterNumber),
    label: cleanEzgbValue(row.child?.nickName),
    latestBillDate: ezgbDate(row.child?.latestBillDate),
    intervalReadingCount: ezgbInteger(row.child?.intervalReadingCount),
    usageSummaryCount: ezgbInteger(row.child?.usageSummaryCount),
    retrievedAt: cleanEzgbValue(row.child?.retrieved),
    accountHolder:
      cleanEzgbValue(row.parent?.user?.email) ??
      cleanEzgbValue(row.parent?.user?.username),
  };
}

export function ezgbAddress(data: EzgbBillData["customerData"]) {
  return {
    addressLine1: cleanEzgbValue(data?.serviceAddress1),
    addressLine2: cleanEzgbValue(data?.serviceAddress2),
    city: cleanEzgbValue(data?.serviceAddressCity),
    province: cleanEzgbValue(data?.serviceAddressProvince),
    postalCode: cleanEzgbValue(data?.serviceAddressPostalCode),
  };
}

function billUsage(bill: EzgbBill) {
  const services = bill.services ?? {};
  const entries = Object.entries(services);
  // A combined-service total must never be attributed to whichever service is listed first.
  const [commodity, service] = entries.length === 1 ? entries[0] : [null, null];
  if (!service) {
    return {
      commodity: null,
      usage: null,
      usageUnit: null,
      totalCostRaw: null,
    };
  }

  const readings = service.reading ?? [];
  const values = readings
    .map((reading) => ezgbNumber(reading.usage))
    .filter((value): value is number => value !== null);

  const completeReadings = readings.length > 0 && values.length === readings.length;
  const sum = completeReadings ? values.reduce((sum, value) => sum + value, 0) : null;
  const explicitTotal = ezgbNumber(service.totalUsage);
  const conflict = sum !== null && explicitTotal !== null && Math.abs(sum - explicitTotal) > 0.001;
  // Missing readings are unknown, not zero. Conflicting reported totals require review.
  const usage = conflict ? null : explicitTotal ?? sum;
  return {
    commodity: cleanEzgbValue(commodity),
    usage,
    usageUnit: cleanEzgbValue(service.unit),
    totalCostRaw: service.totalCost ?? null,
  };
}

export function normalizeEzgbBills(
  document: EzgbBillData,
  servicePointKey: string,
  ezgbId: string,
) {
  const address = ezgbAddress(document.customerData);
  const utility = cleanEzgbValue(document.utilityName);

  return (document.bills ?? []).map((bill) => {
    const periodStart = ezgbDate(bill.start_date);
    const periodEnd = ezgbDate(bill.end_date);
    const usage = billUsage(bill);
    const naturalKey =
      periodStart && periodEnd
        ? `${servicePointKey}:${periodStart}:${periodEnd}`
        : null;

    return {
      naturalKey,
      keyable: Boolean(naturalKey && periodStart! <= periodEnd!),
      periodStart,
      periodEnd,
      billNumber: cleanEzgbValue(bill.bill_number),
      billDate: ezgbDate(bill.date),
      dueDate: ezgbDate(bill.due_date),
      amountDue: ezgbNumber(bill.amount_due),
      currency: cleanEzgbValue(bill.currency) ?? "CAD",
      qualityOfReading: cleanEzgbValue(bill.quality_of_reading),
      utility,
      accountNumber: cleanEzgbValue(document.customerData?.accountNumber),
      meterNumber: cleanEzgbValue(document.customerData?.meterNumber),
      ezgbIdAtLoad: ezgbId,
      ...usage,
      ...address,
    };
  });
}

export function ezgbExternalBillId(
  servicePointKey: string,
  periodStart: string,
  periodEnd: string,
) {
  return `ezgb_${createHash("sha256")
    .update(`${servicePointKey}|${periodStart}|${periodEnd}`)
    .digest("hex")
    .slice(0, 40)}`;
}

export function ezgbCategory(commodity: string | null) {
  switch (commodity?.toLowerCase()) {
    case "electricity":
      return "Electricity";
    case "naturalgas":
    case "natural gas":
    case "gas":
      return "Natural Gas";
    case "water":
      return "Water";
    default:
      return "Other service";
  }
}

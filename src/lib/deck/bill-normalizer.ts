import { createHash } from "node:crypto";

import type { DeckBill } from "@/lib/deck/types";

type NormalizeInput = {
  output: unknown;
  providerName: string;
  category: string;
  taskRunId: string;
  storage?: Array<Record<string, unknown>> | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (["unknown", "n/a", "na", "none", "null", "-"].includes(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanString(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function dateValue(value: unknown) {
  const text = cleanString(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : text;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function first(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function billCandidates(output: unknown) {
  if (Array.isArray(output)) return output;
  const obj = record(output);
  if (!obj) return [];
  if (Array.isArray(obj.bills)) return obj.bills;
  if (Array.isArray(obj.statements)) return obj.statements;
  if (record(obj.bill)) return [obj.bill];
  return [obj];
}

function maskAccount(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return null;
  return `•••• ${normalized.slice(-4)}`;
}
function billingPeriod(source: Record<string, unknown>) {
  const start = dateValue(first(source, ["billing_period_start", "period_start", "service_start"]));
  const end = dateValue(first(source, ["billing_period_end", "period_end", "service_end"]));
  if (start || end) return { start, end };

  const text = cleanString(first(source, ["billing_period", "service_period"]));
  if (!text) return { start: null, end: null };
  const parts = text.split(/\s+(?:to|through)\s+|\s+[–—]\s+/i);
  if (parts.length < 2) return { start: null, end: null };
  return { start: dateValue(parts[0]), end: dateValue(parts[1]) };
}

function hasPdf(storage: Array<Record<string, unknown>> | null | undefined) {
  return Boolean(storage?.some((item) => {
    const name = cleanString(item.file_name ?? item.name)?.toLowerCase();
    const type = cleanString(item.file_type ?? item.mime_type ?? item.content_type)?.toLowerCase();
    return type === "application/pdf" || Boolean(name?.endsWith(".pdf"));
  }));
}

function externalId(input: {
  providerName: string;
  accountNumber: string | null;
  amount: number | null;
  dueDate: string | null;
  issueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  billUrl: string | null;
  taskRunId: string;
}) {
  const stableParts = [
    input.providerName,
    input.accountNumber,
    input.dueDate,
    input.issueDate,
    input.periodStart,
    input.periodEnd,
    input.billUrl,
  ].filter(Boolean);
  const identity = stableParts.length >= 2
    ? stableParts.join("|")
    : [input.providerName, input.taskRunId].join("|");
  return `deck-${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}
export function normalizeDeckBillOutput(input: NormalizeInput): DeckBill[] {
  return billCandidates(input.output).flatMap((candidate) => {
    const source = record(candidate);
    if (!source) return [];

    const statementAmount = numberValue(
      first(source, ["statement_amount", "bill_amount", "statement_total", "total_charges"]),
    );
    const amountDue = numberValue(
      first(source, ["amount_due", "current_amount_due", "amount", "total_due", "balance_due"]),
    );
    const amountPaid = numberValue(
      first(source, ["amount_paid", "payment_amount", "last_payment_amount"]),
    );
    const paymentDate = dateValue(
      first(source, ["payment_date", "last_payment_date"]),
    );
    const autopayEnrolledRaw = first(source, [
      "autopay_enrolled",
      "preauthorized_payment_enrolled",
      "pap_enrolled",
    ]);
    const autopayEnrolled =
      typeof autopayEnrolledRaw === "boolean" ? autopayEnrolledRaw : null;
    const autopayScheduledAmount = numberValue(
      first(source, ["autopay_scheduled_amount", "scheduled_payment_amount"]),
    );
    const autopayScheduledDate = dateValue(
      first(source, ["autopay_scheduled_date", "scheduled_payment_date"]),
    );
    const dueDate = dateValue(first(source, ["due_date", "payment_due_date"]));
    const issueDate = dateValue(first(source, ["bill_date", "issue_date", "statement_date"]));
    const accountNumber = cleanString(first(source, ["account_number", "account", "account_id"]));
    const billUrl = cleanString(first(source, ["bill_url", "document_url", "statement_url"]));
    const period = billingPeriod(source);

    const meaningful =
      statementAmount !== null ||
      amountDue !== null ||
      amountPaid !== null ||
      dueDate ||
      issueDate ||
      accountNumber ||
      billUrl;
    if (!meaningful) return [];

    const currency = cleanString(source.currency)?.toUpperCase() || "CAD";
    const paymentStatus = cleanString(first(source, ["payment_status", "status"]));

    return [{
      externalBillId: externalId({
        providerName: input.providerName,
        accountNumber,
        amount: amountDue,
        dueDate,
        issueDate,
        periodStart: period.start,
        periodEnd: period.end,
        billUrl,
        taskRunId: input.taskRunId,
      }),
      providerName: input.providerName,
      category: input.category,
      statementAmount,
      amountDue,
      amountPaid,
      paymentDate,
      autopayEnrolled,
      autopayScheduledAmount,
      autopayScheduledDate,
      autopayPaymentMethod: cleanString(
        first(source, ["autopay_payment_method", "payment_method_label"]),
      ),
      currency,
      dueDate,
      issueDate,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      accountNumberMasked: maskAccount(accountNumber),
      paymentStatus,
      pdfAvailable: hasPdf(input.storage),
      lineItems: [],
      detectedFees: [],
      rawData: {
        source: "deck_v2",
        taskRunId: input.taskRunId,
        paymentStatus,
        statementAmount,
        amountDue,
        amountPaid,
        paymentDate,
        autopayEnrolled,
        autopayScheduledAmount,
        autopayScheduledDate,
        billingPeriod: cleanString(first(source, ["billing_period", "service_period"])),
        hasBillUrl: Boolean(billUrl),
      },
    } satisfies DeckBill];
  });
}

import { historyRange } from "./history-range";
import { createHash } from "node:crypto";
import { normalizeDeckBillOutput } from "./bill-normalizer";
import { mapDeckBillToBillRow } from "./mapper";
import type { DeckV2Interaction } from "./v2-client";
export type TelecomWindow = { since_date: string; until_date: string };
export type TelecomPhase = { workflowId?: string; workflowRunId?: string; workflowCancellationPending?: boolean; sourceId?: string; taskId: string; input: Record<string, unknown>; kind: "authenticate" | "accounts" | "latest" | "history" };
export type TelecomSummary = { listedStatements?: number | null; missingBillDates?: string[]; status: string; phase: string; saved: number; originals: number; completedWindows: number; totalWindows: number; sinceDate: string; untilDate: string; message: string; updatedAt: string; verificationExpiresAt: string | null; authenticated: boolean };
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
export function validDate(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const d = new Date(value + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null; }
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function telecomWindows(now = new Date(), months = 12): TelecomWindow[] {
  const until = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  if (!Number.isInteger(months) || months < 1 || months > 12) throw Error("Invalid history range");
  const since = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() - months, 1));
  since.setUTCDate(Math.min(until.getUTCDate(), new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + 1, 0)).getUTCDate()));
  const windows: TelecomWindow[] = []; let end = new Date(until);
  while (end >= since) {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1));
    if (start < since) start.setTime(since.getTime());
    windows.push({ since_date: start.toISOString().slice(0, 10), until_date: end.toISOString().slice(0, 10) });
    end = new Date(start.getTime() - 86400000);
  }
  return windows;
}
export function telecomImportPlan(input: { registryId: string | null; taskId: string; historyTaskId: string; authenticationTaskId?: string | null; accountExtractionTaskId?: string | null; historyMonths?: number }, now = new Date()) {
 const range = historyRange(input.historyMonths ?? 6, now);
 const phases: TelecomPhase[] = [
  ...(input.authenticationTaskId ? [{kind:"authenticate" as const,taskId:input.authenticationTaskId,input:{}}] : []),
  ...(input.accountExtractionTaskId ? [{kind:"accounts" as const,taskId:input.accountExtractionTaskId,input:{}}] : []),
  {kind:"history",taskId:input.historyTaskId,input:range}
 ];
 return {windows:[range],phases};
}
export function telecomCoverage(output: unknown, range: TelecomWindow, expectedAccounts: string[]) {
  const root = record(output); const bills = Array.isArray(root.bills) ? root.bills : [];
  const accounts = Array.isArray(root.accounts) ? root.accounts.map(x => text(record(x).account_id)).filter((x): x is string => !!x) : [];
  const all = [...new Set([...expectedAccounts, ...accounts])];
  const coverage = Array.isArray(root.coverage) ? root.coverage.map(record) : [];
  const complete = all.length > 0 && all.every(id => {
    const c = coverage.find(c => c.account_id === id);
    const captured = bills.filter(b => record(b).account_id === id && validDate(record(b).bill_date) && String(record(b).bill_date) >= range.since_date && String(record(b).bill_date) <= range.until_date);
    return c?.status === "complete" && c.since_date === range.since_date && c.until_date === range.until_date && Number.isInteger(c.listed_bill_count) && Number(c.listed_bill_count) >= 0 && captured.length === c.listed_bill_count && new Set(captured.map(b => record(b).bill_date)).size === captured.length && Array.isArray(c.missing_bill_dates) && c.missing_bill_dates.length === 0;
  });
  return { complete, accounts: all, coverage };
}
export function telecomBillRows(input: { output: unknown; providerName: string; category: string; taskRunId: string; providerId: string; userId: string; homeId: string; today: string; phase?: "latest" | "history" }) {
  const root = record(input.output); const source = Array.isArray(root.bills) ? root.bills.map(record) : [];
  return source.flatMap(s => {
    const account = text(s.account_id) || text(s.account_number); const issue = validDate(s.bill_date);
    // Never collapse two accounts by due date, or create records from a balance-only response.
    if (!account || !issue || typeof s.statement_amount !== "number" || !Number.isFinite(s.statement_amount) || text(s.currency)?.toUpperCase() !== "CAD" || issue > input.today) return [];
    if (source.filter(b => (text(b.account_id) || text(b.account_number)) === account && validDate(b.bill_date) === issue).length !== 1) return [];
    const labels: Record<string, string> = { mobile: "Mobile phone", internet: "Internet", tv: "TV", home_phone: "Home phone", home_security: "Home security", electricity: "Electricity", natural_gas: "Natural Gas", water: "Water", wastewater: "Wastewater", waste: "Waste", property_tax: "Property Tax", insurance: "Home Insurance", rental: "Water Heater Rental" };
    const types = [...new Set(Array.isArray(s.service_types) ? s.service_types.filter((v): v is string => typeof v === "string" && Object.hasOwn(labels, v)) : [])].sort();
    const services = types.map(t => labels[t]);
    const telecomOnly = types.length > 0 && types.every(t => ["mobile","internet","tv","home_phone","home_security"].includes(t));
    const category = services.length > 1 ? (telecomOnly ? "Telecom bundle" : "Utility bundle") : (telecomOnly && types[0] === "tv" ? "Telecom · TV" : services[0]) ?? input.category;
    const clean = { ...s };
    for (const key of ["due_date", "billing_period_start", "billing_period_end", "payment_date", "autopay_scheduled_date"]) clean[key] = validDate(s[key]);
    if (clean.billing_period_start && clean.billing_period_end && String(clean.billing_period_start) > String(clean.billing_period_end)) { clean.billing_period_start = null; clean.billing_period_end = null; }
    const bill = normalizeDeckBillOutput({ output: { bills: [clean] }, providerName: input.providerName, category, taskRunId: input.taskRunId })[0];
    if (!bill) return [];
    bill.externalBillId = "deck-telco-" + digest([input.providerId, account, issue]).slice(0, 40);
    bill.pdfAvailable = false;
    const lines = (value: unknown) => Array.isArray(value) ? value.flatMap(v => { const r = record(v); return text(r.label) && typeof r.amount === "number" && Number.isFinite(r.amount) ? [{ label: String(r.label), amount: r.amount }] : []; }) : [];
    bill.lineItems = lines(s.line_items); bill.detectedFees = lines(s.detected_fees);
    bill.rawData = { ...bill.rawData, accountKey: digest(account), sourceBillId: text(s.bill_id), discounts: Array.isArray(s.discounts) ? s.discounts : [] };
    const row = mapDeckBillToBillRow({ ...input, bill });
    const payment = text(s.payment_status)?.toLowerCase();
    const paymentStatus = payment === "paid" || payment === "paid_in_full" ? "paid" : ["unpaid", "partial", "scheduled", "overdue"].includes(payment ?? "") ? (payment === "overdue" ? "unpaid" : payment!) : null;
    // Only the latest task may establish a current payment request. Old dates,
    // unknown payment state and autopay alone cannot manufacture an overdue bill.
    const current = input.phase === "latest" && !!bill.dueDate && (
      paymentStatus === "paid" || (bill.amountDue !== null && bill.amountDue > 0 && (bill.dueDate >= input.today || paymentStatus !== null))
    );
    const discounts = Array.isArray(s.discounts) ? s.discounts.flatMap(v => {
      const d = record(v); return text(d.label) && typeof d.amount === "number" && Number.isFinite(d.amount) ? [{ label: text(d.label)!.slice(0,160), amount: d.amount, endsOn: validDate(d.ends_on) }] : [];
    }) : [];
    return [{
      ...row, source: "deck", provider_connection_id: input.providerId,
      status: current ? (paymentStatus === "paid" ? "paid" : "upcoming") : "archived",
      payment_status: paymentStatus,
      current_amount_due: current ? row.current_amount_due : null,
      autopay_status: current ? row.autopay_status : null,
      autopay_scheduled_amount: current ? row.autopay_scheduled_amount : null,
      autopay_scheduled_date: current ? row.autopay_scheduled_date : null,
      raw_data: { ...row.raw_data, category, record_kind: current ? "current" : "historical", amount_basis: "statement_total", import_phase: input.phase ?? "history", ...(telecomOnly ? {telecom_contract:"v1"} : {bill_contract:"ca-bills-20261011-v1"}), account_key: digest(account), telecom: { services, fees: bill.detectedFees, discounts, taxAmount: typeof s.tax_amount === "number" && Number.isFinite(s.tax_amount) ? s.tax_amount : null } },
    }];
  });
}
export function telecomInteractionKey(runId: string, updatedAt: string | undefined, interaction: DeckV2Interaction) {
  return digest([runId, updatedAt ?? null, interaction]);
}
export function telecomOutcome(saved: number, complete: boolean) {
  return saved === 0 ? (complete ? {status:"completed",message:"No issued bills were available within your selected date range. You can choose a longer range, up to 12 months, or upload a bill."} : { status: "partial", message: "No statements were saved. The provider may not offer this history online. You can try again or upload a bill." }) :
    complete ? { status: "completed", message: `${saved} statement${saved === 1 ? "" : "s"} saved. Your requested bill history is ready.` } :
      { status: "partial", message: `${saved} statement${saved === 1 ? "" : "s"} saved. Some requested statements or original PDFs are unavailable or need another attempt.` };
}

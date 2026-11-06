import type { ManualBillInput } from "./bill-input-types";
const text = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : "";
export function statementSuggestions(data: Record<string, unknown>, accountName: string): ManualBillInput {
  const confirmedCad = typeof data.currency === "string" && data.currency.trim().toUpperCase() === "CAD";
  const unsuitable = data.document_kind !== undefined && data.document_kind !== "statement";
  const start = date(data.billing_period_start), end = date(data.billing_period_end);
  const validPeriod = Boolean(start && end && start <= end);
  const amount = !unsuitable && confirmedCad && typeof data.period_charges === "number" && Number.isFinite(data.period_charges) && /^-?\d{1,10}(?:\.\d{1,2})?$/.test(String(data.period_charges)) ? String(data.period_charges) : "";
  return {
    record_kind: "historical", bill_title: text(data.bill_title) || text(data.provider), provider_name: text(data.provider),
    category: text(data.category).slice(0,100), account_number: accountName || (/^\d{4}$/.test(text(data.account_last_four)) ? `Account ending ${text(data.account_last_four)}` : ""), amount,
    due_date: date(data.due_date), issue_date: date(data.issue_date),
    billing_period_start: !unsuitable && validPeriod ? start : "", billing_period_end: !unsuitable && validPeriod ? end : "", notes: "",
  };
}
export type StatementDuplicate = { billId: string; canAttach: boolean; version: string | null };
export function statementDuplicate(details: unknown): StatementDuplicate | null {
  if (!details || typeof details !== "object" || !("duplicate" in details)) return null;
  const item = details.duplicate;
  if (!item || typeof item !== "object" || !("billId" in item) || typeof item.billId !== "string" || !/^[a-f0-9-]{36}$/i.test(item.billId)) return null;
  return { billId: item.billId, canAttach: "canAttach" in item && item.canAttach === true, version: "version" in item && typeof item.version === "string" ? item.version : null };
}

export function statementReviewHints(data: Record<string, unknown>): string[] {
 const hints: string[] = [];
 if (data.document_kind !== undefined && data.document_kind !== "statement")
  hints.push("Choose one clear statement per file. Enter the details yourself if this file cannot be read reliably.");
 const currency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "";
 if (currency !== "CAD") hints.push(currency
  ? "This file is not confirmed as CAD. The amount was left blank; this flow does not convert currencies."
  : "Currency could not be confirmed. Check that the original is in Canadian dollars before entering period charges.");
 const start = date(data.billing_period_start), end = date(data.billing_period_end);
 if (!start || !end || start > end) hints.push("Check the service-period start and end dates. Issue and payment dates are not substitutes.");
 if (typeof data.charge_label === "string" && data.charge_label.trim()) hints.push("Charge label: " + data.charge_label.slice(0, 120));
 if (typeof data.period_text === "string" && data.period_text.trim()) hints.push("Period shown: " + data.period_text.slice(0, 160));
 if (Array.isArray(data.review_notes)) hints.push(...data.review_notes.filter((v): v is string => typeof v === "string").slice(0, 3).map(v => v.slice(0, 200)));
 return [...new Set(hints)];
}


/** Keep an extracted charge independent of currency; never label it CAD until confirmed. */
export function statementChargeReview(data:Record<string,unknown>): {amount:string;currencyReview:"CAD"|"unconfirmed"|"foreign"} {
 const currency=typeof data.currency==="string"?data.currency.trim().toUpperCase():"";
 const currencyReview=currency==="CAD"?"CAD":(!currency||currency==="$"?"unconfirmed":"foreign");
 const unsuitable=data.document_kind!==undefined&&data.document_kind!=="statement";
 const value=data.period_charges;
 const amount=!unsuitable&&currencyReview!=="foreign"&&typeof value==="number"&&Number.isFinite(value)&&/^-?\d{1,10}(?:\.\d{1,2})?$/.test(String(value))?String(value):"";
 return {amount,currencyReview};
}

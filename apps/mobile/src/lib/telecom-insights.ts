import { historyDate, type HistoryBill } from "./manual-history-insights";
import type { TelecomBillDetails, TelecomLine } from "./telecom-bill";

export type TelecomInsightBill = HistoryBill & {
 issueDate?: string | null; status?: string;
 telecomDetails?: TelecomBillDetails | null;
};
export const telecomMoney = (amount: number, currency: string) => {
 try { return new Intl.NumberFormat("en-CA", {style:"currency",currency}).format(amount); }
 catch { return amount.toFixed(2) + " " + currency; }
};
const minor = (amount: number) => Math.round(amount * 100);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const labelKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g," ");

export function telecomAccountBills(bills: TelecomInsightBill[], billId: string) {
 const selected = bills.find(b => b.id === billId && b.source === "deck");
 if (!selected) return [];
 const seen = new Set<string>();
 return bills.filter(b => {
  const matches = b.id === selected.id || !!selected.accountKey && !!selected.providerId &&
   b.accountKey === selected.accountKey && b.providerId === selected.providerId &&
   b.currency === selected.currency && b.source === "deck";
  if (!matches || seen.has(b.id)) return false;
  seen.add(b.id); return true;
 }).sort((a,b) => (b.issueDate ?? "").localeCompare(a.issueDate ?? "") || a.id.localeCompare(b.id));
}

export function telecomBreakdown(bill: TelecomInsightBill) {
 const details = bill.telecomDetails;
 const lines = (details?.lineItems ?? []).filter(l => l.label.trim() && finite(l.amount));
 const included = [...new Map(lines.filter(l => minor(l.amount) === 0).map(l => [labelKey(l.label),l])).values()];
 const charged = lines.filter(l => minor(l.amount) !== 0);
 const sum = charged.reduce((n,l) => n + minor(l.amount),0);
 const total = finite(bill.amount) ? minor(bill.amount) : null;
 const tax = finite(details?.taxAmount) ? minor(details.taxAmount) : null;
 // A printed tax may already be among the charge lines. Never add it twice.
 const taxSeparate = charged.length > 0 && total !== null && tax !== null && sum + tax === total && sum !== total;
 const reconciled = charged.length > 0 && total !== null && (sum === total || taxSeparate);
 return {charged,included,reconciled,taxSeparate,subtotal:sum / 100,taxAmount:tax !== null ? tax / 100 : null};
}
function byLabel(lines: TelecomLine[]) {
 const result = new Map<string,{label:string;amount:number}>();
 for (const line of lines) {
  const key = labelKey(line.label), old = result.get(key);
  result.set(key,{label:line.label,amount:(old?.amount ?? 0) + minor(line.amount)});
 }
 return result;
}
export function analyzeTelecom(bills: TelecomInsightBill[], billId: string, today: string, complete: boolean) {
 const rows = telecomAccountBills(bills,billId), latest = rows[0] ?? null;
 const invalid = rows.some(b => !historyDate(b.issueDate ?? null) || b.issueDate! > today ||
  !finite(b.amount) || ["draft","incomplete"].includes(b.status ?? ""));
 const duplicateDates = new Set(rows.map(b => b.issueDate)).size !== rows.length;
 const dated = [...rows].reverse();
 const badPeriods = dated.some((b,i) => {
  if (b.billingPeriodStart && b.billingPeriodEnd &&
   (!historyDate(b.billingPeriodStart) || !historyDate(b.billingPeriodEnd) || b.billingPeriodStart > b.billingPeriodEnd)) return true;
  const previous = dated[i-1];
  return !!previous && historyDate(b.billingPeriodStart) && historyDate(previous.billingPeriodEnd) &&
   b.billingPeriodStart <= previous.billingPeriodEnd;
 });
 const safe = complete && historyDate(today) && !invalid && !duplicateDates && !badPeriods;
 const previous = safe && rows.length > 1 ? rows[1] : null;
 const difference = latest && previous ? (minor(latest.amount!) - minor(previous.amount!)) / 100 : null;
 const stableCount = safe && rows.length > 1 && rows.every(b => minor(b.amount!) === minor(latest!.amount!)) ? rows.length : 0;
 const currency = latest?.currency ?? "CAD";
 const headline = stableCount ? "Same total across " + stableCount + " saved statements" :
  difference === 0 ? "Your latest total is unchanged" :
  difference !== null ? telecomMoney(Math.abs(difference),currency) + (difference > 0 ? " higher on your latest bill" : " lower on your latest bill") :
  "Inside your statement";
 const detail = stableCount ? telecomMoney(latest!.amount!,currency) + " on each saved bill. This compares the recorded statement amounts." :
  previous ? "Compared with the statement issued " + previous.issueDate + ". Open the breakdown to see the recorded charges." :
  !complete ? "Some saved history could not be loaded. Statement details remain available; comparisons are withheld." :
  invalid || duplicateDates || badPeriods ? "Statement dates, amounts or overlapping records need review before comparing totals." :
  "Your saved charges and credits, with the original statement available for reference.";
 const lineChanges: {label:string;previous:number;current:number}[] = [];
 if (latest && previous && telecomBreakdown(latest).reconciled && telecomBreakdown(previous).reconciled) {
  const now = byLabel(telecomBreakdown(latest).charged), before = byLabel(telecomBreakdown(previous).charged);
  for (const key of new Set([...now.keys(),...before.keys()])) {
   const a = before.get(key), b = now.get(key);
   if ((a?.amount ?? 0) !== (b?.amount ?? 0)) lineChanges.push({label:b?.label ?? a!.label,previous:(a?.amount ?? 0)/100,current:(b?.amount ?? 0)/100});
  }
 }
 return {
  rows,latest,previous,difference,stableCount,headline,detail,safe,lineChanges,
  total: safe && rows.length ? rows.reduce((sum,b) => sum + minor(b.amount!),0) / 100 : null,
  // Issued telecom bills can cover services in advance. A future service-period
  // end is not grounds for excluding an already issued statement.
  chart: safe ? dated.map(b => ({id:b.id,date:b.issueDate!,amount:b.amount!})) : [],
 };
}

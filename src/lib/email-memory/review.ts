import { z } from "zod";
import { vaultRecordInput } from "../product/vault-input";
import { manualBillSchema } from "../product/bill-input";
import type { EmailProposal } from "./extraction";

const date = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v ? v : "";
export function verifiedProposal(value: EmailProposal, source: string, attachmentForReview = false): EmailProposal | null {
  if (value.category === "unknown" || value.confidence === "low" || !value.title || !value.summary) return null;
  if (value.category === "utility_bill" && (!value.provider || !(value.amount_due || value.period_charges || value.period_start || value.period_end || value.due_date))) return null;
  // Reject invented quotations and control characters. Quotes support review, not automatic trust.
  const normalized = source.replace(/\s+/g," ").toLowerCase();
  const evidence = value.evidence.map(v=>v.trim()).filter(v=>v.length >= 8 && (attachmentForReview || normalized.includes(v.replace(/\s+/g," ").toLowerCase())));
  if (!evidence.length) return null;
  return { ...value, evidence, issued_on:date(value.issued_on)||null, expires_on:date(value.expires_on)||null,
    period_start:date(value.period_start)||null,period_end:date(value.period_end)||null,due_date:date(value.due_date)||null };
}
export function emailRecordFields(p: EmailProposal) {
  const appleSubscription = p.category === "utility_bill" && p.provider?.trim().toLowerCase() === "apple" && p.service?.trim().toLowerCase() === "subscription";
  return {
    title:p.title ?? "", category:p.category === "warranty" ? "Warranty" : p.category === "receipt" || appleSubscription ? "Receipt" : "Other",
    issued_on:p.category === "warranty" ? "" : date(p.issued_on), expires_on:date(p.expires_on),
    notes:[p.summary,
      appleSubscription && p.period_charges ? `Subscription charge shown in receipt: ${p.period_charges}${p.currency ? " " + p.currency : " (currency not stated)"}. Not an amount still due.` : null,
      p.amount_due ? `Amount due shown in email: ${p.amount_due}${p.currency ? " " + p.currency : " (currency not stated)"}. Not current-period charges or proof of payment.` : null,
      p.due_date ? `Due date shown in email: ${p.due_date}.` : null, "Source: customer-provided email excerpt; reviewed before saving.", ...p.evidence.map(q=>"Email excerpt: " + q),
      p.category === "service_invoice" ? "This email is evidence of the described work, not independent confirmation of completion or payment." : null].filter(Boolean).join("\n"),
  };
}
export const emailAcceptSchema = z.object({
  id:z.string().uuid(), expectedHomeId:z.string().uuid(), reviewed:z.literal(true),
  destination:z.enum(["record","bill"]), record:vaultRecordInput,
  bill:manualBillSchema.optional(),
}).superRefine((v,ctx)=>{
  if(v.record.id)ctx.addIssue({code:"custom",message:"Import as a new record.",path:["record","id"]});
  if(v.destination==="bill" && (!v.bill || v.bill.record_kind!=="historical"))
    ctx.addIssue({code:"custom",message:"Review the billing period and current charges.",path:["bill"]});
});
export function emailBillFields(p: EmailProposal) {
  if(p.category!=="utility_bill" || p.currency!=="CAD")return null;
  const fields = { record_kind:"historical" as const,bill_title:p.title ?? "",category:p.service ?? "",
    provider_name:p.provider ?? "",account_number:p.account ?? "",amount:p.period_charges ?? "",
    billing_period_start:p.period_start ?? "",billing_period_end:p.period_end ?? "",issue_date:p.issued_on ?? "",
    due_date:p.due_date ?? "",notes:"From reviewed email details. Payment status not established." };
  return manualBillSchema.safeParse(fields).success ? fields : null;
}

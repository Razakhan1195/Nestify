import type { StatementBatchItem, StatementFields } from "./statement-batch-core";

export const statementRequiredFields = [
  ["provider_name", "Provider"], ["category", "Service"], ["account_number", "Account"],
  ["billing_period_start", "Period start"], ["billing_period_end", "Period end"], ["amount", "Charges for this period"],
] as const;
export function missingStatementFields(fields: StatementFields) {
  return statementRequiredFields.filter(([key]) => !fields[key].trim());
}
export function statementHasDetails(item: StatementBatchItem) {
  return Boolean(item.fields.provider_name || item.fields.amount || item.fields.billing_period_start);
}
export function statementReadLabel(item: StatementBatchItem) {
  // The persisted flag records the last attempt, not a live background job.
  // This label is used on the idle batch list, never for the active reader.
  if (item.readState === "reading") return "Reading interrupted · retry when ready";
  if (item.readState === "failed") return "Reading needs attention";
  if (item.readState === "complete" || statementHasDetails(item)) return missingStatementFields(item.fields).length ? "Check missing details" : "Ready to review";
  if (item.readAttempted) return "Reading needs attention";
  return "Waiting to read";
}
export function shouldReadStatement(item: StatementBatchItem, options: { enabled: boolean; consent: boolean; hasFile: boolean; busy: boolean; dirty: boolean; sameHome: boolean }) {
  return options.enabled && options.consent && options.hasFile && !options.busy && !options.dirty && options.sameHome
    && item.status === "review" && !item.readAttempted && !statementHasDetails(item);
}

/** Fixed customer messages only: upstream errors can contain document contents. */
export function statementReadFailure(status?:number) {
  const kept=" Your saved drafts are kept.";
  if(status===401)return "Sign in again to read this statement."+kept;
  if(status===403)return "You don't currently have permission to read statements for this household."+kept;
  if(status===413)return "This file is too large. Choose a copy up to 4 MB."+kept;
  if(status===400||status===415||status===422)return "We couldn't open this file. Check that it is an unlocked PDF or supported photo, then choose it again."+kept;
  if(status===429)return "Statement reading has reached its usage limit. Please try again later."+kept;
  if(status===408||status===504)return "Reading took longer than expected. Please try again when you're ready."+kept;
  if(status===502||status===503)return "The statement reading service couldn't complete this request. Please try again later."+kept;
  return "The statement couldn't be uploaded. Check your connection and try again. If the original is no longer on this device, choose it again."+kept;
}

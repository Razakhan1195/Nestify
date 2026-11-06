import { intakeEvidencePayload, type IntakeEvidence } from "../../../apps/mobile/src/lib/statement-intake-evidence";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "../documents";
import type { ManualBillInput } from "./bill-input";
export type BillUploadResult = { ok: true; billId: string } | {
  ok: false; status: number; error: string;
  duplicate?: { billId: string; canAttach: boolean; version: string | null };
};
type Receipt = { status: string; billId?: string; path?: string; fileReady?: boolean; canAttach?: boolean; version?: string };
const pending = (): BillUploadResult => ({ ok: false, status: 503, error: "We couldn’t confirm this save. Retry to check and finish it. Your original will not be uploaded twice." });
export function billUploadOutcome(receipt: Receipt): BillUploadResult | null {
  if (receipt.status === "committed" && receipt.billId) return { ok: true, billId: receipt.billId };
  if (receipt.status === "duplicate" && receipt.billId) return { ok: false, status: 409, error: "This statement is already in your history.", duplicate: { billId: receipt.billId, canAttach: receipt.canAttach === true, version: receipt.version ?? null } };
  if (receipt.status === "conflict") return { ok: false, status: 409, error: "The saved statement changed or another copy was saved. Check History before starting again." };
  if (["deleted", "abandoned"].includes(receipt.status)) return { ok: false, status: 410, error: "This save was removed or expired. Check History before starting again." };
  if (receipt.status === "upload_pending") return { ok: false, status: 428, error: "Choose the original file again to finish this save." };
  return null;
}
function databaseError(code?: string): BillUploadResult {
  if (code === "42501") return { ok: false, status: 403, error: "You no longer have access to save this statement." };
  if (code === "P0002") return { ok: false, status: 404, error: "No unfinished statement save was found. Check History before starting again." };
  if (code === "22023" || code?.startsWith("22")) return { ok: false, status: 409, error: "These details or this file differ from the original save. Check History before starting again." };
  return pending();
}
export function reviewedBillPayload(values: ManualBillInput, evidence?: IntakeEvidence) {
  const supporting = intakeEvidencePayload(evidence);
  return {
    ...(supporting ? { supporting_details: supporting } : {}),
    bill_title: values.bill_title, provider_name: values.provider_name ?? "", category: values.category,
    account_number: values.account_number ?? "", amount: values.amount,
    billing_period_start: values.billing_period_start ?? "", billing_period_end: values.billing_period_end ?? "",
    issue_date: values.issue_date ?? "", due_date: values.due_date, notes: values.notes ?? "",
  };
}
export async function resumeBillUpload(supabase: SupabaseClient, requestId: string): Promise<BillUploadResult> {
  try {
    const result = await supabase.rpc("commit_rezlee_bill_upload", { p_request: requestId });
    if (result.error) return databaseError(result.error.code);
    return result.data ? billUploadOutcome(result.data) ?? pending() : pending();
  } catch { return pending(); }
}
export async function saveBillOriginal(input: {
  supabase: SupabaseClient; userId: string; homeId: string; requestId: string;
  fields: ManualBillInput; evidence?: IntakeEvidence; file: File; existingBillId?: string; expectedVersion?: string;
}): Promise<BillUploadResult> {
  try {
    const bytes = Buffer.from(await input.file.arrayBuffer());
    const result = await input.supabase.rpc("prepare_rezlee_bill_upload", {
      p_home: input.homeId, p_request: input.requestId, p_bill: reviewedBillPayload(input.fields, input.existingBillId ? undefined : input.evidence),
      p_file: { name: input.file.name.slice(0, 250) || "statement", mime: input.file.type, size: input.file.size, sha256: createHash("sha256").update(bytes).digest("hex") },
      p_existing: input.existingBillId ?? null, p_version: input.expectedVersion ?? null,
    });
    if (result.error) return databaseError(result.error.code);
    if (!result.data) return pending();
    const receipt = result.data as Receipt;
    const terminal = billUploadOutcome(receipt); if (terminal) return terminal;
    if (receipt.status !== "prepared" && receipt.status !== "committed") return pending();
    if (!receipt.fileReady && receipt.status === "prepared") {
      if (!receipt.path || !isOwnedDocumentPath(receipt.path, input.userId, input.homeId)) return pending();
      try { await input.supabase.storage.from(DOCUMENT_BUCKET).upload(receipt.path, bytes, { contentType: input.file.type, cacheControl: "0", upsert: false }); }
      catch { /* Commit reconciles an upload that succeeded without a response. */ }
    }
    return resumeBillUpload(input.supabase, input.requestId);
  } catch { return pending(); }
}

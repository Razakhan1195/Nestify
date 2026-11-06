import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "../documents";
import type { vaultRecordInput } from "./vault-input";

type SaveInput = {
 supabase: SupabaseClient; userId: string; homeId: string; requestId: string;
 deduplicateReceipts?: boolean; fields: z.infer<typeof vaultRecordInput>; file: File | null; expectedVersion?: string;
};
type Receipt = { status: string; requestId?: string; id?: string; path?: string | null; fileReady?: boolean; exists?: boolean };
type SaveResult = { ok: true; id: string } | { ok: false; status: number; error: string; duplicateId?: string; recoveryRequestId?: string };
const unavailable = (): SaveResult => ({ ok: false, status: 503, error: "We couldn't confirm the save. Your details are kept here. Tap Retry save to check and finish it." });
function result(receipt: Receipt): SaveResult | null {
 if (receipt.status === "duplicate" && receipt.id) return { ok: false, status: 409, error: "This exact receipt file is already saved. Open that record to review or edit it.", duplicateId: receipt.id };
 if (receipt.status === "duplicate_pending" && receipt.requestId) return { ok: false, status: 409, error: "This original already has an unfinished save. Finish that attempt before making another copy.", recoveryRequestId: receipt.requestId };
 if (receipt.status === "upload_pending") return { ok: false, status: 428, error: "Retry save with the same original file to finish this attempt." };
 if (receipt.status === "committed") return receipt.exists === false
  ? { ok: false, status: 410, error: "That saved record has since been deleted. Return to Vault to review your records." }
  : receipt.id ? { ok: true, id: receipt.id } : unavailable();
 if (receipt.status === "conflict") return { ok: false, status: 409, error: "This record changed elsewhere. Reopen it to review the latest details before saving." };
 if (receipt.status === "abandoned") return { ok: false, status: 410, error: "This save expired before it finished. Return to Vault to review your records before starting again." };
 if (receipt.status === "deleted") return { ok: false, status: 410, error: "That saved record has since been deleted. Return to Vault to review your records." };
 return null;
}
function databaseError(code?: string): SaveResult {
 if (code === "P0002") return { ok: false, status: 404, error: "This record is no longer available. Return to Vault to review your records." };
 if (code === "42501") return { ok: false, status: 403, error: "You no longer have access to save this record." };
 if (code === "22023") return { ok: false, status: 409, error: "The details differ from the previous save attempt. Return to Vault to check what was saved before trying again." };
 return unavailable();
}

export async function saveVaultRecord(input: SaveInput): Promise<SaveResult> {
 const { supabase, userId, homeId, requestId, fields, file, expectedVersion } = input;
 try {
  const fileBytes = file ? Buffer.from(await file.arrayBuffer()) : null;
  const payload = { ...fields, expected_version: expectedVersion ?? null,
   file: file && fileBytes ? { name: file.name.slice(0, 250) || "attachment", size: file.size, mime: file.type, sha256: createHash("sha256").update(fileBytes).digest("hex") } : null };
  const prepared = await supabase.rpc(input.deduplicateReceipts ? "prepare_rezlee_receipt_save" : "prepare_rezlee_vault_save", { p_home: homeId, p_request: requestId, p_payload: payload });
  if (prepared.error) return databaseError(prepared.error.code);
  if (!prepared.data) return unavailable();
  const receipt = prepared.data as Receipt;
  const replay = result(receipt); if (replay) return replay;
  if (receipt.status !== "prepared") return unavailable();
  if (file && !receipt.fileReady) {
   if (!receipt.path || !isOwnedDocumentPath(receipt.path, userId, homeId)) return unavailable();
   // The immutable path belongs to this receipt. Never upsert or delete after an
   // ambiguous response. Commit checks Storage metadata, including a lost upload
   // success response or an upload already completed by a concurrent retry.
   try { await supabase.storage.from(DOCUMENT_BUCKET).upload(receipt.path, fileBytes!, { contentType: file.type, cacheControl: "0", upsert: false }); }
   catch { /* Reconcile through the commit RPC, which verifies the stored path. */ }
  }
  const committed = await supabase.rpc("commit_rezlee_vault_save", { p_request: requestId });
  if (committed.error) return databaseError(committed.error.code);
  return committed.data ? result(committed.data as Receipt) ?? unavailable() : unavailable();
 } catch { return unavailable(); }
}

/** Small, sequential batch. Failed/lost worker responses recover through leases. */
export async function cleanupVaultAttachments(supabase: SupabaseClient) {
 let removed = 0, failed = 0;
 for (let index = 0; index < 5; index++) {
  const lease = randomUUID();
  const claimed = await supabase.rpc("claim_rezlee_vault_cleanup", { p_lease: lease });
  if (claimed.error) throw new Error("Cleanup claim unavailable");
  if (!claimed.data) break;
  const job = claimed.data as { userId: string; homeId: string; requestId: string; path: string };
  let ok = false;
  if (isOwnedDocumentPath(job.path, job.userId, job.homeId)) {
   try { ok = !(await supabase.storage.from(DOCUMENT_BUCKET).remove([job.path])).error; } catch { /* Persist retry below. */ }
  }
  const finished = await supabase.rpc("finish_rezlee_vault_cleanup", { p_user: job.userId, p_request: job.requestId, p_lease: lease, p_ok: ok });
  if (finished.error) throw new Error("Cleanup confirmation unavailable");
  if (ok) removed++; else failed++;
 }
 return { removed, failed };
}

export async function resumeVaultSave(supabase: SupabaseClient, requestId: string): Promise<SaveResult> {
 try {
 const response = await supabase.rpc("commit_rezlee_vault_save", { p_request: requestId });
 if (response.error) return databaseError(response.error.code);
 return response.data ? result(response.data as Receipt) ?? unavailable() : unavailable();
 } catch { return unavailable(); }
}

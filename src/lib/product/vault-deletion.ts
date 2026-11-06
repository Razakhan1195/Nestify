import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "@/lib/documents";

type Context = { supabase: SupabaseClient; userId: string; homeId: string; id: string };
type Result = { ok: true } | { ok: false; status: number; error: string };

// Keep the row until private Storage confirms removal, so a failed file removal
// remains retryable. Storage and Postgres cannot commit atomically: report the
// partial outcome honestly, and compare updated_at to protect concurrent edits.
export async function deleteVaultRecord({ supabase, userId, homeId, id }: Context): Promise<Result> {
  const existing = await supabase.from("documents").select("id,storage_path,updated_at")
    .eq("id", id).eq("user_id", userId).eq("home_id", homeId).maybeSingle();
  if (existing.error) return { ok: false, status: 503, error: "Could not check this record. Please try again." };
  if (!existing.data) return { ok: true }; // Safe replay after a lost success response; reveals no ownership.
  const path = existing.data.storage_path as string | null;
  if (path && !isOwnedDocumentPath(path, userId, homeId)) {
    return { ok: false, status: 409, error: "This attachment needs review before the record can be deleted." };
  }
  if (path) {
    const removed = await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    if (removed.error) return { ok: false, status: 503, error: "The attachment could not be deleted. The record has been kept. Please try again." };
  }
  const removed = await supabase.from("documents").delete()
    .eq("id", id).eq("user_id", userId).eq("home_id", homeId)
    .eq("updated_at", existing.data.updated_at).select("id");
  if (removed.error) return { ok: false, status: 503, error: path
    ? "The attachment was removed, but the record could not be deleted. Please retry deletion."
    : "The record could not be deleted. Please try again." };
  if (!removed.data?.length) {
    const current = await supabase.from("documents").select("id")
      .eq("id", id).eq("user_id", userId).eq("home_id", homeId).maybeSingle();
    if (!current.error && !current.data) return { ok: true };
    return { ok: false, status: 409, error: path
      ? "The attachment was removed, but the record changed during deletion. Reopen it to review before trying again."
      : "The record changed during deletion. Reopen it to review before trying again." };
  }
  return { ok: true };
}

export async function deleteHomeItem({ supabase, userId, homeId, id }: Context): Promise<Result> {
  // RLS plus both ownership predicates keep shared Care membership from granting
  // access to private belongings. Repeated requests remain idempotent.
  const result = await supabase.from("inventory_items").delete()
    .eq("id", id).eq("user_id", userId).eq("home_id", homeId);
  return result.error
    ? { ok: false, status: 503, error: "The home item could not be deleted. Please try again." }
    : { ok: true };
}

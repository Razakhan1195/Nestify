import type { SupabaseClient } from "@supabase/supabase-js";
import { appleConfig, openAppleGrant, type AppleConfig } from "../auth/apple-grants";
import { DeletionProblem } from "./deletion-policy";

export async function revokeAppleToken(token: string, config: AppleConfig, request: typeof fetch = fetch) {
  try {
    const response = await request("https://appleid.apple.com/auth/revoke", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        token, token_type_hint: "refresh_token" }),
    });
    // Apple also returns 200 for an already-revoked token: safe after a worker restart.
    if (response.status === 200) return;
    throw new DeletionProblem(response.status >= 400 && response.status < 429 ? "provider_review" : "provider_unavailable",
      !(response.status >= 400 && response.status < 429));
  } catch (error) {
    if (error instanceof DeletionProblem) throw error;
    throw new DeletionProblem("provider_unavailable");
  }
}
/** Drain retained Apple grants even when new Apple sign-ins have been disabled. */
export async function revokeAppleForDeletion(admin: SupabaseClient, userId: string,
  deps = { config: appleConfig, decrypt: openAppleGrant, revoke: revokeAppleToken }) {
  const found = await admin.from("apple_auth_grants")
    .select("id,user_id,client_id,token_hash,token_cipher").eq("user_id", userId).order("id").limit(1).maybeSingle();
  if (found.error) throw new DeletionProblem("account_unavailable");
  const row = found.data as { id: string; user_id: string; client_id: string; token_hash: string; token_cipher: string } | null;
  // No old token must not prevent account deletion (Apple TN3194). The UI provides manual removal guidance.
  if (!row) return true;
  if (row.user_id !== userId) throw new DeletionProblem("provider_review", false);
  let config: AppleConfig, token: string;
  try {
    config = deps.config();
    if (row.client_id !== config.clientId) throw new Error();
    token = deps.decrypt(row.token_cipher, userId, row.client_id, row.token_hash, config.encryptionKey);
  } catch { throw new DeletionProblem("provider_review", false); }
  await deps.revoke(token, config);
  const removed = await admin.from("apple_auth_grants").delete().eq("id", row.id).eq("user_id", userId);
  if (removed.error) throw new DeletionProblem("account_unavailable");
  return false;
}

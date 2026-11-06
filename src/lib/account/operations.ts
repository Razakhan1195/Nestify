import { createAdminClient } from "@/lib/supabase/admin";

export function accountDeletionEnabled() { return process.env.ACCOUNT_DELETION_ENABLED === "true"; }
export async function withAccountOperation<T>(userId: string, work: () => Promise<T>): Promise<T> {
  // Enable only with the deletion migration; older deployed backends remain compatible.
  if (!accountDeletionEnabled()) return work();
  const admin = createAdminClient();
  const { data: lease, error } = await admin.rpc("start_rezlee_account_operation", { p_user: userId });
  if (error || !lease) throw new Error("This account is unavailable or being deleted.");
  try { return await work(); }
  finally {
    // Failures leave a conservative expiring lease; never hide the original result.
    await admin.from("account_operation_leases").delete().eq("id", lease);
  }
}

export async function rememberDeckProvider(userId: string, providerId: string) {
  if (!accountDeletionEnabled()) return;
  const result = await createAdminClient().rpc("remember_rezlee_deck_provider", { p_user: userId, p_provider: providerId });
  if (result.error) throw new Error("Provider access could not be checked.");
}

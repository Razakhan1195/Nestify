import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeAccess } from "@/lib/household/access";

type ReadContext = { userId: string; homeAccess: HomeAccess | null; homeSnapshot: Record<string, unknown> | null; screenSnapshot?: Record<string, unknown> | null };
// A fresh Supabase client is created for every mobile request. This WeakMap never
// keys by user/token and cannot reuse a membership decision in another request.
const contexts = new WeakMap<SupabaseClient, ReadContext>();
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function rememberMobileReadContext(client: SupabaseClient, userId: string, value: unknown): boolean {
  if (!value || typeof value !== "object" || !("homeAccess" in value) || !("homeSnapshot" in value)) return false;
  const data = value as { homeAccess: unknown; homeSnapshot: unknown; screenSnapshot?: unknown };
  if (data.homeAccess !== null) {
    if (typeof data.homeAccess !== "object") return false;
    const access = data.homeAccess as HomeAccess;
    if (!access.home || !uuid.test(access.home.id) || !uuid.test(access.home.user_id)
      || typeof access.home.nickname !== "string"
      || !["owner", "member"].includes(access.role)
      || (access.role === "owner" && (access.home.user_id !== userId || access.memberId !== null))
      || (access.role === "member" && (access.home.user_id === userId || typeof access.memberId !== "string" || !uuid.test(access.memberId)))) return false;
  }
  if (data.homeSnapshot !== null && (typeof data.homeSnapshot !== "object" || Array.isArray(data.homeSnapshot))) return false;
  const screen = data.screenSnapshot;
  if (screen != null) {
    if (typeof screen !== "object" || Array.isArray(screen)) return false;
    const value = screen as Record<string, unknown>;
    const keys = value.kind === "bills" ? ["bills", "providerActivity", "actions", "reviews", "integrations"]
      : value.kind === "care" ? ["householdProbe", "tasks", "members", "routines", "reminderAdoption", "cleaningAdoption", "maintenanceAdoption"]
      : value.kind === "vault" ? ["documents", "items"]
      : value.kind === "shared-expenses" ? ["people", "balances", "entries"]
      : value.kind === "purchase-decisions" ? ["decisions", "latestQuotes", "linkedQuotes"] : null;
    if (!keys || keys.some(key => !Array.isArray(value[key]))) return false;
    if (value.kind === "vault" && (!value.vaultSummary || typeof value.vaultSummary !== "object" || Array.isArray(value.vaultSummary))) return false;
    if (value.kind === "bills" && (typeof value.uploadCapability !== "boolean" || !Number.isSafeInteger(value.billsCount) || Number(value.billsCount) < 0)) return false;
  }
  contexts.set(client, { userId, homeAccess: data.homeAccess as HomeAccess | null, homeSnapshot: data.homeSnapshot as Record<string, unknown> | null, screenSnapshot: screen as Record<string, unknown> | null | undefined });
  return true;
}
export function mobileReadContext(client: SupabaseClient, userId: string): ReadContext | undefined {
  const context = contexts.get(client);
  return context?.userId === userId ? context : undefined;
}

/** Only reuse the snapshot attached to this request-scoped client and identity. */
export async function mobileSnapshotQuery<T extends { data: unknown; error: unknown }>(
  client: SupabaseClient, userId: string, key: string, fallback: () => PromiseLike<T>,
): Promise<T | { data: T["data"]; error: null; count: number | null; status: number; statusText: string }> {
  const snapshot = mobileReadContext(client, userId)?.screenSnapshot;
  if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, key)) return await fallback();
  return { data: snapshot[key] as T["data"], error: null, count: key === "bills" ? Number(snapshot.billsCount) : null,
    status: 200, statusText: "OK" };
}

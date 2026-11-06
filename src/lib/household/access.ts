import { mobileReadContext } from "@/lib/supabase/mobile-read-context";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeAccess = {
  home: { id: string; nickname: string; user_id: string };
  role: "owner" | "member";
  memberId: string | null;
};

export async function resolveAccessibleHome(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: HomeAccess | null; error: string | null }> {
  const cached = mobileReadContext(supabase, userId);
  if (cached) return { data: cached.homeAccess, error: null };
  const owned = await supabase
    .from("homes")
    .select("id,nickname,user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned.error) return { data: null, error: owned.error.message };
  if (owned.data) {
    return { data: { home: owned.data, role: "owner", memberId: null }, error: null };
  }

  const membership = await supabase
    .from("household_members")
    .select("id,home_id")
    .eq("linked_user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error) return { data: null, error: membership.error.message };
  if (!membership.data) return { data: null, error: null };

  const home = await supabase
    .from("homes")
    .select("id,nickname,user_id")
    .eq("id", membership.data.home_id)
    .maybeSingle();

  if (home.error) return { data: null, error: home.error.message };
  if (!home.data) return { data: null, error: null };

  return {
    data: { home: home.data, role: "member", memberId: membership.data.id },
    error: null,
  };
}

export async function resolveOwnedHome(supabase: SupabaseClient, userId: string): Promise<{ data: HomeAccess["home"] | null; error: string | null }> {
  const cached = mobileReadContext(supabase, userId);
  if (cached) return { data: cached.homeAccess?.role === "owner" ? cached.homeAccess.home : null, error: null };
  const result = await supabase.from("homes").select("id,nickname,user_id").eq("user_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return { data: result.data, error: result.error?.message ?? null };
}

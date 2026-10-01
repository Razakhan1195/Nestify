import "server-only";
import { createClient } from "@/lib/supabase/server";
import { operatorAllowed, operatorVerified } from "./policy";
export async function operatorAccess() {
  if (process.env.REZLEE_OPS_ENABLED !== "true") return { state: "disabled" as const };
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return { state: "signed_out" as const };
    if (!user.email_confirmed_at || !operatorAllowed(user.id)) return { state: "forbidden" as const };
    if (process.env.REZLEE_OPS_REQUIRE_MFA === "true") {
      const claims = await db.auth.getClaims();
      if (claims.error || !operatorVerified(user.id, claims.data?.claims ?? null)) return { state: "mfa" as const };
    }
    return { state: "ready" as const, userId: user.id };
  } catch { return { state: "unavailable" as const }; }
}

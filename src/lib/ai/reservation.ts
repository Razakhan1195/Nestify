import type { SupabaseClient } from "@supabase/supabase-js";
export function statementReadingEnabled(env: Record<string,string|undefined> = process.env) {
  return env.REZLEE_AI_DISABLED !== "true" || env.REZLEE_STATEMENT_READING_ENABLED === "true";
}
/** Hard cap in the database survives deploys and serializes concurrent requests. */
export async function reserveAiRequest(
  supabase: SupabaseClient,
  feature?: "statement-reading",
  allowanceFeature?: "document" | "assistant",
) {
  // Explicit test/release switch also blocks Vercel's credential-free AI Gateway fallback.
  if (process.env.REZLEE_AI_DISABLED === "true" && !(feature === "statement-reading" && statementReadingEnabled())) {
    return { ok: false as const, status: 503, message: "Automatic reading and AI help are temporarily unavailable. You can still add and review records manually." };
  }
  const { data, error } = await supabase.rpc("reserve_rezlee_ai_request_v2");
  if (error)
    return {
      ok: false as const,
      status: 503,
      message:
        "AI tools are temporarily unavailable. Your manual workflows are still available.",
    };
  if (data === "consent_required") return { ok: false as const, status: 428, message: "Before using AI, open Settings → AI privacy and choose whether to share information for AI help." };
  if (data === "unavailable") return { ok: false as const, status: 503, message: "AI tools are temporarily unavailable. Your saved records are safe; please try again later." };
  if (data === "service_limited") return { ok: false as const, status: 429, message: "Rezlee has reached its AI capacity for now. Your saved records are safe. Please try again later." };
  if (data !== "allowed" && data !== "user_limited") return { ok: false as const, status: 503, message: "AI tools are temporarily unavailable. Please try again later." };
  if (data === "user_limited")
    return {
      ok: false as const,
      status: 429,
      message:
        "You have reached the AI usage limit. Try again later; you can still add and update records yourself.",
    };
  if(process.env.REZLEE_MEMBERSHIPS_ENABLED==="true"){
    try{const u=await supabase.auth.getUser();if(u.error||!u.data.user)throw Error();
      const allowance=await (await import("@/lib/membership/server")).reserveMemberFeature(u.data.user.id,allowanceFeature??(feature==="statement-reading"?"document":"assistant"));
      if(allowance.status!=="allowed")return {ok:false as const,status:allowance.status==="upgrade"?402:429,message:allowance.status==="upgrade"?"Your free monthly allowance is used. Continue with Rezlee Pro or add details manually.":"Your monthly AI allowance is used. Your saved records and manual tools remain available."};
      return {ok:true as const,release:allowance.release};
    }catch{return {ok:false as const,status:503,message:"Could not check your allowance. Try again."};}
  }
  return { ok: true as const };
}

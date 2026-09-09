import type { createClient } from "@/lib/supabase/server";
/** Hard cap in the database survives deploys and serializes concurrent requests. */
export async function reserveAiRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase.rpc("reserve_rezlee_ai_request");
  if (error)
    return {
      ok: false as const,
      status: 503,
      message:
        "AI tools are temporarily unavailable. Your manual workflows are still available.",
    };
  if (data !== true)
    return {
      ok: false as const,
      status: 429,
      message:
        "You have reached the AI usage limit. Try again later; you can still add and update records yourself.",
    };
  return { ok: true as const };
}

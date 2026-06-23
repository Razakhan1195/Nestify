import type { User } from "@supabase/supabase-js";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AiGuardResult =
  | { ok: true; user: User; supabase: ServerSupabaseClient }
  | { ok: false; response: Response };

// Shared gate for AI API routes: requires Supabase config, an authenticated
// user, and enforces the per-user rate limit before any model call is made.
export async function guardAiRequest(): Promise<AiGuardResult> {
  if (!hasSupabaseEnv()) {
    return {
      ok: false,
      response: Response.json(
        { error: "Server is not configured for accounts yet." },
        { status: 503 },
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Please sign in to use this." }, { status: 401 }),
    };
  }

  const rate = checkAiRateLimit(user.id);
  if (!rate.allowed) {
    return {
      ok: false,
      response: Response.json(
        { error: "You've reached today's limit for AI actions. Try again tomorrow." },
        { status: 429 },
      ),
    };
  }

  return { ok: true, user, supabase };
}

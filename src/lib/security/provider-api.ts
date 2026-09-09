import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
export async function providerApiAuth() {
  if (!hasSupabaseEnv())
    return {
      user: null,
      response: Response.json(
        {
          ok: false,
          message: "Provider connections are temporarily unavailable.",
        },
        { status: 503 },
      ),
    };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      user: null,
      response: Response.json(
        { ok: false, message: "Sign in to manage your providers." },
        { status: 401 },
      ),
    };
  return { user, response: null };
}

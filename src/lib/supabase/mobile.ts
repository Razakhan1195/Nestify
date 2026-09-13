import {
  createClient as createSupabaseJsClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

export type MobileAuthResult =
  | {
      user: { id: string; email: string | null };
      supabase: SupabaseClient;
      error?: undefined;
    }
  | { user?: undefined; supabase?: undefined; error: { status: number; message: string } };

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() : null;
}

/**
 * Authenticates a mobile request using the Supabase access token the client
 * received at sign-in. The token is validated against Supabase (never
 * trusted blindly), and the returned client is scoped to that user so
 * Postgres RLS applies exactly as it does for the web app - no service role
 * key, no bypassing row security.
 */
export async function authenticateMobileRequest(
  request: Request,
): Promise<MobileAuthResult> {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return {
      error: {
        status: 401,
        message: "Missing bearer token.",
      },
    };
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  const supabase = createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      error: {
        status: 401,
        message: "Invalid or expired session.",
      },
    };
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    supabase,
  };
}

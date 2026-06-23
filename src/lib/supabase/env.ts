const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const missingSupabaseEnvMessage =
  "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// The app runs inside the v0 preview iframe (and any embedded context), which
// is a cross-site frame. Browsers only send cookies in that context when they
// are SameSite=None and Secure, so the Supabase auth cookies must use these
// options or the session is dropped on the next navigation. Preview and
// production are served over HTTPS, so Secure is safe here.
export const supabaseCookieOptions = {
  sameSite: "none",
  secure: true,
} as const;

export function getSupabaseEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(missingSupabaseEnvMessage);
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

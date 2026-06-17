const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const missingSupabaseEnvMessage =
  "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(missingSupabaseEnvMessage);
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

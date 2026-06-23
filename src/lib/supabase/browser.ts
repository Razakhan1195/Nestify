"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv, supabaseCookieOptions } from "@/lib/supabase/env";

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: supabaseCookieOptions,
  });
}

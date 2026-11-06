import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { createPasswordConfirmation } from "./confirm-password-core";
const isolated = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(input, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
  } },
});
export const confirmAccountPassword = createPasswordConfirmation({
  currentUser: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  verify: async (email, password) => {
    const { data, error } = await isolated.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) throw Error("Password not confirmed.");
    return { userId: data.user.id, session: data.session };
  },
  apply: async session => {
    const { error } = await supabase.auth.setSession(session);
    if (error) throw Error("Identity confirmation failed.");
  },
});

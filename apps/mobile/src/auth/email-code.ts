import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { createEmailCodeFlow } from "./email-code-core";
import { notifyVerifiedSignIn } from "./social-auth";
export const emailCodeReady = process.env.EXPO_PUBLIC_EMAIL_CODE_READY === "true";
const isolated = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(input, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
  } },
});
export const emailCode = createEmailCodeFlow({
  send: async email => {
    if (!emailCodeReady) throw Error("Unavailable");
    const { error } = await isolated.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
  },
  verify: async (email, token) => {
    if (!emailCodeReady) throw Error("Unavailable");
    const { data, error } = await isolated.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.session || !data.user) throw Error("Invalid code");
    return { userId: data.user.id, session: data.session };
  },
  currentUser: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  apply: async session => {
    const { data, error } = await supabase.auth.setSession(session);
    if (error || !data.user) throw Error("Session unavailable");
    notifyVerifiedSignIn(data.user.id);
  },
});

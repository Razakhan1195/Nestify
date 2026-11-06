import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { installPkceCrypto } from "./pkce-crypto";
import { createPasswordRecovery, RECOVERY_REDIRECT, type RecoveryRecord } from "./password-recovery";

const SESSION_KEY = "rezlee-password-recovery";
const RECORD_KEY = "rezlee-password-recovery-progress";
let client: SupabaseClient | null = null;

function auth() {
  if (!client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Account recovery unavailable");
    client = createClient(url, key, {
      auth: {
        flowType: "pkce", storageKey: SESSION_KEY, persistSession: true,
        autoRefreshToken: false, detectSessionInUrl: false,
        storage: {
          getItem: key => SecureStore.getItemAsync(key),
          setItem: (key, value) => SecureStore.setItemAsync(key, value),
          removeItem: key => SecureStore.deleteItemAsync(key),
        },
      },
      global: { fetch: async (input, init) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, 15000);
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timer); init?.signal?.removeEventListener("abort", abort); }
      } },
    });
  }
  return client.auth;
}

export const passwordRecovery = createPasswordRecovery({
  auth: {
    request: async email => {
      // Lazy loading keeps older development binaries usable; a missing native
      // module fails this request safely instead of crashing app startup.
      const crypto = await import("expo-crypto");
      installPkceCrypto(globalThis, {
        random: values => crypto.getRandomValues(values),
        sha256: data => crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, data),
      });
      return auth().resetPasswordForEmail(email, { redirectTo: RECOVERY_REDIRECT });
    },
    verifyCode: async (email, token) => { const { data, error } = await auth().verifyOtp({ email, token, type: "recovery" }); return { user: data.user, error }; },
    exchange: async code => { const { data, error } = await auth().exchangeCodeForSession(code); return { user: data.user, error }; },
    user: async () => { const { data, error } = await auth().getUser(); return { user: data.user, error }; },
    update: password => auth().updateUser({ password }),
  },
  read: async () => {
    const saved = await SecureStore.getItemAsync(RECORD_KEY);
    if (!saved) return null;
    try { return JSON.parse(saved) as RecoveryRecord; } catch { return null; }
  },
  write: record => SecureStore.setItemAsync(RECORD_KEY, JSON.stringify(record)),
  clear: async () => {
    // Never touch the normal sign-in client's storage or sign in with this
    // recovery session. Best-effort server sign-out, then mandatory local erasure.
    if (client) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    for (const key of [SESSION_KEY, `${SESSION_KEY}-code-verifier`, `${SESSION_KEY}-user`, RECORD_KEY]) {
      await SecureStore.deleteItemAsync(key);
    }
    client = null;
  },
});

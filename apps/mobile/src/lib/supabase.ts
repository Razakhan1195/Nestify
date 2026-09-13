import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const missingSupabaseEnvMessage =
  "Account access is temporarily unavailable. Please try again shortly.";

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * SecureStore-backed session storage so the Supabase access/refresh tokens
 * never sit in plain AsyncStorage. SecureStore has a ~2KB per-key limit on
 * some Android versions; Supabase sessions are well under that in practice.
 */
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's background token refresh timer does not run while the app is
// backgrounded on iOS/Android. Pause it on background and force a refresh
// check as soon as the app returns to the foreground, matching Supabase's
// documented React Native pattern.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

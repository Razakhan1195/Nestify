import { retainAppleSignIn } from "./apple-grant";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import { supabase } from "@/lib/supabase";
import { readSocialAttempt, socialRedirect, verifiedSocialCode, type SocialAttempt } from "./social-callback";
const attemptKey = "rezlee.social.attempt.v1";
const storageKey = "rezlee.social.pkce.v1";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Expo Go cannot receive our rezlee:// OAuth callback. Keep email sign-in available there.
export const socialBrowserAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && Boolean(requireOptionalNativeModule("ExpoWebBrowser"));
// Explicit release gate: do not expose accounts whose recovery/deletion journey is not verified.
export const socialReleaseReady = process.env.EXPO_PUBLIC_SOCIAL_AUTH_READY === "true";
// Apple also needs its own verified token-revocation and account-deletion lifecycle.
const appleReleaseReady = process.env.EXPO_PUBLIC_APPLE_AUTH_READY === "true";
const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};
function oauthClient() {
  return createClient(url, key, { global: { fetch: async (input, init) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(input, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
  } }, auth: { storage, storageKey, flowType: "pkce", experimental: { appendPkceFlowIdToRedirects: true }, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } });
}
const listeners = new Set<(proof: { userId: string; at: number }) => void>();
export function onSocialSignIn(listener: (proof: { userId: string; at: number }) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function notifyVerifiedSignIn(userId: string) { for (const listener of listeners) listener({ userId, at: Date.now() }); }
let starting = false;
let completing: Promise<void> | null = null;
let cancelling: Promise<void> | null = null;
let attemptGeneration = 0;
class SignInCancelled extends Error {}
function requireCurrentAttempt(generation: number) {
  if (generation !== attemptGeneration) throw new SignInCancelled();
}
async function clearAttempt() {
  await SecureStore.deleteItemAsync(attemptKey);
  const indexKey = storageKey + "-flows-code-verifier";
  const raw = await SecureStore.getItemAsync(indexKey);
  let ids: string[] = [];
  try { const index = JSON.parse(raw ?? "[]"); if (Array.isArray(index)) ids = index.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)); } catch { /* Invalid index contains no trusted keys. */ }
  await Promise.all(ids.map(id => SecureStore.deleteItemAsync(storageKey + "-flow-" + id + "-code-verifier")));
  await SecureStore.deleteItemAsync(indexKey);
  await Promise.all([storageKey, storageKey + "-code-verifier", storageKey + "-user"].map(k => SecureStore.deleteItemAsync(k)));
}
// These build gates represent the verified release capabilities. Discovering the
// server setting is a refresh, not a prerequisite for drawing the login buttons.
export function releasedSocialProviders() {
  const allowed = socialReleaseReady && socialBrowserAvailable;
  return { google: allowed, apple: allowed && appleReleaseReady };
}
export async function socialProviders() {
  if (!socialReleaseReady || !socialBrowserAvailable) return { google: false, apple: false };
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url + "/auth/v1/settings", { headers: { apikey: key }, signal: controller.signal });
    if (!response.ok) throw Error("Unavailable");
    const settings = await response.json();
    return { google: settings.external?.google === true, apple: appleReleaseReady && settings.external?.apple === true };
  } finally { clearTimeout(timer); }
}
export function completeSocialSignIn(callbackUrl: string) {
  if (completing) return completing;
  if (cancelling) return Promise.reject(new Error("Sign-in was cancelled. Please start again."));
  const generation = attemptGeneration;
  completing = (async () => {
    if (!socialReleaseReady || !socialBrowserAvailable) throw Error("Social sign-in is not available yet.");
    const existing = await supabase.auth.getSession();
    requireCurrentAttempt(generation);
    if (existing.data.session) return; // Duplicate callback must not replace an established account.
    const attempt = readSocialAttempt(await SecureStore.getItemAsync(attemptKey));
    const code = verifiedSocialCode(callbackUrl, attempt);
    try {
      requireCurrentAttempt(generation);
      if (attempt?.provider === "apple" && !appleReleaseReady) throw Error("Apple sign-in is not available yet.");
      const client = oauthClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code, { flowId: attempt!.flowId });
      if (error || !data.session) throw Error("Exchange failed");
      requireCurrentAttempt(generation);
      if (attempt?.provider === "apple") await retainAppleSignIn(data.session);
      // The code is single-use and its verifier stays in SecureStore. Do not accept URL bearer tokens.
      const currentAttempt = readSocialAttempt(await SecureStore.getItemAsync(attemptKey));
      if (currentAttempt?.id !== attempt?.id) throw Error("Sign-in cancelled");
      if ((await supabase.auth.getSession()).data.session) throw Error("Account changed");
      requireCurrentAttempt(generation);
      const result = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (result.error) throw Error("Session failed");
      notifyVerifiedSignIn(data.session.user.id);
    } catch { throw Error("We couldn’t finish sign-in. Please start again."); }
    finally { await clearAttempt(); }
  })().finally(() => { completing = null; });
  return completing;
}
export async function startSocialSignIn(provider: "google" | "apple") {
  if (starting || completing || cancelling) throw Error("A sign-in is already in progress.");
  starting = true;
  const generation = attemptGeneration;
  try {
    const providers = await socialProviders();
    requireCurrentAttempt(generation);
    if (!providers[provider]) throw Error("This sign-in option is unavailable. Please use email.");
    if ((await supabase.auth.getSession()).data.session) throw Error("You are already signed in.");
    await clearAttempt();
    requireCurrentAttempt(generation);
    const attempt: SocialAttempt = { version: 1, id: randomUUID(), provider, createdAt: Date.now() };
    await SecureStore.setItemAsync(attemptKey, JSON.stringify(attempt));
    requireCurrentAttempt(generation);
    const client = oauthClient();
    const redirectTo = socialRedirect + "?attempt=" + attempt.id;
    const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true, ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}) } });
    requireCurrentAttempt(generation);
    if (error || !data.url) throw Error("We couldn’t start sign-in. Please try again.");
    const sdkRedirect = new URL(data.url).searchParams.get("redirect_to");
    const flowId = sdkRedirect ? new URL(sdkRedirect).searchParams.get("sb_flow_id") : null;
    if (!flowId) throw Error("We couldn’t start sign-in. Please try again.");
    await SecureStore.setItemAsync(attemptKey, JSON.stringify({ ...attempt, flowId }));
    const browser = await import("expo-web-browser");
    requireCurrentAttempt(generation);
    const result = await browser.openAuthSessionAsync(data.url, socialRedirect);
    requireCurrentAttempt(generation);
    if (result.type === "success") await completeSocialSignIn(result.url);
    else if (completing) await completing;
    else { await clearAttempt(); return { cancelled: true }; }
    return { cancelled: false };
  } catch (error) {
    // Do not expose provider error payloads, redirect URLs or tokens.
    if (!completing) await clearAttempt().catch(() => {});
    if (error instanceof SignInCancelled || generation !== attemptGeneration) return { cancelled: true };
    throw new Error(error instanceof Error && /^(This sign-in option|You are already|We couldn’t)/.test(error.message) ? error.message : "We couldn’t sign you in. Please try again.");
  } finally { starting = false; }
}

export function cancelSocialSignIn() {
  // Invalidate immediately, including starts still waiting for settings or SecureStore.
  attemptGeneration++;
  if (cancelling) return cancelling;
  const pendingCompletion = completing;
  cancelling = (async () => {
    // Let an in-flight exchange settle before clearing its isolated storage.
    await pendingCompletion?.catch(() => {});
    await clearAttempt();
  })().finally(() => { cancelling = null; });
  return cancelling;
}

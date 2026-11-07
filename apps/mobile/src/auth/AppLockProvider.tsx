import { useTheme } from "@/theme/useTheme";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { Redirect } from "expo-router";
import { useAuth } from "./AuthProvider";
import { createAppLock, type LockState } from "./app-lock-core";
import { authenticateBiometric, biometricCapability } from "./biometrics";
import { Button } from "@/components/Button";
import { RezleeLoading } from "@/components/RezleeLoading";
import { supabase } from "@/lib/supabase";
import { spacing, typography } from "@/theme/tokens";
type Context = { screenAccess: boolean; shield: boolean; cover: ReactNode; userId: string | null; state: LockState; label: string; available: boolean; detail: string; change: (enabled: boolean) => Promise<void> };
const LockContext = createContext<Context | null>(null);
export function AppLockProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  const { session, isLoading, recentSignIn } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<LockState>({ userId: null, ready: false, enabled: false, locked: true, busy: false, error: null });
  const [capability, setCapability] = useState({ available: false, label: "Biometric unlock", detail: "Checking device security…" });
  const [appState, setAppState] = useState(AppState.currentState);
  const [openedAccount, setOpenedAccount] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [controller] = useState(() => createAppLock({
    read: id => SecureStore.getItemAsync("rezlee.lock.v1." + id),
    write: (id, value) => SecureStore.setItemAsync("rezlee.lock.v1." + id, value),
    authenticate: authenticateBiometric,
  }, setState));
  const proofIsCurrent = () => recentSignIn?.userId === userId && Date.now() - recentSignIn.at < 5 * 60_000;
  useEffect(() => {
    if (isLoading) return;
    void controller.initialize(userId, recentSignIn?.userId === userId && Date.now() - recentSignIn.at < 5 * 60_000);
  }, [controller, userId, isLoading, recentSignIn]);
  useEffect(() => {
    if (state.ready && !state.locked && state.userId) {
      // Retain mounted screens underneath the privacy modal to preserve unsaved work.
      queueMicrotask(() => setOpenedAccount(state.userId));
    }
  }, [state.ready, state.locked, state.userId]);
  useEffect(() => {
    let active = true;
    const check = () => { void biometricCapability().then(value => { if (active) setCapability(value); }).catch(() => { if (active) setCapability({ available: false, label: "Biometric unlock", detail: "Device authentication is unavailable. You can still sign in with your account." }); }); };
    check();
    const sub = AppState.addEventListener("change", next => {
      setAppState(next);
      if (next === "background") controller.background();
      if (next === "active") check();
    });
    return () => { active = false; sub.remove(); };
  }, [controller]);
  useEffect(() => {
    if (appState === "active" && !isLoading && state.userId === userId) void controller.foreground();
  }, [appState, isLoading, userId, state.userId, state.ready, state.locked, state.busy, controller]);
  const change = async (enabled: boolean) => {
    if (enabled && !capability.available) return;
    await controller.authenticate(enabled ? "enable" : "disable", proofIsCurrent());
  };
  const blocked = isLoading || state.userId !== userId || !state.ready || state.locked;
  const shield = blocked || (Boolean(userId) && state.enabled && appState !== "active" && !state.busy);
  async function signInInstead() {
    if (fallbackBusy || state.busy) return;
    setFallbackBusy(true); setFallbackError(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setFallback(true);
    } catch { setFallbackError("We couldn’t sign you out. Please try again."); }
    finally { setFallbackBusy(false); }
  }
  const lockScreen = <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1, justifyContent: "center", padding: spacing["2xl"], gap: spacing.lg }}>
      <Text style={{ fontSize: 36, fontWeight: "600", color: colors.primary, letterSpacing: -1 }}>rezlee</Text>
      <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Your place is private</Text>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Unlock to return to your household.</Text>
      {state.error || fallbackError ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{fallbackError || state.error}</Text> : null}
      <Button label={capability.label === "Biometric unlock" ? "Unlock Rezlee" : "Unlock with " + capability.label} loading={state.busy} disabled={fallbackBusy || appState !== "active"} onPress={() => void controller.authenticate("unlock")} />
      <Button label="Sign in instead" variant="secondary" loading={fallbackBusy} disabled={state.busy} onPress={() => void signInInstead()} />
    </View>
  </SafeAreaView>;
  const keepMounted = !userId || (!blocked || openedAccount === userId);
  return <LockContext.Provider value={{ state, ...capability, change, screenAccess: keepMounted, shield, cover: userId && !isLoading && state.ready && state.userId === userId ? lockScreen : <RezleeLoading />, userId }}>
    {/* The root navigator must survive auth changes and privacy checks. Individual
        screen content is gated by AppLockScreen through Stack.screenLayout. */}
    {children}
    {fallback && !session ? <Redirect href="/(auth)/login" /> : null}
    {/* Only an already-open, opted-in account needs a native privacy modal.
        Startup and sign-in use each screen's inline cover: presenting/dismissing
        a native modal while the OAuth controller or navigator is transitioning
        can leave iOS intercepting every touch behind an invisible controller. */}
    <Modal visible={Boolean(shield && userId && openedAccount === userId && state.ready && state.userId === userId && state.enabled)} animationType="none" presentationStyle="overFullScreen" onRequestClose={() => {}}>
      {userId && !isLoading && state.ready && state.userId === userId ? lockScreen : <RezleeLoading />}
    </Modal>
  </LockContext.Provider>;
}
export function useAppLock() {
  const context = useContext(LockContext);
  if (!context) throw Error("App lock provider required");
  return context;
}


/** Gate account content without removing Expo Router's root navigator. */
export function AppLockScreen({ children, publicRoute = false }: { children: ReactNode; publicRoute?: boolean }) {
  const { colors } = useTheme();

  const { screenAccess, shield, cover, userId } = useAppLock();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    {/* Public navigators must remain mounted while a session is established.
        Resetting their key or replacing them with a spinner loses the in-flight
        sign-in screen and its native navigation / prevent-remove state. */}
    <View key={publicRoute ? "public-entry" : userId ?? "signed-out"} style={{ flex: 1, opacity: shield ? 0 : 1 }}
      aria-hidden={shield} accessibilityElementsHidden={shield} importantForAccessibility={shield ? "no-hide-descendants" : "auto"}
      pointerEvents={shield ? "none" : "auto"}>{publicRoute || screenAccess ? children : null}</View>
    {shield ? <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background }}>{cover}</View> : null}
  </View>;
}

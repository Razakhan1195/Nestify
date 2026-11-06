import { ConnectionElapsed } from "./ConnectionElapsed";
import {ConnectionBrand} from "./ConnectionBrand";
import {ProviderBrand} from "./ProviderBrand";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { colors, spacing, typography } from "@/theme/tokens";
import { DECK_AUTH_ORIGIN, checkHostedAuth, completeHostedAuth, hostedInitScript, hostedMessage, isDeckAuthUrl, startHostedAuth, type HostedAuthReady, type HostedAuthState } from "@/lib/deck-hosted-auth";

export function DeckHostedAuth({ registryProviderId, providerName, category = "Other service", providerId, accountNumber, historyMonths = 12, onClose, onConnected }: { registryProviderId: string; providerName: string; category?: string; providerId?: string; accountNumber?: string; historyMonths?: number; onClose: (submitted: boolean) => void; onConnected: (providerId: string) => void }) {
  const web = useRef<WebView>(null);
  const alive = useRef(true);
  const submitted = useRef(false);
  const intent = useRef<string | null>(null);
  const initialized = useRef(false);
  const [session, setSession] = useState<HostedAuthReady | null>(null);
  const [phase, setPhase] = useState<"opening" | "sign-in" | "handoff" | "error">("opening");
  const [error, setError] = useState("");
  const notified = useRef(false);
  const connected = useRef(onConnected);
  useEffect(() => { connected.current = onConnected; }, [onConnected]);

  function accept(state: HostedAuthState) {
    if (!alive.current || notified.current) return;
    if (state.providerId && state.status === "completed") { notified.current = true; submitted.current = true; connected.current(state.providerId); }
    else if (["expired", "canceled"].includes(state.status)) { setError("This sign-in has expired. Close it and try again."); setPhase("error"); }
    else { setPhase("handoff"); }
  }
  useEffect(() => {
    alive.current = true;
    startHostedAuth({ registryProviderId, providerId, accountNumber, historyMonths }).then(state => {
      if (!alive.current) return;
      intent.current = state.intentId ?? null;
      if (state.status === "ready" && "token" in state) {
        if (state.origin !== DECK_AUTH_ORIGIN || state.registryProviderId !== registryProviderId) throw Error("Invalid sign-in destination");
        setSession(state); setPhase("sign-in");
      } else accept(state);
    }).catch(() => { if (alive.current) { setError("We couldn’t open secure sign-in. Close this screen and try again."); setPhase("error"); } });
    return () => { alive.current = false; };
  }, [registryProviderId, providerId, accountNumber, historyMonths]);
  useEffect(() => {
    if (phase !== "handoff") return;
    let busy = false;
    const poll = async () => {
      if (busy || !intent.current || AppState.currentState !== "active") return;
      busy = true;
      try { accept(await checkHostedAuth(intent.current)); } catch { if (alive.current) setError("We’re still checking. Reopen this connection to finish any required verification."); }
      finally { busy = false; }
    };
    const timer = setInterval(poll, 3000); void poll();
    const app = AppState.addEventListener("change", state => { if (state === "active") void poll(); });
    return () => { clearInterval(timer); app.remove(); };
  }, [phase]);
  const close = () => {
    if (notified.current) return;
    alive.current = false;
    if (intent.current) void checkHostedAuth(intent.current).catch(() => undefined);
    onClose(submitted.current || phase === "handoff");
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ProviderBrand provider={providerName} category={category} compact/>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.section, { color: colors.foreground }]}>Connect {providerName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Feather name="lock" size={12} color={colors.mutedForeground}/><Text style={[typography.caption, { color: colors.mutedForeground }]}>Hosted by Deck · auth.components.deck.co</Text></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${providerName} sign-in`} onPress={close} hitSlop={8} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}><Feather name="x" size={23} color={colors.foreground}/></Pressable>
      </View>
      {phase === "sign-in" && session ? <>
        <View style={{paddingHorizontal:spacing.lg,paddingTop:spacing.md}}><ConnectionBrand kind="deck" compact/></View>
        <Text style={[typography.meta, { color: colors.mutedForeground, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>Your {providerName} login goes directly to Deck for this connection. Deck signs in to the provider to read your bills. Your password is not sent to Rezlee’s servers.</Text>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs }}>
          <ConnectionElapsed label="Secure sign-in open" />
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>Verification can take a few minutes. Finish any code or approval on this page. Once confirmed, bills can arrive in the background.</Text>
        </View>
        <WebView ref={web} source={{ uri: DECK_AUTH_ORIGIN }} originWhitelist={[DECK_AUTH_ORIGIN]} onShouldStartLoadWithRequest={request => isDeckAuthUrl(request.url)} incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} mixedContentMode="never" allowFileAccess={false} javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false} webviewDebuggingEnabled={false} startInLoadingState renderLoading={() => <ActivityIndicator accessibilityLabel="Opening secure sign-in" color={colors.primary} style={{ position: "absolute", top: 40, alignSelf: "center" }}/>} onError={() => { setError("The secure sign-in page couldn’t load. Close it and try again."); setPhase("error"); }} onHttpError={() => { setError("Secure sign-in is temporarily unavailable. Please try again."); setPhase("error"); }} onMessage={event => {
          const message = hostedMessage(event.nativeEvent.data, event.nativeEvent.url);
          if (!message) return;
          if (message.type === "READY" && !initialized.current) { initialized.current = true; web.current?.injectJavaScript(hostedInitScript(session)); }
          if (message.type === "CLOSE") close();
          if (message.type === "ERROR") { setError("Deck couldn’t finish this sign-in. Please check the details or try again."); }
          if (message.type === "SUCCESS" && message.credentialId && !submitted.current) {
            submitted.current = true; setPhase("handoff"); setSession(null);
            void completeHostedAuth(session.intentId, message.credentialId).then(accept).catch(() => { if (alive.current) setError("Your sign-in was submitted. We’ll keep checking in the background."); });
          }
        }} style={{ flex: 1, backgroundColor: colors.background }}/>
      </> : <View style={{ flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.lg }}>
        {phase !== "error" ? <ActivityIndicator color={colors.primary}/> : <Feather name="wifi-off" size={28} color={colors.mutedForeground}/>}
        <Text style={[typography.heading, { color: colors.foreground }]}>{phase === "opening" ? "Opening secure sign-in" : phase === "handoff" ? "Stay for sign-in and verification" : "Let’s try that again"}</Text>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>{phase === "handoff" ? `We’re checking your ${providerName} connection. Keep the app open until we confirm sign-in and any required verification. Once confirmed, we’ll close this sign-in screen. Allow around 10 minutes for available bills to arrive; some providers take longer.` : phase === "opening" ? "Preparing your private connection with Deck." : error}</Text>
        {phase === "handoff" ? <ConnectionElapsed label="Checking sign-in" /> : null}
        {phase !== "opening" ? <Button label={phase === "handoff" ? "View connection progress" : `Back to ${providerName}`} onPress={close} variant="secondary"/> : null}
      </View>}
      {error && phase !== "error" ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.mutedForeground, padding: spacing.lg }]}>{error}</Text> : null}
    </SafeAreaView>
  </Modal>;
}

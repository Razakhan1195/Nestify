import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, View, Text } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { Button } from "./Button";
import { releasedSocialProviders, socialProviders, startSocialSignIn } from "@/auth/social-auth";
import { colors, spacing, typography } from "@/theme/tokens";

type ProviderState = { status: "loading" | "error" | "ready"; google: boolean; apple: boolean };

export function SocialSignIn({ disabled, onBusy, onError, appearance = "default" }: { disabled: boolean; onBusy: (busy: boolean) => void; onError: (error: string | null) => void; appearance?: "default" | "signup" }) {
  const [providers, setProviders] = useState<ProviderState>(() => ({ status: "loading", ...releasedSocialProviders() }));
  const [lookup, setLookup] = useState(0);
  const signingIn = useRef(false);
  const [activeProvider, setActiveProvider] = useState<"apple" | "google" | null>(null);
  const retrying = useRef(false);

  useEffect(() => {
    let active = true;
    void socialProviders()
      .then(value => { if (active) setProviders({ status: "ready", ...value }); })
      .catch(() => { if (active) setProviders(current => ({ ...current, status: "error" })); })
      .finally(() => { if (active) retrying.current = false; });
    return () => { active = false; };
  }, [lookup]);

  function retry() {
    if (disabled || retrying.current) return;
    retrying.current = true;
    setProviders(current => ({ ...current, status: "loading" }));
    setLookup(value => value + 1);
  }

  async function signIn(provider: "google" | "apple") {
    if (disabled || signingIn.current) return;
    Keyboard.dismiss();
    signingIn.current = true;
    setActiveProvider(provider);
    onBusy(true);
    onError(null);
    try { await startSocialSignIn(provider); }
    catch (error) { onError(error instanceof Error ? error.message : "Sign-in wasn’t completed."); }
    finally { signingIn.current = false; setActiveProvider(null); onBusy(false); }
  }

  const notice = providers.status === "error" ? <View style={{ gap: spacing.xs }}>
    <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.mutedForeground }]}>Couldn’t check sign-in availability. Check your connection and try again.</Text>
    <Button label="Retry connection" variant="secondary" disabled={disabled} onPress={retry} />
  </View> : null;
  if (!providers.google && !providers.apple) return notice;
  if (appearance === "signup") {
    const order: ("apple" | "google")[] = Platform.OS === "ios" ? ["apple", "google"] : ["google", "apple"];
    return <View style={{ gap: 12 }}>{order.filter(provider => providers[provider]).map(provider => {
      const apple = provider === "apple", working = activeProvider === provider;
      const label = `Continue with ${apple ? "Apple" : "Google"}`;
      return <Pressable key={provider} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ disabled, busy: working }} disabled={disabled} onPress={() => void signIn(provider)}
        style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16,
          backgroundColor: apple ? "#202421" : "#FFFFFF", borderWidth: 1, borderColor: apple ? "#202421" : colors.border,
          flexDirection: "row", alignItems: "center", gap: 12, opacity: disabled ? 0.65 : pressed ? 0.85 : 1 })}>
        <FontAwesome name={apple ? "apple" : "google"} size={21} color={apple ? "#FFFFFF" : "#202421"} />
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center", color: apple ? "#FFFFFF" : "#202421" }}>{working ? "Connecting…" : label}</Text>
        {working ? <ActivityIndicator size="small" color={apple ? "#FFFFFF" : colors.primary} /> : <View style={{ width: 21 }} />}
      </Pressable>;
    })}{notice}</View>;
  }
  return <View style={{ gap: spacing.md }}>
    {providers.google ? <Button label="Continue with Google" variant="secondary" disabled={disabled} onPress={() => void signIn("google")} /> : null}
    {providers.apple ? <Button label="Continue with Apple" variant="secondary" disabled={disabled} onPress={() => void signIn("apple")} /> : null}
    {notice}
    <Text style={[typography.meta, { textAlign: "center", color: colors.mutedForeground }]}>Or continue with email</Text>
  </View>;
}

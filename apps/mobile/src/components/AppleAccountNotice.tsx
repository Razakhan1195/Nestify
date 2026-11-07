import { useTheme } from "@/theme/useTheme";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Linking, Text, View } from "react-native";
import { apiGet } from "@/lib/api";
import { QuietAction } from "./Brief";
import { spacing, typography } from "@/theme/tokens";
type AppleStatus = { forwardingDisabled: boolean; authorizationChanged: boolean };
export function AppleAccountNotice({ userId }: { userId: string }) {
  const { colors } = useTheme();

  const [status, setStatus] = useState<AppleStatus | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void apiGet<AppleStatus>("/api/mobile/v1/account/apple-status", { expectedUserId: userId, timeoutMs: 10000 })
      .then(value => { if (active) { setStatus(value); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Retry intentionally repeats the focused status read.
  }, [userId, retry]));
  if (!error && !status?.forwardingDisabled && !status?.authorizationChanged) return null;
  return <View style={{ gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.accent, borderRadius: 16 }}>
    <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>Your Apple sign-in</Text>
    {error ? <>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>We couldn’t check the latest Apple account status.</Text>
      <QuietAction label="Try again" onPress={() => setRetry(value => value + 1)} />
    </> : <>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>{status?.forwardingDisabled
        ? "Apple email forwarding is paused. Rezlee emails and email sign-in codes may not reach you. Turn forwarding back on in your Apple Account."
        : "Apple reported a change to your authorization. You have signed in again, and your saved household is still here."}</Text>
      <QuietAction label="Open Apple Account" onPress={() => { void Linking.openURL("https://account.apple.com/").catch(() => setError(true)); }} />
    </>}
  </View>;
}

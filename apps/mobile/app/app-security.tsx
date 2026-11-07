import { useTheme } from "@/theme/useTheme";
import { RezleeLoading } from "@/components/RezleeLoading";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppLock } from "@/auth/AppLockProvider";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { BriefRow } from "@/components/Brief";
import { ProfileGroup } from "@/components/ProfileUI";
import { Surface } from "@/components/ui/Surface";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { layout, spacing, typography } from "@/theme/tokens";
export default function AppSecurity() {
  const { colors } = useTheme();

  const router = useRouter(), { session, isLoading } = useAuth();
  const { state, label, available, detail, change } = useAppLock();
  const { fontScale } = useWindowDimensions();
  if (isLoading) return <RezleeLoading />;
  if (!session) return <Redirect href="/(auth)/login" />;
  const verified = Boolean(session.user.email_confirmed_at);
  const emailSignIn = session.user.identities?.some(identity => identity.provider === "email");
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Security" fallback="/account" disabled={state.busy} />
    <ScrollView contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: spacing.xl }}>
      <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Your account, protected</Text>
      <View style={{ flexDirection: fontScale > 1.2 ? "column" : "row", gap: spacing.md }}>
        <Surface style={{ flex: 1, gap: spacing.sm }}><Text style={[typography.section, { color: colors.foreground }]}>Email</Text><Text style={[typography.body, { color: colors.primary }]}>{verified ? "Verified" : "Not confirmed"}</Text></Surface>
        <Surface tone={state.enabled ? "accent" : "default"} style={{ flex: 1, gap: spacing.sm }}><Text style={[typography.section, { color: colors.foreground }]}>{label}</Text><Text style={[typography.body, { color: colors.primary }]}>{!state.ready ? "Checking…" : state.enabled ? "On this device" : "Off"}</Text></Surface>
      </View>
      <Text selectable style={[typography.meta, { color: colors.mutedForeground }]}>{session.user.email}</Text>
      <ProfileGroup title="Device unlock">
        <Text style={[typography.body, { color: colors.mutedForeground, paddingVertical: spacing.lg }]}>When enabled, Rezlee asks your device to authenticate automatically when you reopen the app or return from the background. This preference applies to this account on this device.</Text>
        {!available ? <Text style={[typography.body, { color: colors.mutedForeground, paddingBottom: spacing.md }]}>{detail}</Text> : null}
        {available || state.enabled ? <View style={{ paddingBottom: spacing.lg }}><Button label={state.enabled ? "Turn off device unlock" : "Enable " + label} loading={state.busy} disabled={!state.ready || state.busy} onPress={() => void change(!state.enabled)} /></View> : null}
      </ProfileGroup>
      {state.error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{state.error}</Text> : null}
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Your device handles biometric checks; Rezlee does not receive your face or fingerprint data. Device unlock protects access to this app and is separate from account sign-in.</Text>
      {emailSignIn ? <ProfileGroup title="Account recovery"><BriefRow title="Password help" detail="Request a reset link for your Rezlee email" onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: session.user.email ?? "" } })} /></ProfileGroup> : null}
      <BriefRow title="Household sharing" detail="Check which information stays private" onPress={() => router.push("/household/sharing")} />
    </ScrollView>
  </SafeAreaView>;
}

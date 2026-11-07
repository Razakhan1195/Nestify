import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { passwordRecovery } from "@/auth/recovery-client";
import { Button } from "@/components/Button";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { supabase } from "@/lib/supabase";
import { spacing, typography } from "@/theme/tokens";

export default function ResetPasswordScreen() {
  const { colors } = useTheme();

  const router = useRouter(), navigation = useNavigation();
  const recovery = useSyncExternalStore(passwordRecovery.subscribe, passwordRecovery.snapshot, passwordRecovery.snapshot);
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [leaving, setLeaving] = useState(false), [exitError, setExitError] = useState<string | null>(null);
  const [exitReady, setExitReady] = useState(false);
  const [exitNotice, setExitNotice] = useState("check");
  const busy = recovery.phase === "saving" || leaving;
  const editable = recovery.phase === "ready" || recovery.phase === "saving";
  useEffect(() => { void passwordRecovery.resume(); }, []);
  useEffect(() => { if (exitReady) router.replace({ pathname: "/(auth)/login", params: { recovered: exitNotice } }); }, [exitReady, exitNotice, router]);
  usePreventRemove(!exitReady && (busy || (editable && Boolean(password || confirm))), ({ data }) => {
    if (busy) { Alert.alert("Please wait", "Your password change is being checked."); return; }
    Alert.alert("Leave without saving?", "Your new password has not been saved. You can return to this reset while it is still valid.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  async function finish() {
    if (leaving) return;
    setLeaving(true); setExitError(null); setExitNotice(recovery.phase === "success" ? "1" : "check");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) { setExitError("Could not return to sign-in. Check your connection and try again."); return; }
      if (await passwordRecovery.finish()) { setPassword(""); setConfirm(""); setExitReady(true); }
    } catch { setExitError("Could not return to sign-in. Please try again."); }
    finally { setLeaving(false); }
  }
  const success = recovery.phase === "success";
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Password recovery" fallback="/(auth)/login" />
    <View  style={{ flex: 1 }}>
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing["2xl"], gap: spacing.xl }}>
        <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>{success ? "Password updated" : editable ? "Choose a new password" : "Recover your account"}</Text>
        {recovery.phase === "verifying" ? <View style={{ gap: spacing.md }}><ActivityIndicator color={colors.primary} /><Text style={[typography.body, { color: colors.mutedForeground }]}>Checking your reset link…</Text></View> : null}
        {exitError || recovery.error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{exitError ?? recovery.error}</Text> : null}
        {editable ? <>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>This changes the password for {recovery.email}. Use at least 8 characters.</Text>
          <TextField label="New password" autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={128} editable={!busy} value={password} onChangeText={setPassword} />
          <TextField label="Confirm new password" autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={128} editable={!busy} value={confirm} onChangeText={setConfirm} />
          <Button label="Update password" loading={busy} disabled={!password || !confirm} onPress={() => void passwordRecovery.save(password, confirm)} />
        </> : success || recovery.phase === "uncertain" ? <>
          {success ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.mutedForeground }]}>Your new password is saved. Sign in again to return to your household.</Text> : null}
          <Button label="Go to sign in" loading={leaving} onPress={() => void finish()} />
        </> : recovery.phase !== "verifying" ? <>
          {recovery.phase === "unavailable" ? <Button label="Try restoring recovery" onPress={() => void passwordRecovery.resume()} /> : null}
          {!recovery.error ? <Text style={[typography.body, { color: colors.mutedForeground }]}>Open the latest reset link from your email on the phone that requested it, or request a new link.</Text> : null}
          <Button label="Request a new link" variant={recovery.phase === "unavailable" ? "secondary" : "primary"} onPress={() => router.replace({ pathname: "/(auth)/forgot-password", params: { email: recovery.email } })} />
        </> : null}
        {!editable && !success && recovery.phase !== "uncertain" ? <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }} onPress={() => router.replace("/(auth)/login")}><Text style={[typography.body, { color: colors.primary }]}>Back to sign in</Text></Pressable> : null}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

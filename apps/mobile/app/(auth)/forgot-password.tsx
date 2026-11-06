import { safeBack } from "@/lib/navigation";
import { FormScrollView } from "@/components/FormScrollView";
import { useAuth } from "@/auth/AuthProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { passwordRecovery } from "@/auth/recovery-client";
import { Button } from "@/components/Button";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { colors, spacing, typography } from "@/theme/tokens";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const recovery = useSyncExternalStore(passwordRecovery.subscribe, passwordRecovery.snapshot, passwordRecovery.snapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { void passwordRecovery.resume(); }, []);
  useEffect(() => {
    if (recovery.retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recovery.retryAt]);
  const waiting = Math.max(0, Math.ceil((recovery.retryAt - now) / 1000));
  const busy = ["sending", "verifying", "saving"].includes(recovery.phase);
  const codeStep = !editingEmail && Boolean(recovery.email) && ["sent", "verifying"].includes(recovery.phase);
  const resumable = ["ready", "success", "uncertain"].includes(recovery.phase);
  const restore = recovery.phase === "unavailable";
  async function send(address: string) {
    setCode("");
    await passwordRecovery.request(address);
    setNow(Date.now());
    if (passwordRecovery.snapshot().phase === "sent") setEditingEmail(false);
  }
  async function verify() {
    await passwordRecovery.verifyCode(code);
    if (passwordRecovery.snapshot().phase === "ready") {
      setCode("");
      router.replace("/reset-password");
    }
  }
  const changeEmail = () => { setEmail(recovery.email); setCode(""); setEditingEmail(true); };
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Password help" fallback={session ? "/app-security" : "/(auth)/login"} />
    <View  style={{ flex: 1 }}>
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing["2xl"], gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>{codeStep ? "Check your email" : resumable ? "Pick up where you left off" : restore ? "Let’s reconnect" : "A fresh start"}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>{codeStep
            ? `If an account exists for ${recovery.email}, an email with a reset code is on the way.`
            : resumable ? "Your password recovery is saved on this phone. Continue to see your next step."
            : restore ? "Your reset progress is saved on this phone. Restore it before trying again."
            : "Enter the email you use for Rezlee. We’ll help you choose a new password."}</Text>
        </View>
        {recovery.error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{recovery.error}</Text> : null}
        {resumable ? <Button label="Continue password recovery" onPress={() => router.push("/reset-password")} />
          : restore ? <Button label="Restore recovery" onPress={() => void passwordRecovery.resume()} />
          : codeStep ? <View style={{ gap: spacing.lg }}>
            <TextField label="Reset code" value={code} onChangeText={setCode} editable={!busy}
              keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
              autoCorrect={false} autoCapitalize="none" maxLength={20}
              onSubmitEditing={() => void verify()} returnKeyType="done" />
            <Button label="Continue" loading={busy} disabled={!/^\d{6,10}$/.test(code.replace(/\s/g, ""))} onPress={() => void verify()} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Use the code from your latest email within 20 minutes. You can check your email on any device, then enter the code here.</Text>
            <Button variant="secondary" label={waiting ? `Resend code in ${waiting}s` : "Resend code"} disabled={busy || waiting > 0} onPress={() => void send(recovery.email)} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>No email yet? Check your junk folder. A new request replaces the previous code and link.</Text>
            <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={changeEmail} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={[typography.body, { color: colors.primary }]}>Use a different email</Text>
            </Pressable>
          </View> : <View style={{ gap: spacing.lg }}>
            <TextField label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false}
              value={email || (!editingEmail ? recovery.email : "")} editable={!busy}
              onChangeText={value => { setEditingEmail(true); setEmail(value); }} maxLength={254} />
            <Button label={waiting ? `Send reset email in ${waiting}s` : "Send reset email"} loading={busy}
              disabled={!(email || (!editingEmail ? recovery.email : "")).trim() || waiting > 0}
              onPress={() => void send(email || (!editingEmail ? recovery.email : ""))} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>You can leave Rezlee while you check your email. We’ll keep your place.</Text>
            {editingEmail && recovery.phase === "sent" ? <Button variant="secondary" label="Back to code entry" onPress={() => setEditingEmail(false)} /> : null}
          </View>}
        <Pressable accessibilityRole="button" onPress={() => session ? safeBack(router,"/app-security") : router.replace("/(auth)/login")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.body, { color: colors.primary }]}>{session ? "Back to Security" : "Back to sign in"}</Text>
        </Pressable>
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

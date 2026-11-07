import { useTheme } from "@/theme/useTheme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { useAuth } from "@/auth/AuthProvider";
import { validEmail } from "@/auth/email-auth";
import { clearPendingSignup } from "@/auth/pending-signup";
import { emailCodeReady } from "@/auth/email-code";
import { SocialSignIn } from "@/components/SocialSignIn";
import { SignupFrame } from "@/components/SignupFrame";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { spacing, typography } from "@/theme/tokens";

export default function LoginScreen() {
  const { colors } = useTheme();

  const { session, signIn, resendConfirmation } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; joined?: string; household?: string; recovered?: string; sessionChanged?: string }>();
  const locked = useRef(false);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [emailForm, setEmailForm] = useState(Boolean(params.email || params.recovered));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  usePreventRemove(busy, () => { /* Wait for the authentication result. */ });
  useEffect(() => {
    if (session && !busy) { void clearPendingSignup().catch(() => {}); router.replace("/"); }
  }, [session, busy, router]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => { const current = Date.now(); setNow(current); if (current >= retryAt) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const waiting = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function submit() {
    if (busy || locked.current) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null); setNeedsConfirmation(false);
    try {
      const result = await signIn(email, password);
      if (result.error) { setError(result.error); setNeedsConfirmation(Boolean(result.confirmationRequired)); return; }
      setPassword("");
    } finally { locked.current = false; setBusy(false); }
  }
  async function resend() {
    if (busy || locked.current || waiting) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    setNow(Date.now()); setRetryAt(Date.now() + 60_000);
    try {
      const result = await resendConfirmation(email);
      if (result.error) setError(result.error);
      else setNotice("If this address is awaiting confirmation, an email is on its way. Follow its link, then return to sign in.");
    } finally { locked.current = false; setBusy(false); }
  }
  return <SignupFrame stage={emailForm ? "email" : "choose"} onBack={() => { if (emailForm) { setEmailForm(false); setError(null); } else { if (router.canGoBack()) router.back(); else router.replace("/(auth)/welcome"); } }} title={params.joined === "1" ? "Open your household" : "Welcome back"}
    detail={params.joined === "1" ? `Sign in to check access to ${typeof params.household === "string" ? params.household : "your shared household"}.` : "Your bills, records and home reminders, together."} busy={busy}>
    {params.joined === "1" ? <Text style={[typography.body, { color: colors.successForeground }]}>Your household access will be checked after sign-in.</Text> : null}
    {params.recovered ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.mutedForeground }]}>{params.recovered === "1" ? "Your password is updated. Sign in with your new password." : "Try your new password. If it is not accepted, request a new reset link."}</Text> : null}
{params.sessionChanged === "1" ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.mutedForeground }]}>Your account sign-in changed. Sign in again to safely return to your household.</Text> : null}
{!emailForm ? <>
    <View style={{ gap: 6 }}><Text style={[typography.section, { color: colors.foreground }]}>Sign in to your account</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>Pick up where you left off.</Text></View>
    <SocialSignIn appearance="signup" disabled={busy} onBusy={value => { locked.current = value; setBusy(value); }} onError={setError} />
    <Button label="Continue with email" variant="secondary" disabled={busy} onPress={() => setEmailForm(true)} />
    </> : <>
    <View style={{ gap: spacing.lg }}>
      <TextField label="Email" value={email} editable={!busy} onChangeText={value => { setEmail(value); setNeedsConfirmation(false); setNotice(null); }} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" maxLength={254} />
      <View style={{ gap: spacing.xs }}>
        <TextField label="Password" value={password} editable={!busy} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" secureTextEntry={!showPassword} returnKeyType="go" onSubmitEditing={() => void submit()} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm }}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: email.trim() } })} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Forgot password?</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setShowPassword(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>{showPassword ? "Hide password" : "Show password"}</Text></Pressable>
        </View>
      </View>
    </View>
    </>}
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.mutedForeground }]}>{notice}</Text> : null}
    {emailCodeReady ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.push("/(auth)/email-code")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Can’t use your usual sign-in? Use an email code</Text></Pressable> : null}
    {emailForm ? <Button label="Sign in" loading={busy} disabled={!validEmail(email) || !password} onPress={() => void submit()} /> : null}
    {needsConfirmation ? <Button label={waiting ? `Send another email in ${waiting}s` : "Resend confirmation email"} variant="secondary" disabled={busy || waiting > 0} onPress={() => void resend()} /> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace("/(auth)/signup")} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={[typography.body, { color: colors.primary }]}>New to Rezlee? Create an account</Text></Pressable>
  </SignupFrame>;
}

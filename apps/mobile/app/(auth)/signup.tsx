import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { useAuth } from "@/auth/AuthProvider";
import { validEmail } from "@/auth/email-auth";
import { clearPendingSignup, readPendingSignup, rememberPendingSignup } from "@/auth/pending-signup";
import { Feather } from "@expo/vector-icons";
import { SignupFrame } from "@/components/SignupFrame";
import { SocialSignIn } from "@/components/SocialSignIn";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { colors, typography } from "@/theme/tokens";

export default function SignupScreen() {
  const { session, signUp, resendConfirmation } = useAuth();
  const router = useRouter();
  const locked = useRef(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [emailForm, setEmailForm] = useState(false);
  const [addName, setAddName] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  usePreventRemove(busy, () => { /* Keep the request's confirmation visible. */ });
  useEffect(() => {
    let active = true;
    void readPendingSignup().then(value => { if (active && value) { setEmail(value); setPending(true); } })
      .catch(() => { /* Keep the form usable when local storage is unavailable. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
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
    if (busy || locked.current || checking) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await signUp(email, password, name);
      if (result.error) { setError(result.error); return; }
      setPassword("");
      if (result.confirmationRequired) {
        setEmail(email.trim()); setPending(true); setNow(Date.now()); setRetryAt(Date.now() + 60_000);
        await rememberPendingSignup(email).catch(() => { setNotice("If you close the app, return to Sign in after confirming your email."); });
      }
    } catch { setError("We couldn’t finish that request. Check your connection and try again."); } finally { locked.current = false; setBusy(false); }
  }
  async function resend() {
    if (busy || locked.current || waiting) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    setNow(Date.now()); setRetryAt(Date.now() + 60_000);
    try {
      const result = await resendConfirmation(email);
      if (result.error) setError(result.error);
      else setNotice("If this address is awaiting confirmation, another email is on its way. Check your junk folder too.");
    } catch { setError("We couldn’t finish that request. Check your connection and try again."); } finally { locked.current = false; setBusy(false); }
  }
  async function changeEmail() {
    if (busy || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      await clearPendingSignup().catch(() => {});
      setPending(false); setEmailForm(true); setPassword(""); setError(null); setNotice(null);
    } catch { setError("We couldn’t finish that request. Check your connection and try again."); } finally { locked.current = false; setBusy(false); }
  }
  const stage = pending ? "confirm" : emailForm ? "email" : "choose";
  const feedback = <>
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.mutedForeground }]}>{notice}</Text> : null}
  </>;
  function goBack() {
    if (busy || locked.current) return;
    if (emailForm && !pending) { setEmailForm(false); setError(null); return; }
    router.canGoBack() ? router.back() : router.replace("/(auth)/welcome");
  }
  return <SignupFrame stage={stage} busy={busy} onBack={goBack}
    title={pending ? "Check your inbox." : emailForm ? "Make yourself at home." : "Life at home,\na little lighter."}
    detail={pending ? "Follow the confirmation link, then come back to sign in." : emailForm ? "Just your email and a password to get started." : "One place for your bills, records and the everyday things you share."}>
    {checking ? <ActivityIndicator accessibilityLabel="Checking saved signup" color={colors.primary} /> : pending ? <>
      <View style={{ padding: 20, borderRadius: 20, backgroundColor: colors.surfaceSubtle, gap: 10 }}>
        <Feather name="mail" size={24} color={colors.primary} />
        <Text selectable style={[typography.section, { color: colors.foreground }]}>{email}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>If this address needs confirmation, an email is on its way. Check your junk folder too. Already registered? You can sign in with your existing password.</Text>
      </View>
      {feedback}
      <Button label="Continue to sign in" disabled={busy} onPress={() => router.replace({ pathname: "/(auth)/login", params: { email } })} />
      <Button label={waiting ? `Send another email in ${waiting}s` : "Send another confirmation"} variant="secondary" loading={busy} disabled={waiting > 0} onPress={() => void resend()} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void changeEmail()} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Use a different email</Text></Pressable>
    </> : !emailForm ? <>
      <View style={{ gap: 6 }}>
        <Text style={[typography.section, { color: colors.foreground }]}>Create your account</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Free to start. No card required.</Text>
      </View>
      <SocialSignIn appearance="signup" disabled={busy} onBusy={value => { locked.current = value; setBusy(value); }} onError={setError} />
      <Button label="Continue with email" variant="secondary" disabled={busy} onPress={() => { if (!locked.current) { setEmailForm(true); setError(null); } }} />
      {feedback}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace("/(auth)/login")} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Already with Rezlee? <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text></Text>
      </Pressable>
    </> : <>
      <TextField label="Email address" value={email} editable={!busy} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} />
      <View style={{ gap: 8 }}>
        <TextField label="Password" value={password} editable={!busy} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} secureTextEntry={!showPassword} returnKeyType="go" onSubmitEditing={() => void submit()} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name={password.length >= 10 ? "check-circle" : "circle"} size={14} color={password.length >= 10 ? colors.primary : colors.mutedForeground} />
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>At least 10 characters</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} disabled={busy} onPress={() => setShowPassword(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>{showPassword ? "Hide" : "Show"}</Text></Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: addName }} disabled={busy} onPress={() => setAddName(value => !value)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name={addName ? "minus" : "plus"} size={16} color={colors.primary} />
        <Text style={[typography.meta, { color: colors.primary }]}>Add your preferred name (optional)</Text>
      </Pressable>
      {addName ? <TextField label="Preferred name" value={name} editable={!busy} onChangeText={setName} autoComplete="given-name" autoCapitalize="words" maxLength={80} /> : null}
      {feedback}
      <Button label="Create my account" loading={busy} disabled={!validEmail(email) || password.length < 10} onPress={() => void submit()} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace({ pathname: "/(auth)/login", params: { email: email.trim() } })} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Already have an account? Sign in</Text></Pressable>
    </>}
  </SignupFrame>;
}

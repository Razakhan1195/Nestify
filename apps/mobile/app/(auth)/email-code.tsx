import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Text } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { AuthFrame } from "@/components/AuthFrame";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { emailCode, emailCodeReady } from "@/auth/email-code";
import { colors, typography } from "@/theme/tokens";
export default function EmailCode() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (verified && !busy) router.replace("/"); }, [verified, busy, router]);
  usePreventRemove(busy, () => Alert.alert("Confirming sign-in", "Please wait for this step to finish."));
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wait = Math.max(0, Math.ceil((emailCode.retryAt() - now) / 1000));
  async function send() {
    if (busy) return; setBusy(true); setError(null);
    try { await emailCode.request(email); setSent(true); setCode(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); setNow(Date.now()); }
  }
  async function verify() {
    if (busy) return; setBusy(true); setError(null);
    try { await emailCode.verify(email, code); setCode(""); setVerified(true); }
    catch (e) { setCode(""); setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Sign in with an email code" detail="Use the email already linked to your Rezlee account. This does not create a new account." busy={busy}>
    {!emailCodeReady ? <Text style={[typography.body, { color: colors.mutedForeground }]}>Email-code sign-in is not available in this build. Return to sign in with your existing method.</Text> : <>
      <TextField label="Account email" value={email} editable={!busy && !sent} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} />
      {sent ? <>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>If this email belongs to an account, a code has been requested. Check your inbox and junk folder. For Apple Hide My Email, use the relay address linked to Rezlee and make sure forwarding is on.</Text>
        <TextField label="Email code" value={code} onChangeText={setCode} editable={!busy} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={8} />
        <Button label="Confirm code and sign in" loading={busy} disabled={!/^\d{6,8}$/.test(code)} onPress={() => void verify()} />
        <Button label="Use a different email" variant="secondary" disabled={busy} onPress={() => { setSent(false); setCode(""); setError(null); }} />
      </> : null}
      <Button label={wait ? `Send another code in ${wait}s` : sent ? "Send another code" : "Send code"} variant={sent ? "secondary" : "primary"} disabled={busy || wait > 0 || !email.trim()} onPress={() => void send()} />
    </>}
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
  </AuthFrame>;
}

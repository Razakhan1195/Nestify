import { useTheme } from "@/theme/useTheme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { QuietAction } from "@/components/Brief";
import { checkPhoneInvitation, saveIncomingPhoneInvite, readIncomingPhoneInvite, clearIncomingPhoneInvite, type PhoneInvitationState } from "@/lib/phone-invites";
import { typography } from "@/theme/tokens";
export default function JoinHousehold() {
  const { session } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <JoinInvitation key={(session?.user.id ?? "signed-out") + ":" + (token ?? "saved")} />;
}
function JoinInvitation() {
  const { colors } = useTheme();

  const { token: parameter } = useLocalSearchParams<{ token?: string }>();
  const { session } = useAuth(), router = useRouter();
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [token, setToken] = useState<string | null>(null), [state, setState] = useState<PhoneInvitationState | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; void (async () => {
    try { if (parameter) await saveIncomingPhoneInvite(parameter); const next = await readIncomingPhoneInvite(); if (active) setToken(next); }
    catch { if (active) setError("This invitation could not be opened."); }
    finally { if (active) setBusy(false); }
  })(); return () => { active = false; }; }, [parameter]);
  async function check(confirm = false) {
    if (!token || busy || lock.current || !session) return;
    lock.current = true;
    setBusy(true); setError(null);
    try { const next = await checkPhoneInvitation(token, confirm, session.user.id); if (mounted.current) setState(next); } catch { if (mounted.current) setError("Couldn’t check this invitation. Try again."); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { if (!token || !session) return; let active = true;
    void checkPhoneInvitation(token, false, session.user.id).then(value => { if (active) setState(value); }).catch(() => { if (active) setError("Couldn’t check this invitation. Try again."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token, session]);
  async function leave() { await clearIncomingPhoneInvite(); router.replace("/"); }
  const message = state?.state === "awaiting_approval" ? "Your request is saved. The household owner will confirm your account before you can see shared expenses and Care."
    : state?.state === "accepted" ? "You’ve joined the household. Shared expenses and Care are ready."
    : state?.state === "expired" ? "This invitation expired. Ask the household owner for a new one."
    : state?.state === "other_household" ? "You already belong to a household. This invitation won’t move your data or switch your household."
    : state?.state === "own_household" ? "This is your own household’s invitation. Send it to the person you want to invite."
    : state?.state === "unavailable" ? "This invitation is no longer available. Ask the owner to send a fresh one."
    : "Join to see shared expenses and Care, including existing shared history. Private bills and Vault records stay private.";
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}><ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>{state?.homeName ? "Join " + state.homeName : "Household invitation"}</Text>
    <Text style={[typography.body, { color: colors.mutedForeground }]}>{message}</Text>
    {busy ? <ActivityIndicator color={colors.primary} /> : null}
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
    {!session && token ? <><Button label="Sign in to continue" onPress={() => router.push("/(auth)/login")} /><Button label="Create an account" variant="secondary" onPress={() => router.push("/(auth)/signup")} /></> : null}
    {session && state?.state === "pending" ? <Button label="Request to join" disabled={busy} onPress={() => void check(true)} /> : null}
    {session && token && (error || state?.state === "awaiting_approval") ? <Button label="Check request status" disabled={busy} onPress={() => void check()} /> : null}
    <QuietAction label={state?.state === "accepted" ? "Open my household" : "Leave invitation"} onPress={() => void leave().catch(() => setError("Couldn’t close the saved invitation. Try again."))} />
  </ScrollView></SafeAreaView>;
}

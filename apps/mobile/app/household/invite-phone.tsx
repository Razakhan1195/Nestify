import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { QuietAction } from "@/components/Brief";
import { createPhoneInvitation, pendingPhoneInvitation, normalizeInvitePhone, openPhoneInvitation, type PhoneInviteInput } from "@/lib/phone-invites";
import { typography } from "@/theme/tokens";
export default function InviteByPhone() {
  const { session } = useAuth();
  return <InviteForm key={session?.user.id ?? "signed-out"} ownerId={session?.user.id} />;
}
function InviteForm({ ownerId }: { ownerId?: string }) {
  const { colors } = useTheme();

  const params = useLocalSearchParams<{ name?: string; personId?: string }>(), router = useRouter();
  const [name, setName] = useState(params.name ?? ""), [phone, setPhone] = useState("");
  const [member, setMember] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [opened, setOpened] = useState(false);
  const [pending, setPending] = useState<PhoneInviteInput | null>(null);
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true), [attempt, setAttempt] = useState(0);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!ownerId) throw Error("Sign in before inviting someone.");
        const saved = await pendingPhoneInvitation(ownerId);
        if (!active) return;
        setPending(saved);
        if (saved) { setName(saved.displayName); setPhone(saved.phone); }
        setReady(true);
      } catch { if (active) { setReady(false); setError("Couldn’t check unfinished invitations. Try checking again before preparing another."); } }
      finally { if (active) setChecking(false); }
    })();
    return () => { active = false; };
  }, [ownerId, attempt]);
  async function prepare() {
    const number = normalizeInvitePhone(phone);
    if (lock.current || !ready || checking || !ownerId || !number || !name.trim()) return;
    lock.current = true; setBusy(true); setError(null);
    const input = pending ?? { displayName: name.trim(), phone: number, ...(params.personId ? { expensePersonId: params.personId } : {}) };
    setPending(input);
    try {
      const result = await createPhoneInvitation(input, ownerId);
      if (mounted.current) setMember(result.memberId);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Couldn’t prepare this invitation. Retry with the same details.");
      try { const saved = await pendingPhoneInvitation(ownerId); if (mounted.current) setPending(saved); }
      catch { if (mounted.current) setReady(false); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function send() { if (!member || lock.current) return; lock.current = true; setError(null); try { await openPhoneInvitation(member); if (mounted.current) setOpened(true); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Couldn’t open Messages."); } finally { lock.current = false; } }
  const editable = ready && !checking && !busy && !pending;
  return <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScreenNavigation title="Invite by phone" fallback="/household" />
    <View  style={{ flex: 1 }}><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20 }}>
      <Text style={[typography.heading, { color: colors.foreground }]}>{member ? "Your invitation is ready" : "Invite them to your household"}</Text>
      {member ? <>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>{opened ? "Messages was opened. Rezlee cannot confirm whether you sent the text. " : "Choose Open Messages to review and send the invitation yourself. "}The link expires seven days after it was first prepared.</Text>
        <Button label="Open Messages" onPress={() => void send()} />
        <QuietAction label="View People and invitations" onPress={() => router.replace("/household")} />
      </> : <>
        <TextField label="Name" value={name} onChangeText={setName} editable={editable && !params.personId} maxLength={80} />
        <TextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(416) 555-0123" editable={editable} maxLength={24} />
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Canadian numbers can be entered without +1. For other countries, include the country code.</Text>
        {pending ? <Text style={[typography.body, { color: colors.mutedForeground }]}>An invitation is unfinished. Check it with the same details to recover its link.</Text> : null}
        {!ready ? <Button label={checking ? "Checking unfinished invitations" : "Check unfinished invitations"} loading={checking} onPress={() => { setChecking(true); setError(null); setAttempt(value => value + 1); }} /> : <Button label={pending ? "Check unfinished invitation" : "Prepare invitation"} disabled={checking || !name.trim() || !normalizeInvitePhone(phone)} loading={busy} onPress={() => void prepare()} />}
        <QuietAction label="View People and invitations" onPress={() => router.replace("/household")} />
        <QuietAction label="Invite by email instead" onPress={() => router.replace("/household/add")} />
      </>}
      <Text style={[typography.body, { color: colors.mutedForeground }]}>They sign in and request to join. You’ll confirm their account in People before access is granted. Shared expenses and Care are shared; private bills and Vault documents stay private.</Text>
      {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
    </FormScrollView></View>
  </SafeAreaView>;
}

import { RezleeLoading } from "@/components/RezleeLoading";
import { FormScrollView } from "@/components/FormScrollView";
import { Redirect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchHousehold } from "@/lib/household-data";
import { renameHousehold } from "@/lib/household-profile";
import { nameInitials } from "@/lib/profile-identity";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { QuietAction } from "@/components/Brief";
import { colors, layout, spacing, typography } from "@/theme/tokens";
export default function HouseholdDetails() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <RezleeLoading />;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <DetailsForm key={session.user.id} userId={session.user.id} />;
}
function DetailsForm({ userId }: { userId: string }) {
  const navigation = useNavigation(), lock = useRef(false);
  const [home, setHome] = useState<{ id: string; nickname: string; owner: boolean } | null>(null);
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchHousehold().then(p => {
      if (!active) return;
      if ("needsOnboarding" in p || !p.available) { setError("Set up your household before editing its name."); return; }
      setHome({ ...p.home, owner: p.accessRole === "owner" }); setName(p.home.nickname); setError(null);
    }).catch(() => { if (active) setError("Couldn’t load household details. Try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const dirty = Boolean(home?.owner && name !== home.nickname);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (busy) { Alert.alert("Saving household name", "Please wait for the save to finish."); return; }
    Alert.alert("Discard name change?", "Your saved household name will remain.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) }]);
  });
  async function save() {
    if (!home?.owner || lock.current) return;
    lock.current = true; setBusy(true); setError(null); setSaved(false);
    try { const nickname = await renameHousehold(home.id, home.nickname, name, userId); setHome({ ...home, nickname }); setName(nickname); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save the name."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Household details" fallback="/household" disabled={busy} />
    <View style={{ flex: 1 }} >
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: spacing.xl }}>
        {loading ? <ActivityIndicator accessibilityLabel="Loading household" /> : null}
        {home ? <>
          <View style={{ padding: 28, gap: spacing.md, borderRadius: 24, backgroundColor: colors.surfaceSubtle, alignItems: "center" }}>
            <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.primaryForeground, fontSize: 24, fontWeight: "600" }}>{nameInitials(name)}</Text></View>
            <Text style={[typography.section, { color: colors.foreground, textAlign: "center" }]}>{name.trim() || "Your household"}</Text>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>Name preview</Text>
          </View>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Use a name everyone recognizes. It appears in Rezlee and on new household invitations.</Text>
          <TextField label="Household name" value={name} onChangeText={v => { setName(v); setSaved(false); }} editable={home.owner && !busy} maxLength={80} />
          {home.owner ? <Button label="Save household name" loading={busy} disabled={!dirty || !name.trim() || busy} onPress={() => void save()} /> : <Text style={[typography.body, { color: colors.mutedForeground }]}>Only the household owner can change this name.</Text>}
        </> : null}
        {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
        {!home && !loading ? <QuietAction label="Try again" onPress={() => { setLoading(true); setRetry(v => v + 1); }} /> : null}
        {saved ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.primary }]}>Household name saved.</Text> : null}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

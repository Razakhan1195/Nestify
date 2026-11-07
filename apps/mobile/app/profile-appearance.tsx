import { useTheme } from "@/theme/useTheme";
import { RezleeLoading } from "@/components/RezleeLoading";
import { FormScrollView } from "@/components/FormScrollView";
import { Redirect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { badgeColours, badgeMetadata, profileBadge } from "@/lib/profile-identity";
import { ProfileBadge } from "@/components/ProfileUI";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { layout, spacing, typography } from "@/theme/tokens";
export default function Appearance() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <RezleeLoading />;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <AppearanceForm key={session.user.id} />;
}
function AppearanceForm() {
  const { colors } = useTheme();

  const { session } = useAuth(), navigation = useNavigation();
  const initial = profileBadge(session?.user.user_metadata);
  const [baseline, setBaseline] = useState({ initials: initial.initials, colour: initial.colour.id });
  const [initials, setInitials] = useState(initial.initials), [colour, setColour] = useState<string>(initial.colour.id);
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const dirty = initials !== baseline.initials || colour !== baseline.colour;
  usePreventRemove(dirty || busy, ({ data }) => {
    if (busy) { Alert.alert("Saving your badge", "Please wait for the save to finish."); return; }
    Alert.alert("Discard badge changes?", "Your saved badge will remain.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) }]);
  });
  async function save() {
    if (lock.current || !session) return;
    lock.current = true; setBusy(true); setError(null); setSaved(false);
    try {
      const values = badgeMetadata(initials, colour);
      const { data: current } = await supabase.auth.getSession();
      if (current.session?.user.id !== session.user.id) throw new Error("Account changed. Reopen your profile.");
      const { data, error: failure } = await supabase.auth.updateUser({ data: values });
      if (failure || !data.user) throw new Error("Couldn’t confirm the save. Your choices remain here; try again.");
      const badge = profileBadge(data.user.user_metadata);
      setInitials(badge.initials); setColour(badge.colour.id); setBaseline({ initials: badge.initials, colour: badge.colour.id }); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save your badge."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Your badge" fallback="/account" disabled={busy} />
    <View style={{ flex: 1 }} >
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: spacing.xl }}>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>A small personal touch for your profile and navigation. This changes your badge, not anyone else’s.</Text>
        <View style={{ padding: 32, borderRadius: 24, backgroundColor: colors.surfaceSubtle, alignItems: "center", gap: spacing.md }}>
          <ProfileBadge size={88} metadata={{ rezlee_badge: { initials, colour } }} />
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>Preview</Text>
        </View>
        <TextField label="Your initials" value={initials} onChangeText={v => { setInitials(v); setSaved(false); }} maxLength={4} editable={!busy} autoCapitalize="characters" autoCorrect={false} />
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Choose one or two letters or numbers.</Text>
        <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>Choose a colour</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {badgeColours.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: colour === item.id, disabled: busy }} disabled={busy} onPress={() => { setColour(item.id); setSaved(false); }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: item.background, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colour === item.id ? colors.foreground : colors.background }}><Text style={{ color: item.foreground, fontSize: 24 }}>{colour === item.id ? "✓" : ""}</Text></Pressable>)}
        </View>
        {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
        {saved ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.primary }]}>Badge saved.</Text> : null}
        <Button label="Save badge" disabled={!dirty || busy} loading={busy} onPress={() => void save()} />
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

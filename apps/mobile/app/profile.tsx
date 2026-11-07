import { useTheme } from "@/theme/useTheme";
import { RezleeLoading } from "@/components/RezleeLoading";
import { FormScrollView } from "@/components/FormScrollView";
import { useRef, useState } from "react";
import { Redirect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { AccessibilityInfo, Alert, Keyboard, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { profileName } from "@/lib/profile-identity";
import { ProfileBadge } from "@/components/ProfileUI";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { SettingsRow, SettingsSection } from "@/components/SettingsUI";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { typography } from "@/theme/tokens";
export default function ProfileScreen() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <RezleeLoading />;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <ProfileForm key={session.user.id} userId={session.user.id} />;
}
function ProfileForm({ userId }: { userId: string }) {
  const { colors } = useTheme();

  const { session } = useAuth(), router = useRouter(), navigation = useNavigation();
  const [baseline, setBaseline] = useState(profileName(session?.user.user_metadata)), [name, setName] = useState(baseline), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const lock = useRef(false), dirty = name !== baseline;
  usePreventRemove(dirty || busy, ({ data }) => { if (busy) { Alert.alert("Saving your profile", "Please wait for the save to finish."); return; } Alert.alert("Discard profile changes?", "Your saved profile will remain.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) }]); });
  async function save() {
    if (lock.current) return; const value = name.trim();
    if (!value || value.length > 100 || /[\u0000-\u001f\u007f]/u.test(value)) { setError("Enter a name of 1–100 characters."); return; }
    lock.current = true; setBusy(true); setError(""); setSaved(false);
    try { const current = await supabase.auth.getSession(); if (current.data.session?.user.id !== userId) throw Error("Your account changed. Reopen your profile.");
      const response = await supabase.auth.updateUser({ data: { full_name: value, rezlee_display_name: value } });
      if (response.error || !response.data.user || response.data.user.id !== userId) throw Error("We couldn’t confirm the save. Your name is still here; try again.");
      const confirmed = profileName(response.data.user.user_metadata); setName(confirmed); setBaseline(confirmed); setSaved(true); Keyboard.dismiss(); AccessibilityInfo.announceForAccessibility("Profile saved");
    } catch (e) { setError(e instanceof Error ? e.message : "Your profile couldn’t save."); } finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}><ScreenNavigation title="Your profile" fallback="/account" disabled={busy} /><View style={{ flex: 1 }} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 26 }}>
    <View style={{ alignItems: "center", paddingVertical: 12, gap: 12 }}><ProfileBadge metadata={session?.user.user_metadata} size={84} circular /><Text style={[typography.body, { color: colors.mutedForeground }]}>A little more you.</Text></View>
    <TextField label="Your name" value={name} onChangeText={v => { setName(v); setSaved(false); }} maxLength={100} editable={!busy} autoComplete="name" />
    <View style={{ gap: 6 }}><Text style={[typography.meta, { color: colors.mutedForeground }]}>Sign-in email</Text><Text selectable style={[typography.body, { color: colors.foreground }]}>{session?.user.email}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>This is the address attached to your sign-in. Profile edits won’t change your login or household permissions.</Text></View>
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}{saved ? <View accessibilityRole="alert" style={{padding:16,borderRadius:16,backgroundColor:colors.accent,gap:4}}><Text style={[typography.section,{color:colors.primary}]}>Profile saved</Text><Text style={[typography.body,{color:colors.foreground}]}>Your name is up to date.</Text></View> : null}
    <Button label={busy ? "Saving profile…" : saved ? "Saved" : dirty ? "Save profile" : "No changes to save"} disabled={!dirty || busy} loading={busy} onPress={() => void save()} />
    <SettingsSection title="Personal touches"><SettingsRow icon="user" title="Your badge" detail="Choose initials and a colour" onPress={() => router.push("/profile-appearance")} last /></SettingsSection>
  </FormScrollView></View></SafeAreaView>;
}

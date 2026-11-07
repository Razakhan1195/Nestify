import { Linking } from "react-native";
import { useRef, useState } from "react";
import { Redirect, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { FilterChips } from "@/components/FilterChips";
import { FormScrollView } from "@/components/FormScrollView";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import { newVaultSaveRequestId } from "@/lib/vault-save-intent";
import { roadmapCategories, submitRoadmapIdea } from "@/lib/roadmap";
import { useTheme } from "@/theme/useTheme";
import { typography } from "@/theme/tokens";

export default function SuggestionScreen() {
 const { session, isLoading } = useAuth();
 if (isLoading) return <ActivityIndicator accessibilityLabel="Loading your account"/>;
 if (!session) return <Redirect href="/(auth)/login"/>;
 return <Suggestion key={session.user.id} userId={session.user.id}/>;
}
function Suggestion({ userId }: { userId: string }) {
 const { colors } = useTheme(), router = useRouter(), navigation = useNavigation();
 const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [category, setCategory] = useState("other"), [share, setShare] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [sent, setSent] = useState(false);
 const requestId = useRef<string | null>(null), lock = useRef(false);
 usePreventRemove(Boolean(title || description) && !sent, ({ data }) => {
  if (busy) { Alert.alert("Sending your idea", "Please wait a moment."); return; }
  Alert.alert("Leave this idea?", "Text that has not been sent will be lost.", [{ text: "Keep writing", style: "cancel" }, { text: "Leave", onPress: () => navigation.dispatch(data.action) }]);
 });
 async function send() {
  if (lock.current || !share) return; lock.current = true; setBusy(true); setError(""); requestId.current ??= newVaultSaveRequestId();
  try {
   await submitRoadmapIdea(userId, { id: requestId.current, title, description, category, sharePublicly: true });
   setSent(true); setUncertain(false);
  } catch (e) {
   setUncertain(!(e instanceof ApiError && [400, 401, 403, 429].includes(e.status)));
   setError(e instanceof Error ? e.message : "We couldn’t confirm your idea was received. Retry the same idea.");
  } finally { lock.current = false; setBusy(false); }
 }
 return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
  <ScreenNavigation title="Share an idea" fallback="/roadmap" disabled={busy}/>
  <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 44 }}>
   {sent ? <Surface tone="subtle" style={{ gap: 16 }}><Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Your idea is with us.</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>We’ll reply in Your ideas within seven days with a decision, priority and explanation. After review, your suggestion can appear on the public roadmap.</Text><Button label="View your ideas" onPress={() => router.dismissTo({ pathname: "/roadmap", params: { view: "mine" } })}/></Surface> : <>
    <View style={{ gap: 10 }}><Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>What would make home life easier?</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>Describe the problem and what a useful result would look like. We’ll reply here within seven days.</Text></View>
    <TextField label="A short title" placeholder="What would you like to do?" maxLength={100} value={title} editable={!busy && !uncertain} onChangeText={setTitle}/>
    <TextField label="Tell us more" multiline maxLength={2000} value={description} editable={!busy && !uncertain} onChangeText={setDescription} style={{ minHeight: 150, textAlignVertical: "top" }}/>
    <View style={{ gap: 10 }}><Text style={[typography.meta, { color: colors.foreground }]}>Topic</Text>{busy || uncertain ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{roadmapCategories.find(c => c.value === category)?.label}</Text> : <FilterChips options={roadmapCategories} selected={category} onSelect={setCategory}/>}</View>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Allow this idea to appear publicly after review. I have left out personal information." accessibilityState={{ checked: share, disabled: busy || uncertain }} disabled={busy || uncertain} onPress={() => setShare(v => !v)} style={{ minHeight: 48, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8 }}>
     <Feather name={share ? "check-square" : "square"} size={24} color={colors.primary}/>
     <Text style={[typography.meta, { flex: 1, color: colors.mutedForeground }]}>I agree to the roadmap participation rules in the Terms of use. This idea may appear publicly after review. I’ve left out personal information.</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
    <Button label={busy ? "Sending…" : uncertain ? "Retry same idea" : "Share idea"} loading={busy} disabled={!share || title.trim().length < 6 || description.trim().length < 20} onPress={() => void send()}/>
    <Button variant="secondary" label="Read roadmap participation rules" onPress={() => void Linking.openURL("https://rezlee.com/terms")}/><Text style={[typography.caption, { color: colors.mutedForeground }]}>Title: 6–100 characters. Description: 20–2,000 characters. Your name and email won’t appear on the roadmap.</Text>
   </>}
  </FormScrollView>
 </SafeAreaView>;
}

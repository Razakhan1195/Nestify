import {FormScrollView} from "@/components/FormScrollView";
import { withReadTimeout } from "@/lib/read-timeout";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { useAuth } from "@/auth/AuthProvider";
import { QuietAction, ReadNotice } from "@/components/Brief";
import { ProfileBadge } from "@/components/ProfileUI";
import { TextField } from "@/components/TextField";
import { AppleAccountNotice } from "@/components/AppleAccountNotice";
import { MembershipCard, SettingsRow, SettingsSection, type SettingsIcon } from "@/components/SettingsUI";
import { profileName } from "@/lib/profile-identity";
import { fetchHousehold, type HouseholdPayload } from "@/lib/household-data";
import { loadMembership, type MembershipPayload } from "@/lib/membership";
import { connectionSummary, fetchAccountConnections, type AccountConnections } from "@/lib/account-connections";
import { openPublicLink } from "@/lib/public-links";
import { colors, editorialType, typography } from "@/theme/tokens";
export default function AccountScreen() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <ActivityIndicator accessibilityLabel="Loading settings" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <AccountContent key={session.user.id} userId={session.user.id} />;
}
function AccountContent({ userId }: { userId: string }) {
  const router = useRouter(), { session, signOut } = useAuth();
  const [household, setHousehold] = useState<HouseholdPayload | null>(null), [membership, setMembership] = useState<MembershipPayload | null>(null), [connections, setConnections] = useState<AccountConnections | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [search, setSearch] = useState(""), [refreshing, setRefreshing] = useState(false), [busy, setBusy] = useState(false), [logoutError, setLogoutError] = useState(false);
  const request = useRef(0), logoutLock = useRef(false);
  const load = useCallback(async (pulled = false) => {
    const version = ++request.current; setRefreshing(pulled); setErrors([]);
    const failed = (section: string) => { if (request.current === version) setErrors(old => [...old, section]); };
    await Promise.allSettled([
      withReadTimeout(loadMembership(userId)).then(value => { if (request.current === version) setMembership(value); }).catch(() => failed("membership")),
      withReadTimeout(fetchHousehold()).then(value => { if (request.current === version) setHousehold(value); }).catch(() => failed("household")),
      withReadTimeout(fetchAccountConnections(userId)).then(value => { if (request.current === version) setConnections(value); }).catch(() => failed("connections")),
    ]);
    if (request.current === version) setRefreshing(false);
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; setRefreshing(false); }; }, [load]));
  const available = household && !("needsOnboarding" in household) && household.available ? household : null;
  const name = profileName(session?.user.user_metadata) || "Make yourself at home";
  const go = (path: string) => () => router.push(path as never);
  type Row = { title: string; detail: string; icon: SettingsIcon; onPress: () => void; keywords?: string; danger?: boolean };
  const groups: { title: string; rows: Row[] }[] = [
    { title: "Your home base", rows: [
      { title: "Profile", detail: "Your name, email and personal badge", icon: "user", onPress: go("/profile") },
      { title: "Connections", detail: errors.includes("connections") ? "Couldn’t refresh · open to retry" : connectionSummary(connections), icon: "link", onPress: go("/connections"), keywords: "providers utilities electricity gas water internet green button deck gmail email accounts" },
      { title: "Household", detail: available ? `${available.home.nickname} · people and invitations` : "People, invitations and home details", icon: "home", onPress: go("/household") },
      { title: "Sharing & access", detail: "What stays private and what’s shared", icon: "users", onPress: go("/household/sharing"), keywords: "privacy permissions" },
    ] },
    { title: "Make it yours", rows: [
      { title: "Notifications", detail: "Choose the updates you want", icon: "bell", onPress: go("/notification-settings"), keywords: "push reminders preferences" },
      { title: "Security", detail: "Verified email and device unlock", icon: "shield", onPress: go("/app-security"), keywords: "password apple google login biometric lock" },
      { title: "AI privacy", detail: "You choose what’s shared for AI help", icon: "sliders", onPress: go("/ai-privacy"), keywords: "consent data" },
      { title: "Recall alerts", detail: "Updates about products in your home", icon: "alert-circle", onPress: go("/recall-settings") },
    ] },
    { title: "Your activity", rows: [
      { title: "Notification centre", detail: "Return to updates and things that need you", icon: "inbox", onPress: go("/notifications") },
      { title: "Completed care", detail: "The things you’ve taken care of", icon: "check-circle", onPress: go("/care-history"), keywords: "history tasks chores" },
    ] },
    { title: "Here to help", rows: [
      { title: "Help shape Rezlee", detail: "Share an idea or report a problem", icon: "message-circle", onPress: go("/feedback"), keywords: "feedback bug support" },
      { title: "Contact us", detail: "Get help from the Rezlee team", icon: "help-circle", onPress: () => void openPublicLink("contact"), keywords: "support" },
      { title: "A note from our founder", detail: "Built in Canada. Shaped by you.", icon: "heart", onPress: go("/about-rezlee"), keywords: "about" },
    ] },
    { title: "Privacy & account", rows: [
      { title: "Privacy policy", detail: "How we handle your information", icon: "file-text", onPress: () => void openPublicLink("privacy") },
      { title: "Terms of use", detail: "Using Rezlee and your membership", icon: "file-text", onPress: () => void openPublicLink("terms") },
      { title: "Feature disclosures", detail: "What our insights and connections can do", icon: "info", onPress: () => void openPublicLink("disclosures") },
      { title: "Delete account", detail: "Review your data and household first", icon: "trash-2", danger: true, onPress: go("/delete-account") },
    ] },
  ];
  const query = search.trim().toLocaleLowerCase();
  const filtered = groups.map(group => ({ ...group, rows: group.rows.filter(row => !query || `${row.title} ${row.detail} ${row.keywords ?? ""}`.toLocaleLowerCase().includes(query)) })).filter(group => group.rows.length);
  async function logout() {
    if (logoutLock.current) return; logoutLock.current = true; setBusy(true); setLogoutError(false);
    try { await signOut(); router.replace("/(auth)/login"); } catch { setLogoutError(true); } finally { logoutLock.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Settings" fallback="/(tabs)/home" disabled={busy} />
    <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={{ padding: 20, paddingBottom: 44, gap: 26 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit your profile" onPress={go("/profile")} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}><ProfileBadge metadata={session?.user.user_metadata} size={62} circular /><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={[editorialType, { fontSize: 29, lineHeight: 36, color: colors.foreground }]}>{name}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{session?.user.email}</Text></View></Pressable>
      <MembershipCard data={membership} unavailable={errors.includes("membership")} onPress={go("/membership")} />
      {session?.user.identities?.some(i => i.provider === "apple") || session?.user.email?.toLowerCase().endsWith("@privaterelay.appleid.com") ? <AppleAccountNotice userId={userId} /> : null}
      <TextField label="Find a setting" placeholder="Connections, notifications, privacy…" value={search} onChangeText={setSearch} autoCorrect={false} />
      {query && /plan|pro|membership|subscription|tier|billing|price/.test(query) ? <SettingsSection title="Membership"><SettingsRow icon="star" title="Your membership" detail="Compare Rezlee and Rezlee Pro" onPress={go("/membership")} last /></SettingsSection> : null}
      {filtered.map(group => <SettingsSection key={group.title} title={group.title}>{group.rows.map((row, i) => <SettingsRow key={row.title} {...row} last={i === group.rows.length - 1} />)}</SettingsSection>)}
      {query && !filtered.length && !/plan|pro|membership|subscription|tier|billing|price/.test(query) ? <View style={{ gap: 8 }}><Text style={[typography.body, { color: colors.mutedForeground }]}>No matching settings. Try a different word or get in touch.</Text><QuietAction label="Clear search" onPress={() => setSearch("")} /></View> : null}
      {errors.length ? <ReadNotice message="Some account details couldn’t refresh. You can still open your settings." onRetry={() => void load()} busy={refreshing} /> : null}
      {logoutError ? <ReadNotice message="We couldn’t sign you out. Please try again." onRetry={() => void logout()} busy={busy} /> : null}
      <QuietAction label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => Alert.alert("Sign out of Rezlee?", "Your saved records stay in your account.", [{ text: "Stay signed in", style: "cancel" }, { text: "Sign out", onPress: () => void logout() }])} />
      <Text style={[typography.meta, { color: colors.mutedForeground, textAlign: "center" }]}>Your place, under control.{"\n"}Made in Canada, for life at home.</Text>
    </FormScrollView>
  </SafeAreaView>;
}


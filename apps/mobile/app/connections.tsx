import { useTheme } from "@/theme/useTheme";
import { useCallback, useRef, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { SettingsRow, SettingsSection } from "@/components/SettingsUI";
import { ReadNotice } from "@/components/Brief";
import { Button } from "@/components/Button";
import { fetchAccountConnections, type AccountConnections } from "@/lib/account-connections";
import { editorialType, typography } from "@/theme/tokens";
export default function ConnectionsScreen() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <ActivityIndicator />;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <ConnectionsContent key={session.user.id} userId={session.user.id} />;
}
function ConnectionsContent({ userId }: { userId: string }) {
  const { colors } = useTheme();

  const { session } = useAuth(), router = useRouter();
  const [data, setData] = useState<AccountConnections | null>(null), [error, setError] = useState(false), [loading, setLoading] = useState(true);
  const request = useRef(0);
  const load = useCallback(async () => { const version = ++request.current; setLoading(true); try { const result = await fetchAccountConnections(userId); if (version === request.current) { setData(result); setError(false); } } catch { if (version === request.current) setError(true); } finally { if (version === request.current) setLoading(false); } }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const identities = [...new Set(session?.user.identities?.map(i => i.provider) ?? [])];
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}><ScreenNavigation title="Connections" fallback="/account" /><ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={{ padding: 20, paddingBottom: 44, gap: 26 }}>
    <View style={{ gap: 12 }}><Text accessibilityRole="header" style={[editorialType, { fontSize: 32, lineHeight: 39, color: colors.foreground }]}>Connected, on your terms.</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>Your linked services, their latest status and control over what you share.</Text></View>
    {error ? <ReadNotice message="Connections couldn’t refresh. Your saved records are safe." onRetry={() => void load()} busy={loading} /> : null}
    {!data && loading ? <ActivityIndicator accessibilityLabel="Loading connections" /> : null}
    {data ? <>
      <SettingsSection title="Bill providers">
        {!data.providersAvailable ? <View style={{ paddingVertical: 18 }}><ReadNotice message="Bill connections couldn’t refresh." onRetry={() => void load()} busy={loading} /></View> : data.providers.length ? data.providers.map((p, i) => <SettingsRow key={p.id} icon={p.needsAttention ? "alert-circle" : "link"} title={p.name} detail={`${p.status}${p.lastUpdated ? " · last data " + new Date(p.lastUpdated).toLocaleDateString("en-CA") : ""}`} onPress={() => router.push(("/provider/" + p.id) as never)} last={i === data.providers.length - 1} />) : <View style={{ paddingVertical: 20, gap: 8 }}><Text style={[typography.section, { color: colors.foreground }]}>No bill providers linked</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>{data.canConnect ? "Connect when it’s useful. You can always upload a bill yourself." : "Private provider connections are managed by the household owner. Your sign-in stays separate."}</Text></View>}
      </SettingsSection>
      {data.canConnect ? <Button variant="secondary" label="Connect a bill provider" onPress={() => router.push("/provider/connect")} /> : null}
      <SettingsSection title="Email imports">
        {!data.gmailAvailable ? <View style={{ paddingVertical: 18 }}><ReadNotice message="Gmail status couldn’t refresh." onRetry={() => void load()} busy={loading} /></View> : data.gmail ? <SettingsRow icon="mail" title="Gmail" detail={`${data.gmail.email} · ${data.gmail.status}`} onPress={() => router.push("/gmail-memory")} last /> : data.canConnect ? <SettingsRow icon="mail" title="Gmail" detail="Not connected · find home paperwork in your inbox" onPress={() => router.push("/gmail-memory")} last /> : <Text style={[typography.body, { color: colors.mutedForeground, paddingVertical: 20 }]}>No private email connection for this account.</Text>}
      </SettingsSection>
    </> : null}
    <SettingsSection title="How you sign in"><SettingsRow icon="shield" title={identities.length ? identities.map(p => p === "google" ? "Google" : p === "apple" ? "Apple" : p === "email" ? "Email" : "Account sign-in").join(" · ") : "Account security"} detail="Manage sign-in security and device unlock" onPress={() => router.push("/app-security")} last /></SettingsSection>
    <Text style={[typography.meta, { color: colors.mutedForeground }]}>Signing in with Google doesn’t connect Gmail. Email imports need a separate permission. Disconnecting a service stops future access; records you already saved stay in Rezlee.</Text>
  </ScrollView></SafeAreaView>;
}

import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useAccountSwitch } from "@/auth/useAccountSwitch";
import { SetupAccount } from "@/components/SetupAccount";
import { setupDrafts } from "@/lib/onboarding-draft";
import { shouldResumeSetup } from "@/lib/onboarding-draft-core";
import { TabHeader } from "@/components/WorkspaceUI";
import { ReadNotice } from "@/components/Brief";
import { fetchOnboarding } from "@/lib/onboarding-data";
import { ApiError } from "@/lib/api";
import { emitTabPress } from "@/lib/tab-events";

const icons: Record<string, keyof typeof Feather.glyphMap> = { home: "home", bills: "file-text", vault: "archive", care: "check-square", household: "users" };
export default function TabsLayout() {
  const { colors } = useTheme();

  const { session, isLoading } = useAuth();
  const account = useAccountSwitch();
  const insets = useSafeAreaInsets();
  const [access, setAccess] = useState<{ user: string; role: "owner" | "member"; needsSetup: boolean; groupOnly: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session || account.busy) return;
    let active = true;
    const userId = session.user.id;
    // One current server check gates the tabs and unfinished setup. Local draft
    // retrieval overlaps that check; no household permissions are cached.
    void Promise.all([
      fetchOnboarding(userId),
      setupDrafts.read(userId).catch(() => null),
    ]).then(([payload, draft]) => {
      if (!active || account.switching.current) return;
      if (payload.home && !["owner", "member"].includes(payload.accessRole ?? "")) {
        throw new Error("Household role unavailable");
      }
      setAccess({ user: userId, role: payload.accessRole === "member" ? "member" : "owner",
        groupOnly: !payload.home && payload.expenseGroupsAvailable === true,
        needsSetup: !payload.home || shouldResumeSetup(draft, payload.home.id, payload.accessRole) });
      setFailed(false);
    }).catch(error => { if (active && !account.switching.current) {
      setFailed(true);
      // A temporary outage may retain an already-authorized view. A current
      // access rejection must remove the old household gate and offer recovery.
      if (error instanceof ApiError && [401, 403, 423].includes(error.status)) setAccess(null);
    } });
    return () => { active = false; };
  }, [session, retry, account.busy, account.switching]);
  if (!isLoading && !session) return <Redirect href="/(auth)/login" />;
  if (isLoading || account.busy || !access || access.user !== session?.user.id) return <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.canvas }}>
    {failed ? <ReadNotice message="Your household access couldn’t be checked." onRetry={() => { setFailed(false); setRetry(v => v + 1); }} /> : <ActivityIndicator color={colors.primary} />}
    {failed && !isLoading && !account.busy && session ? <SetupAccount email={session.user.email} busy={account.busy} error={account.error} onSwitch={() => void account.switchAccount()} /> : null}
  </View>;
  if (access.groupOnly) return <Redirect href="/shared/groups" />;
  if (access.needsSetup) return <Redirect href="/onboarding" />;
  const member = access.role === "member";
  const visibleTabs = member ? ["home", "household", "care"] : ["home", "bills", "vault", "care"];
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <Tabs key={session?.user.id} screenOptions={({ route }) => ({ sceneStyle: { backgroundColor: "transparent" }, headerShown: true, header: ({ options }) => <TabHeader title={options.title ?? "Rezlee"} showAssistant />, tabBarHideOnKeyboard: true,
    // Hidden compatibility routes must not inflate the spoken tab position.
    tabBarAccessibilityLabel: visibleTabs.includes(route.name) ? `${route.name.charAt(0).toUpperCase() + route.name.slice(1)}, tab, ${visibleTabs.indexOf(route.name) + 1} of ${visibleTabs.length}` : undefined, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedForeground,
    tabBarStyle: { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), height: 60 + Math.max(insets.bottom, 8) },
    tabBarLabelStyle: { fontSize: 12, fontWeight: "600" }, tabBarIcon: ({ color, focused }) => <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: focused ? colors.accent : "transparent" }}><Feather name={icons[route.name] ?? "circle"} size={21} color={color} /></View> })}>
    <Tabs.Screen name="home" options={{ title: "Home" }} listeners={{ tabPress: () => emitTabPress("home") }} />
    <Tabs.Screen name="bills" options={{ title: "Bills", href: member ? null : undefined }} listeners={{ tabPress: () => emitTabPress("bills") }} />
    <Tabs.Screen name="vault" options={{ title: "Vault", href: member ? null : undefined }} listeners={{ tabPress: () => emitTabPress("vault") }} />
    <Tabs.Screen name="household" options={{ title: "Household", href: member ? undefined : null }} listeners={{ tabPress: () => emitTabPress("household") }} />
    <Tabs.Screen name="care" options={{ title: "Care" }} listeners={{ tabPress: () => emitTabPress("care") }} />
    <Tabs.Screen name="more" options={{ href: null }} />
    <Tabs.Screen name="ask" options={{ href: null }} />
  </Tabs>
  </View>;
}


import { useTheme } from "@/theme/useTheme";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { spacing, typography } from "@/theme/tokens";

type Connection = {
  experience?: { title: string; message: string; meterMessage: string; action?: "refresh" | "reconnect" | null; authorizationMessage?: string };
  name: string; status: string; sharedCount: number; readingsReceived?: number | null;
  billsRefreshedAt: string | null; readingsThrough: string | null;
  readingSource: string | null; lastError: string | null;
  job: { id: string; status: string } | null;
};
function dateLabel(value: string | null) {
  if (!value) return "Not available yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available yet" : date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}
export function EzgbConnectionPanel({ providerId }: { providerId: string }) {
  const { colors } = useTheme();

  const router = useRouter();
  const [data, setData] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(false);
  const path = `/api/mobile/v1/utilities/${encodeURIComponent(providerId)}/connection`;
  const requestId = useRef(0);
  const focused = useRef(false);
  const pending = useRef(false);
  const reloadRequested = useRef(false);
  const failures = useRef(0);
  const load = useCallback(async () => {
    if (pending.current) { reloadRequested.current = true; return; }
    pending.current = true;
    setChecking(true);
    try {
      do {
        reloadRequested.current = false;
        const id = ++requestId.current;
        try {
          const next = await apiGet<Connection>(path, { timeoutMs: 15000 });
          if (focused.current && id === requestId.current) { setData(next); setError(null); failures.current = 0; }
        } catch (e) {
          if (focused.current && id === requestId.current) {
            failures.current += 1;
            setError(e instanceof ApiError ? e.message : "Could not check your utility connection. Pull down to try again.");
          }
        }
      } while (reloadRequested.current && focused.current && failures.current < 3);
    } finally {
      pending.current = false;
      if (focused.current) setChecking(false);
    }
  }, [path]);
  useFocusEffect(useCallback(() => {
    focused.current = true; failures.current = 0;
    void load();
    return () => { focused.current = false; requestId.current += 1; };
  }, [load]));
  const syncing = data?.status !== "disconnected" && Boolean(data?.job && ["queued", "running"].includes(data.job.status));
  useFocusEffect(useCallback(() => {
    if (!syncing) return;
    const timer = setInterval(() => { if (failures.current < 3) void load(); }, 5000);
    return () => clearInterval(timer);
  }, [syncing, load]));
  async function act(action: "refresh" | "disconnect") {
    setWorking(true); setError(null);
    try {
      const result = await apiPost<{jobId?: string}>(path, { action, confirmShared: action === "disconnect" }, { timeoutMs: 20000 });
      requestId.current += 1;
      setData(current => current ? { ...current, experience: undefined,
        ...(action === "refresh" ? { job: { id: result.jobId ?? "", status: "queued" } } : { status: "disconnected", job: null }) } : current);
      await load();
    }
    catch (e) { setError(e instanceof ApiError && e.status === 408 ? "The request could not be confirmed. Check status before trying again; it may still be running." : e instanceof ApiError ? e.message : "That action could not be confirmed. Check status before retrying."); }
    finally { setWorking(false); }
  }
  function disconnect() {
    Alert.alert("Disconnect Green Button?",
      `This stops sharing for ${data?.sharedCount ?? 1} utility account(s) covered by this authorization in your home. Your saved bills and readings stay in Rezlee.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Disconnect", style: "destructive", onPress: () => void act("disconnect") }]);
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Utility connection" fallback="/provider" />
    <ScrollView refreshControl={<RefreshControl refreshing={checking && Boolean(data)} onRefresh={() => void load()} />} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={[typography.heading, { color: colors.foreground }]}>{data?.name ?? "Your utility"}</Text>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Green Button connection</Text>
      {!data && checking ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.criticalForeground }}>{error}</Text> : null}
      {data ? <View style={{ gap: spacing.md }}>
        <Text style={[typography.section, { color: colors.foreground }]}>
          {data.status === "disconnected" ? "Utility disconnected" : syncing ? "Checking utility data" : data.experience?.title ?? (data.lastError || data.job?.status === "failed" || data.job?.status === "waiting" ? "Refresh needs attention" : "Connection available")}
        </Text>
        {data.experience && !syncing ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{data.experience.message}</Text> : null}
        {data.experience?.authorizationMessage ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>{data.experience.authorizationMessage}</Text> : null}
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Bills last checked: {dateLabel(data.billsRefreshedAt)}</Text>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Meter readings through: {dateLabel(data.readingsThrough)}</Text>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>{data.experience?.meterMessage ?? "The last bill check and saved interval coverage are separate."}</Text>
        {syncing ? <Text style={[typography.body, { color: colors.mutedForeground }]}>You can leave this screen. Return here to see the result.</Text> : null}
        {data.lastError ? <Text style={[typography.body, { color: colors.warningForeground }]}>{data.lastError}</Text> : null}
      </View> : null}
      <View style={{ gap: spacing.md }}>
        {data ? <Button label={data.status === "disconnected" || data.experience?.action === "reconnect" ? "Reconnect utility" : syncing ? "Refresh in progress" : "Refresh utility data"}
          loading={working} disabled={working || syncing}
          onPress={() => data.status === "disconnected" || data.experience?.action === "reconnect" ? router.push("/provider/ezgb") : void act("refresh")} /> : null}
        {data && data.status !== "disconnected" && data.experience?.action === "reconnect" ? <Button label="Check previously collected data" variant="secondary" disabled={working || syncing} onPress={() => void act("refresh")} /> : null}
        {error ? <Button label={checking ? "Checking…" : "Check status again"} variant="secondary" disabled={checking || working} onPress={() => void load()} /> : null}
        {data && data.status !== "disconnected" ? <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm }}>
          <Pressable accessibilityRole="button" disabled={working || syncing} onPress={() => router.push("/provider/ezgb")} style={{ minHeight: 44, justifyContent: "center", opacity: working || syncing ? 0.5 : 1 }}>
            <Text style={[typography.body, { color: colors.primary }]}>Reconnect through your utility</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={working || syncing} onPress={disconnect} style={{ minHeight: 44, justifyContent: "center", opacity: working || syncing ? 0.5 : 1 }}>
            <Text style={[typography.body, { color: colors.criticalForeground }]}>Disconnect utility</Text>
          </Pressable>
        </View> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

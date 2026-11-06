import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { BriefHeading, QuietAction, ReadNotice } from "@/components/Brief";
import { useNotifications } from "@/components/AppNotifications";
import { fetchNotifications, openNotification, readNotification, readAllNotifications, type NotificationsPayload, type AppNotification } from "@/lib/notification-data";
import { mergeNotificationItems, safeNotificationDestination } from "@/lib/notification-routing";
import { colors, layout, spacing, typography } from "@/theme/tokens";
const labels = { shared_expenses: "Shared expenses", connections: "Connections", bills: "Bills", care: "Care", recalls: "Recalls" };
const notices = {
 handled: "That update has already been handled or has expired. You can review your other updates here.",
 unavailable: "That update is no longer available for this account. You can review your other updates here.",
 check: "We couldn’t open that update. Check your connection, then try it from your inbox."
};
export default function NotificationsScreen() {
 const { session, isLoading } = useAuth();
 const { notice } = useLocalSearchParams<{ notice?: string }>();
 if (isLoading) return <ActivityIndicator accessibilityLabel="Loading notifications" color={colors.primary} />;
 if (!session) return <Redirect href="/(auth)/login" />;
 return <AccountInbox key={session.user.id + ":" + (notice ?? "")} userId={session.user.id} initialNotice={notice} />;
}
function AccountInbox({ userId, initialNotice }: { userId: string; initialNotice?: string }) {
 const router = useRouter(), { refresh } = useNotifications();
 const [data, setData] = useState<NotificationsPayload | null>(null), [error, setError] = useState<string | null>(null);
 const [notice, setNotice] = useState<string | null>(() => initialNotice && initialNotice in notices ? notices[initialNotice as keyof typeof notices] : null), [busy, setBusy] = useState<"refresh" | "more" | "read" | null>(null);
 const [onlyUnread, setOnlyUnread] = useState(false), [opening, setOpening] = useState<string | null>(null);
 const alive = useRef(true), version = useRef(0), operation = useRef(false), openingRef = useRef(false);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 const load = useCallback(async () => {
  const ticket = ++version.current; setBusy("refresh");
  try {
   const next = await fetchNotifications(undefined, userId);
   if (alive.current && ticket === version.current) { setData({ ...next, items: mergeNotificationItems([], next.items) }); setError(null); void refresh(); }
  } catch { if (alive.current && ticket === version.current) setError("Your updates couldn’t be loaded. Your saved records are still available."); }
  finally { if (alive.current && ticket === version.current) setBusy(null); }
 }, [userId, refresh]);
 useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
 async function open(n: AppNotification) {
  if (openingRef.current) return;
  openingRef.current = true; setOpening(n.id); setError(null);
  try {
   const destination = await openNotification(n.id, userId);
   if (!alive.current) return;
   const href = safeNotificationDestination(destination.href);
   if (href === "/notifications") setNotice(destination.notice ? notices[destination.notice] : "This update is in your inbox. There’s no separate record to open.");
   else router.push(href as never);
   if (destination.notice) setData(previous => previous ? { ...previous,
    unread: Math.max(0, previous.unread - (previous.items.find(item => item.id === n.id)?.status === "unread" ? 1 : 0)),
    items: previous.items.filter(item => item.id !== n.id) } : previous);
   // A failed read receipt must never prevent the customer reaching their record.
   void readNotification(n.id, userId).then(() => {
    if (!alive.current) return;
    setData(previous => previous ? { ...previous,
     unread: Math.max(0, previous.unread - (previous.items.find(item => item.id === n.id)?.status === "unread" ? 1 : 0)),
     items: previous.items.map(item => item.id === n.id ? { ...item, status: "read" } : item) } : previous);
    void refresh();
   }).catch(() => { /* Leave unread until a later successful acknowledgement. */ });
  } catch { if (alive.current) setError("We couldn’t open this update. Check your connection and tap it again."); }
  finally { if (alive.current) { openingRef.current = false; setOpening(null); } }
 }
 async function markAll() {
  if (!data || busy || operation.current) return;
  operation.current = true; setBusy("read"); const ticket = version.current;
  try { await readAllNotifications(data.asOf, userId); if (alive.current && ticket === version.current) await load(); }
  catch { if (alive.current && ticket === version.current) setError("Couldn’t mark your updates read. Please try again."); }
  finally { operation.current = false; if (alive.current && ticket === version.current) setBusy(null); }
 }
 async function more() {
  if (!data?.nextBefore || busy || operation.current) return;
  operation.current = true; setBusy("more"); const ticket = version.current;
  try {
   const next = await fetchNotifications(data.nextBefore, userId);
   if (alive.current && ticket === version.current) setData(previous => previous ? { ...previous, nextBefore: next.nextBefore, items: mergeNotificationItems(previous.items, next.items) } : next);
  } catch { if (alive.current && ticket === version.current) setError("Couldn’t load older updates. Please try again."); }
  finally { operation.current = false; if (alive.current && ticket === version.current) setBusy(null); }
 }
 const items = data?.items.filter(n => !onlyUnread || n.status === "unread") ?? [];
 return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
  <ScreenNavigation title="Notifications" fallback="/(tabs)/home" />
  <ScrollView refreshControl={<RefreshControl refreshing={busy === "refresh"} onRefresh={() => void load()} />} contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 48, gap: spacing.lg }}>
   <BriefHeading title="Your updates, together." detail="Shared expenses, bills, care, recalls and connection updates. Opening an update won’t mark a bill paid or a task done." />
   <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><QuietAction label="Notification settings" onPress={() => router.push("/notification-settings")} />{data?.unread ? <QuietAction label="Mark all read" disabled={!!busy} onPress={() => void markAll()} /> : null}<QuietAction label={onlyUnread ? "Show all" : "Unread only"} onPress={() => setOnlyUnread(value => !value)} /></View>
   {notice ? <View style={{ padding: 16, borderRadius: 12, backgroundColor: colors.surfaceSubtle }}><Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.foreground }]}>{notice}</Text></View> : null}
   {error ? <ReadNotice message={error} onRetry={() => void load()} /> : null}
   {!data && !error ? <ActivityIndicator accessibilityLabel="Loading notifications" color={colors.primary} /> : null}
   {data && !items.length ? <View style={{ paddingVertical: 30, gap: 12 }}><Feather name="bell" size={28} color={colors.primary} /><Text style={[typography.section, { color: colors.foreground }]}>{onlyUnread || notice ? "You’re all caught up" : "No updates yet"}</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>Useful updates appear here when there’s something to review. Push notifications are optional.</Text></View> : null}
   {items.map(n => <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={(n.status === "unread" ? "Unread. " : "") + n.title} accessibilityState={{ disabled: !!opening, busy: opening === n.id }} disabled={!!opening} onPress={() => void open(n)} style={({ pressed }) => ({ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accent : n.status === "unread" ? colors.surfaceSubtle : colors.surfaceRaised, gap: 7 })}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{n.status === "unread" ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} /> : null}<Text style={[typography.caption, { color: colors.mutedForeground, flex: 1 }]}>{labels[n.category]} · {new Date(n.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</Text>{opening === n.id ? <ActivityIndicator accessibilityLabel="Opening update" size="small" color={colors.primary} /> : n.href ? <Feather name="chevron-right" size={17} color={colors.primary} /> : null}</View>
    <Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>{n.title}</Text>{n.body ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{n.body}</Text> : null}
   </Pressable>)}
   {data?.nextBefore ? <QuietAction label={busy === "more" ? "Loading…" : "Load older updates"} disabled={!!busy} onPress={() => void more()} /> : null}
   {data?.items.length ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Updates from the last 30 days. Expired verification requests and handled reminders are removed automatically.</Text> : null}
  </ScrollView>
 </SafeAreaView>;
}

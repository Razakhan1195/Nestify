import { useTheme } from "@/theme/useTheme";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useAppLock } from "@/auth/AppLockProvider";
import { fetchNotifications, openNotification, readNotification } from "@/lib/notification-data";
import { registerPushNotifications, getInitialNotificationTarget, addNotificationTargetListener, clearNotificationResponse } from "@/lib/push-notifications";
import { notificationNavigationReady, safeNotificationDestination, type NotificationResponseTarget } from "@/lib/notification-routing";
import { WelcomeEmailSync } from "./WelcomeEmailSync";

type NotificationState = { userId: string | null; unread: number; refresh: () => Promise<void> };
const emptyNotifications = { unread: 0, refresh: async () => {} };
const Context = createContext(emptyNotifications);
export const useNotifications = () => useContext(Context);
export function AppNotifications({ children }: { children: ReactNode }) {
  const { session } = useAuth(), { state } = useAppLock(), navigation = useRootNavigationState();
  const uid = session?.user.id ?? null;
  const ready = Boolean(uid && state.ready && !state.locked && state.userId === uid && navigation?.key);
  const [snapshot, setSnapshot] = useState<NotificationState | null>(null);
  // Only account-owned effects/state are keyed. Keying the ancestor of children
  // would tear down the native navigator during every successful sign-in.
  const current = ready && snapshot?.userId === uid ? snapshot : emptyNotifications;
  return <Context.Provider value={current}>
    <AccountNotifications key={uid ?? "signed-out"} userId={uid} ready={ready} onChange={setSnapshot} />
    {children}
  </Context.Provider>;
}
function AccountNotifications({ userId, ready, onChange }: { userId: string | null; ready: boolean; onChange: (state: NotificationState) => void }) {
  const router = useRouter(), path = usePathname(), canOpen = ready && notificationNavigationReady(path);
  const [unread, setUnread] = useState(0), requests = useRef(0), handled = useRef(new Set<string>());
  const invalidate = useCallback(() => { requests.current++; }, []);
  const refresh = useCallback(async () => {
    if (!userId || !ready) return;
    const version = ++requests.current;
    try { const result = await fetchNotifications(undefined, userId); if (version === requests.current) setUnread(result.unread); }
    catch { /* The inbox provides an explicit retry. */ }
  }, [userId, ready]);
  useEffect(() => { onChange({ userId, unread: ready ? unread : 0, refresh }); }, [onChange, userId, unread, ready, refresh]);
  useEffect(() => {
    if (!ready) return;
    const check = () => { void refresh(); void registerPushNotifications({ requestPermission: false }).catch(() => {}); };
    check();
    const foreground = AppState.addEventListener("change", s => { if (s === "active") check(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 60000);
    return () => { invalidate(); foreground.remove(); clearInterval(timer); };
  }, [ready, refresh, invalidate]);
  useEffect(() => {
    if (!canOpen || !userId) return;
    let active = true, version = 0;
    const inFlight = new Set<string>();
    const open = async (target: NotificationResponseTarget) => {
      if (!active || handled.current.has(target.responseId) || inFlight.has(target.responseId)) return;
      inFlight.add(target.responseId); const ticket = ++version;
      try {
        // Older pushes have only a raw URL. Open the account's inbox instead of
        // trusting that URL after a sign-out or household change.
        const destination = target.notificationId ? await openNotification(target.notificationId, userId) : { href: "/notifications" };
        if (!active || ticket !== version) return;
        const href = safeNotificationDestination(destination.href);
        router.push(destination.notice ? { pathname: "/notifications", params: { notice: destination.notice } } : href as never);
        handled.current.add(target.responseId);
        if (handled.current.size > 100) handled.current.delete(handled.current.values().next().value!);
        if (target.notificationId) void readNotification(target.notificationId, userId).catch(() => {}).then(() => { if (active) void refresh(); });
        const latest = await getInitialNotificationTarget();
        if (active && latest?.responseId === target.responseId) await clearNotificationResponse();
      } catch {
        if (active && ticket === version && !handled.current.has(target.responseId)) router.push({ pathname: "/notifications", params: { notice: "check" } });
        // Leave the OS response pending when lookup failed; foreground can retry.
      } finally { inFlight.delete(target.responseId); }
    };
    const inspect = () => { void getInitialNotificationTarget().then(target => { if (target) void open(target); }).catch(() => {}); };
    const listener = addNotificationTargetListener(target => { void open(target); });
    const foreground = AppState.addEventListener("change", s => { if (s === "active") inspect(); });
    inspect();
    return () => { active = false; version++; listener.remove(); foreground.remove(); };
  }, [canOpen, userId, router, refresh]);
  return ready && userId ? <WelcomeEmailSync userId={userId} /> : null;
}
export function NotificationBell() {
  const { colors } = useTheme();

  const { unread } = useNotifications(), router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel={unread ? "Notifications, " + unread + " unread" : "Notifications"} onPress={() => router.push("/notifications")} style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
    <Feather name="bell" size={21} color={colors.primary} />
    {unread > 0 ? <View style={{ position: "absolute", top: 2, right: 0, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 10, fontWeight: "700", color: colors.background }}>{unread > 99 ? "99+" : unread}</Text></View> : null}
  </Pressable>;
}

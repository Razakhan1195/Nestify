import { useTheme } from "@/theme/useTheme";
import { createImportReadLoop, utilitySavedBillsChanged } from "@/lib/import-refresh";
import { useAuth } from "@/auth/AuthProvider";
import { UtilityAttemptRemoval } from "@/components/UtilityAttemptRemoval";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { fetchEzgbSyncStatus, type EzgbSyncPayload } from "@/lib/ezgb-data";
import { ezgbBillsAvailable, ezgbProgress } from "@/lib/ezgb-progress";
import { ReadNotice } from "@/components/Brief";
import { typography } from "@/theme/tokens";

type ProgressProps = { hasAccounts: boolean; accountsLoaded: boolean; onComplete: () => void | Promise<void> };
export function HomeUtilityProgress(props: ProgressProps) {
  const { session } = useAuth();
  return session ? <UtilityProgress key={session.user.id} {...props} /> : null;
}
function UtilityProgress({ hasAccounts, accountsLoaded, onComplete }: ProgressProps) {
  const { colors } = useTheme();

  const readVersion = useRef(0);
  const previousJob = useRef<EzgbSyncPayload | null>(null);
  const router = useRouter(), completed = useRef<string | null>(null), completion = useRef(onComplete);
  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  const [job, setJob] = useState<EzgbSyncPayload | null>(null), [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const initialRefresh = useRef<string | null>(null);
  useEffect(() => {
    if (!job?.jobId || !accountsLoaded || !ezgbBillsAvailable(job) || initialRefresh.current === job.jobId) return;
    // A finished receipt has no data-revision timestamp. Reconcile it once per
    // mounted screen, including re-imports of an already known account. This
    // does not block cached content or repeat on ordinary focus/status reads.
    const id = job.jobId; initialRefresh.current = id;
    void Promise.resolve().then(() => completion.current()).catch(() => {
      if (initialRefresh.current === id) initialRefresh.current = null;
      setFailed(true);
    });
  }, [job, accountsLoaded]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const loop = createImportReadLoop({
      read: async () => {
        const version = readVersion.current;
        const next = await fetchEzgbSyncStatus();
        if (!alive || version !== readVersion.current) return { active: false, changed: false };
        const previous = previousJob.current;
        const finished = (ezgbBillsAvailable(next) || (next.stats.billsImported > 0 && ["waiting", "failed"].includes(next.status))) && next.jobId && completed.current !== next.jobId;
        const changed = utilitySavedBillsChanged(previous, next) || Boolean(finished && previous && (previous.jobId !== next.jobId || !ezgbBillsAvailable(previous)));
        return {
          active: ["queued", "running"].includes(next.status), changed,
          accept: () => {
            previousJob.current = next; setJob(next);
            if (finished) {
              completed.current = next.jobId;
              if (changed) initialRefresh.current = next.jobId;
            }
          },
        };
      },
      refresh: async () => { if (alive) await completion.current(); },
      onError: () => { if (alive) setFailed(true); },
      onHealthy: () => { if (alive) setFailed(false); },
    });
    loop.setActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", state => loop.setActive(state === "active"));
    return () => { alive = false; loop.dispose(); subscription.remove(); };
  // Explicit Retry restarts the focused read-only subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]));
  const progress = job ? ezgbProgress(job) : null;
  if (!progress || (job && ezgbBillsAvailable(job) && (!accountsLoaded || hasAccounts))) return failed ? <ReadNotice message="Utility connection progress couldn’t be checked." onRetry={() => setRetry(v => v + 1)} /> : null;
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/provider/ezgb", params: { resume: "1", ...(job?.jobId ? { job: job.jobId } : {}), ...(job?.connection?.expectedUtility ? { utilityName: job.connection.expectedUtility } : {}) } })} style={({ pressed }) => ({ backgroundColor: progress.attention ? colors.warningBg : colors.billSurface, padding: 18, borderRadius: 20, gap: 10, opacity: pressed ? 0.7 : 1 })}>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Ontario utilities · Green Button</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {progress.active && !failed ? <ActivityIndicator color={colors.primary} /> : <Feather name={progress.attention ? "alert-circle" : "check-circle"} size={22} color={progress.attention ? colors.warningForeground : colors.primary} />}
        <Text accessibilityLiveRegion="polite" style={[typography.section, { flex: 1, color: colors.foreground }]}>{progress.title}</Text>
      </View>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>{progress.detail}</Text>
      <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>View connection →</Text>
    </Pressable>
    {job?.jobId ? <UtilityAttemptRemoval key={job.jobId} jobId={job.jobId} active={progress.active}
      onStart={() => { readVersion.current += 1; }} onRemoved={() => { readVersion.current += 1; setJob(null); setFailed(false); setRetry(value => value + 1); }}
      onFailure={() => setRetry(value => value + 1)} /> : null}
    {failed ? <ReadNotice message="Couldn’t check for updates. This is the last known import status." onRetry={() => setRetry(v => v + 1)} /> : null}
  </View>;
}

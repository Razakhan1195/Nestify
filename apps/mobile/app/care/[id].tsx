import { DetailLoading } from "@/components/DetailLoading";
import { careScreen } from "@/lib/screen-state";
import { maintenanceFollowUp, localCareToday } from "@/lib/care-presentation";
import {JourneyHeading} from "@/components/JourneyUI";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QuietAction, ReadNotice } from "@/components/Brief";
import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import { completeCareTask, deleteCareTask, fetchCare, formatCareDate, formatCareRecurrence } from "@/lib/care-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

const statusMeta = {
  overdue: { label: "Overdue", bg: colors.criticalBg, fg: colors.criticalForeground },
  due_soon: { label: "Due soon", bg: colors.warningBg, fg: colors.warningForeground },
  upcoming: { label: "Upcoming", bg: colors.infoBg, fg: colors.infoForeground },
  completed: { label: "Completed", bg: colors.successBg, fg: colors.successForeground },
} as const;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

export default function CareDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const payload = useSyncExternalStore(careScreen.subscribe, careScreen.getSnapshot);
  const task = payload && !payload.needsOnboarding ? payload.tasks.find(item => item.id === id) ?? null : null;
  const accessRole = payload && !payload.needsOnboarding ? payload.accessRole ?? "owner" : "member";
  const loadVersion = useRef(0), focused = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [followUpDismissed,setFollowUpDismissed]=useState(false);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setError(null);
    try {
      const payload = await fetchCare(false);
      if (version !== loadVersion.current) return;
      const found = !payload.needsOnboarding && payload.tasks.find((item) => item.id === id);
      if (!found) setError("This care task is no longer available.");
    } catch (loadError) {
      if (version === loadVersion.current) setError(loadError instanceof ApiError ? loadError.message : "Could not load this care task.");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { focused.current = true; void load(); return () => { focused.current = false; loadVersion.current++; }; }, [load]));

  async function markDone() {
    if (!task || saving.current || !(task.canComplete ?? accessRole === "owner")) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await completeCareTask(task.id);
      loadVersion.current++;
      setConfirmation(result.alreadyCompleted ? "This task was already completed. Return to Care to see the current schedule." : result.nextDate ? `Next occurrence scheduled for ${formatCareDate(result.nextDate)}.` : "Task completed. No next occurrence was scheduled.");
      setError(null);
      if (focused.current) safeBack(router, "/(tabs)/care");
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "Could not complete this task.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!task) return;
    Alert.alert("Remove task?", task.cleaningRoutineId ? "This removes this task. To stop the whole routine, open Cleaning together and choose Stop routine." : "This removes the reminder from Rezlee.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteCareTask(task.id);
            safeBack(router, "/(tabs)/care");
          } catch (actionError) {
            setError(actionError instanceof ApiError ? actionError.message : "Could not remove this task.");
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (!task) {
    return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
      <ScreenNavigation title="Care task" fallback="/(tabs)/care"/>
      {error ? <View style={{padding:layout.screenHorizontal,gap:16}}><ReadNotice message={error} onRetry={()=>void load()}/><QuietAction label="Back to Care" onPress={()=>safeBack(router,"/(tabs)/care")}/></View> : <DetailLoading label="Loading this task…"/>}
    </SafeAreaView>;
  }

  const meta = statusMeta[task.displayStatus];
  return (
    <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenNavigation title="Care task" fallback="/(tabs)/care" disabled={busy}/>
      <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingVertical: spacing.xl, gap: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.full, backgroundColor: meta.bg }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: meta.fg }}>{task.status!=="completed" && task.due_date===localCareToday() ? "Today" : meta.label}</Text>
          </View>
          <JourneyHeading title={task.title}/>
          {task.description ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{task.description}</Text> : null}
        </View>

        <Surface tone="raised" style={{ paddingHorizontal: spacing.lg, paddingVertical: 0 }}>
          <DetailRow label="Due" value={formatCareDate(task.due_date)} />
          {task.assigneeName ? <DetailRow label="Assigned to" value={task.assigneeName} /> : null}
          <DetailRow label="Type" value={task.category || "Home"} />
          <DetailRow label="Repeat" value={formatCareRecurrence(task.recurrence)} />
          <DetailRow label="Priority" value={task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : "Normal"} />
        </Surface>

        {accessRole === "owner" && task.displayStatus !== "completed" ? <QuietAction label="Change the date or details" onPress={() => router.push({ pathname: "/care/edit-task", params: { id: task.id } })} /> : null}
        {task.cleaningRoutineId ? <><DetailRow label="Routine" value={task.routineState ?? "Unavailable"} />{accessRole === "owner" ? <QuietAction label="Edit routine and future repeats" onPress={() => router.push({ pathname: "/care/custom-routine", params: { id: task.cleaningRoutineId! } })} /> : null}</> : null}
        {confirmation ? <QuietAction label="Back to Care" onPress={() => safeBack(router, "/(tabs)/care")} /> : null}
        {error ? <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text> : null}

        {task.displayStatus !== "completed" ? (
          (task.canComplete ?? accessRole === "owner") ? <Button label="Complete task" onPress={markDone} loading={busy} /> : <Text style={[typography.body,{color:colors.mutedForeground}]}>This task is assigned to another household member. They or the household owner can mark it complete.</Text>
        ) : (
          <Surface tone="accent" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Feather name="check-circle" size={20} color={colors.successForeground} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }}>{confirmation ?? "Completed. Saved in your care history."}</Text>
          </Surface>
        )}
        {task.status==="completed" && accessRole==="owner" && maintenanceFollowUp(task) && !followUpDismissed ? <Surface tone="raised" style={{gap:12}}>
          <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Follow up on this task</Text>
          <Text style={[typography.body,{color:colors.mutedForeground}]}>If you found a problem while completing this task, record it in Repair help.</Text>
          <Button label="Open Repair help" onPress={()=>router.push({pathname:"/repairs",params:{start:"1",careTaskTitle:task.title}})}/>
          <QuietAction label="Close follow-up" onPress={()=>setFollowUpDismissed(true)}/>
          <Text style={[typography.caption,{color:colors.mutedForeground}]}>A description or photo can support guidance. It cannot confirm that equipment or your home is safe.</Text>
        </Surface> : null}
        {accessRole==="owner"?<Pressable accessibilityRole="button" accessibilityLabel="Remove task" disabled={busy} onPress={confirmDelete} style={{minHeight:48,justifyContent:"center",alignItems:"center"}}><Text style={[typography.body,{color:colors.criticalForeground}]}>Remove task</Text></Pressable>:null}
      </ScrollView>
    </SafeAreaView>
  );
}


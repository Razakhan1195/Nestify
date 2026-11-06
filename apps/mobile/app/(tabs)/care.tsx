import { CareFeedback } from "@/components/CareFeedback";
import { careScreen } from "@/lib/screen-state";
import { useTabScrollTop } from "@/lib/use-tab-scroll-top";
import { careTaskSummary, compareCareTasks, localCareToday } from "@/lib/care-presentation";
import { CleaningFeature } from "@/components/CleaningUI";
import {JourneyHeading,JourneyPanel,JourneyEntry} from "@/components/JourneyUI";
import { Feather } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { acknowledgeCareSave } from "@/lib/care-save";
import { CollectionToolbar, CollectionLoading, CollectionAddSheet } from "@/components/CollectionUI";
import { Button } from "@/components/Button";
import { QuietAction } from "@/components/Brief";
import { CollectionFilter } from "@/components/CollectionPages";
import { FilterChips } from "@/components/FilterChips";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import {
  careFilters,
  completeCareTask,
  fetchCare,
  formatCareDate,
  formatCareRecurrence,
  type CareFilter,
  type CareTask,
} from "@/lib/care-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";

const statusMeta = {
  overdue: { label: "Overdue", bg: colors.criticalBg, fg: colors.criticalForeground },
  due_soon: { label: "Due soon", bg: colors.warningBg, fg: colors.warningForeground },
  upcoming: { label: "Upcoming", bg: colors.infoBg, fg: colors.infoForeground },
  completed: { label: "Completed", bg: colors.successBg, fg: colors.successForeground },
} as const;
function CareRow({ error, task, onComplete, onOpen, busy, blocked, canComplete }: { error?: string; blocked: boolean; canComplete: boolean; busy: boolean; task: CareTask; onComplete: (task: CareTask) => void; onOpen: (task: CareTask) => void }) {
  const meta = statusMeta[task.displayStatus];
  const done = task.displayStatus === "completed";
  return (
    <View
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: spacing.md,
        paddingVertical: spacing.lg,
        paddingHorizontal:14,backgroundColor:colors.surface,borderRadius:18,
      }}
    >

      <Pressable accessibilityRole="button" accessibilityLabel={`${task.title}. View task`} onPress={()=>onOpen(task)} style={({pressed})=>({flexDirection:"row",alignItems:"center",gap:8,minHeight:44,opacity:pressed?0.7:1})}>
       <View style={{flex:1,gap:7}}>
        <Text style={{ ...typography.body, fontWeight: "600", color: colors.foreground, textDecorationLine: done ? "line-through" : "none" }}>{task.title}</Text>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>{[formatCareDate(task.due_date), formatCareRecurrence(task.recurrence), task.category].filter(Boolean).join(" · ")}</Text>
        <View style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8}}>
         <View style={{paddingHorizontal:8,paddingVertical:4,borderRadius:radii.full,backgroundColor:meta.bg}}><Text style={{fontSize:11,fontWeight:"600",color:meta.fg}}>{!done && task.due_date === localCareToday() ? "Today" : meta.label}</Text></View>
         {task.assigneeName?<Text style={[typography.caption,{color:colors.primary,flexShrink:1}]}>{task.rotating?"Rotating · ":""}{task.assigneeName}</Text>:null}
        </View>
       </View>
       <Feather accessible={false} name="chevron-right" size={16} color={colors.mutedForeground}/>
      </Pressable>
      <Pressable
        disabled={done || busy || blocked || !canComplete}
        accessibilityRole="button"
        accessibilityLabel={done ? `${task.title} completed` : canComplete ? `Mark ${task.title} complete` : `${task.title} is assigned to another household member`}
        accessibilityState={{disabled:done || busy || blocked || !canComplete,busy:busy}}
        onPress={(event) => {
          event.stopPropagation();
          if (!done && !busy && canComplete) onComplete(task);
        }}
        style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start", borderRadius: 12, backgroundColor: done || !canComplete ? colors.surfaceSubtle : colors.primary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", opacity: blocked && !busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator accessibilityLabel="Saving completion" size="small" color={colors.primaryForeground}/> : <Feather accessible={false} name={canComplete || done ? "check" : "user"} size={18} color={done || !canComplete ? colors.primary : colors.primaryForeground} />}
        <Text style={[typography.meta, {fontWeight:"600",color:done || !canComplete ? colors.primary : colors.primaryForeground}]}>{busy ? "Saving…" : done ? "Completed" : canComplete ? "Complete" : "Assigned to another member"}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={[typography.meta,{color:colors.criticalForeground}]}>{error}</Text> : null}
    </View>
  );
}
export default function CareScreen() {
  const router = useRouter();
  const scroll = useRef<FlatList<CareTask>>(null);
  useTabScrollTop("care", scroll);
  const [adding,setAdding]=useState(false);
  const params = useLocalSearchParams<{ routineAdded?: string; planAdded?: string; reminderAdded?: string; savedRequestId?: string; routineId?: string }>();
  useEffect(() => {
    if (params.savedRequestId && (params.routineAdded || params.planAdded || params.reminderAdded)) void acknowledgeCareSave(params.reminderAdded ? "reminder" : params.routineAdded ? "routine" : "plan", params.savedRequestId);
  }, [params.savedRequestId, params.routineAdded, params.planAdded, params.reminderAdded]);
  const payload = useSyncExternalStore(careScreen.subscribe, careScreen.getSnapshot);
  const [filter, setFilter] = useState<CareFilter>("open");
  const [expandedTaskScope, setExpandedTaskScope] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completing = useRef(false);
  const loadVersion = useRef(0);
  const [completionError, setCompletionError] = useState<{id:string;message:string} | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    const version = ++loadVersion.current;
    if (refresh) setIsRefreshing(true);
    setError(null);
    try {
      await fetchCare(refresh);
    } catch (loadError) {
      if (version === loadVersion.current) setError(loadError instanceof ApiError ? loadError.message : "We could not load Care. Please try again.");
    } finally {
      if (version === loadVersion.current) { setIsRefreshing(false); }
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return () => { loadVersion.current++; setIsRefreshing(false); }; }, [load]));

  const tasks = useMemo(() => payload && !payload.needsOnboarding ? payload.tasks : [], [payload]);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => (filter === "all" || (filter === "open" ? task.displayStatus !== "completed" : task.displayStatus === filter)) && (!params.routineId || task.cleaningRoutineId === params.routineId) && (!person || (person === "unassigned" ? !task.assignedMemberId : task.assignedMemberId === person))).sort(compareCareTasks),
    [tasks, filter, params.routineId, person],
  );
  const taskScope = [filter, person ?? "", params.routineId ?? ""].join(":");
  const showAllTasks = expandedTaskScope === taskScope;
  const displayedTasks = showAllTasks ? visibleTasks : visibleTasks.slice(0, 5);
  const accessRole = payload && !payload.needsOnboarding ? payload.accessRole ?? "owner" : "owner";
  const isOwner = accessRole === "owner";
  const people = [...new Map(tasks.filter(t=>t.assignedMemberId && t.assigneeName).map(t=>[t.assignedMemberId!,t.assigneeName!] as const)).entries()];


  async function handleComplete(task: CareTask) {
    if (completing.current || !(task.canComplete ?? isOwner)) return;
    completing.current = true;
    setBusyId(task.id);
    try {
      setCompletionError(null);
      await completeCareTask(task.id);
    } catch (completeError) {
      setCompletionError({id:task.id,message:completeError instanceof ApiError ? completeError.message : "Could not confirm completion. Try again."});
    } finally {
      completing.current = false;
      setBusyId(null);
    }
  }
  if (!payload && !error) {
    return (
      <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
        <CollectionLoading title="Care" description="Tasks, reminders and household routines." label="Loading tasks…"/>
      </SafeAreaView>
    );
  }

  if (error && !payload) {
    return (
      <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing["2xl"] }}>
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={[typography.body, { color: colors.foreground, textAlign: "center" }]}>{error}</Text>
          <QuietAction label="Try again" onPress={()=>void load()}/>
        </View>
      </SafeAreaView>
    );
  }

  if (!payload || payload.needsOnboarding) return <Redirect href="/onboarding" />;

  return (
    <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
      <FlatList ref={scroll} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
        data={displayedTasks}
        keyExtractor={(task) => task.id}
        contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingTop: layout.screenTop, paddingBottom: spacing["4xl"] }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.xl, marginBottom: spacing.lg }}>
            {params.reminderAdded ? <View accessibilityLiveRegion="polite" style={{padding:16,borderRadius:14,backgroundColor:colors.successBg}}><Text style={[typography.body,{color:colors.successForeground}]}>Reminder saved. Review its date below.</Text><QuietAction label="Close confirmation" onPress={()=>router.setParams({reminderAdded:undefined})}/></View>:null}
            {params.planAdded ? <View style={{ padding: 16, borderRadius: 14, backgroundColor: colors.successBg }}><Text style={[typography.body, { color: colors.successForeground }]}>{params.planAdded} maintenance tasks added. Review their dates below.</Text><QuietAction label="Close confirmation" onPress={() => router.setParams({ planAdded: undefined })} /></View> : null}
            {params.routineAdded ? (
              <Surface tone="accent" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="check-circle" size={19} color={colors.successForeground} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Cleaning routine is active</Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>{params.routineAdded} recurring {params.routineAdded === "1" ? "task was" : "tasks were"} added below. Complete a task and Rezlee schedules its next occurrence automatically.</Text><QuietAction label="Close confirmation" onPress={() => router.setParams({ routineAdded: undefined })} />
                </View>
              </Surface>
            ) : null}

            <CollectionToolbar title="Care" description="Tasks, reminders and household routines." label="Add to Care" onAdd={isOwner?()=>setAdding(true):undefined}/>
            {!params.routineId?<CleaningFeature compact={tasks.length>0} canCreate={isOwner} active={tasks.some(t=>t.cleaningRoutineId)||payload.adoption?.cleaning===true} onPress={()=>router.push(isOwner&&!tasks.some(t=>t.cleaningRoutineId)&&!payload.adoption?.cleaning?"/care/custom-routine":"/care/routines")}/>:null}
            <View style={{gap:12}}><Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>{params.routineId?"Routine tasks":"Household tasks"}</Text>{visibleTasks.length?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{careTaskSummary(visibleTasks)}</Text>:null}
              {tasks.length ? <QuietAction label="Review or dismiss Care reminders" onPress={() => router.push({ pathname: "/needs-you", params: { source: "care" } })}/> : null}
              {params.routineId?<QuietAction label="Show all Care tasks" onPress={()=>router.setParams({routineId:undefined})}/>:null}
              {tasks.length?<FilterChips options={careFilters} selected={filter} onSelect={setFilter}/>:null}
              {people.length?<CollectionFilter label="Assigned to" options={[{value:"",label:"Everyone"},...people.map(([id,name])=>({value:id,label:name})),{value:"unassigned",label:"Anyone can help"}]} selected={person??""} onSelect={value=>setPerson(value||null)}/>:null}
            </View>
            {error ? <Text accessibilityRole="alert" style={[typography.meta,{color:colors.criticalForeground}]}>{error}</Text> : null}
          </View>
        }
        ListFooterComponent={<View style={{gap:12,marginTop:28}}>
            {visibleTasks.length > 5 ? <Button variant="secondary" label={showAllTasks ? "Show fewer tasks" : `Show all ${visibleTasks.length} tasks`} onPress={() => setExpandedTaskScope(showAllTasks ? null : taskScope)} /> : null}
            <View style={{gap:10}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>More ways to care for your home</Text>
              {isOwner?<JourneyEntry icon="calendar" title="Reminders" detail="Bins, filters, an appointment—give it a date." onPress={()=>router.push("/care/add")}/>:null}
              {isOwner?<JourneyEntry icon="sun" title="Home maintenance" detail="A practical plan for the parts of your home you look after." onPress={()=>router.push("/care/plan")}/>:null}
              <JourneyEntry icon="tool" title="Repair help" detail="Understand the issue, plan the next step and keep the history." onPress={()=>router.push("/repairs")}/>
              {isOwner?<JourneyEntry icon="file-text" title="Quotes & purchase decisions" detail="Compare quotes, check compatibility or weigh repair against replacement." onPress={()=>router.push("/quotes")}/>:null}
            </View>

          {!isOwner?<Text style={[typography.meta,{color:colors.mutedForeground}]}>You can complete tasks assigned to you or left unassigned. Your household owner manages routines and assignments.</Text>:null}
          <QuietAction label="View routines and their schedules" onPress={()=>router.push("/care/routines")}/>

        </View>}
        ListEmptyComponent={<JourneyPanel tone="soft">
          <JourneyHeading title={tasks.length?"No tasks in this view":isOwner?"No tasks yet":"No shared tasks yet"} detail={tasks.length?"Try another filter to see your saved tasks.":isOwner?"Start with one thing you want to remember. Set a date, and repeat it if needed.":"Shared tasks will appear here when your household owner adds them."}/>
          {!tasks.length&&isOwner?<Button label="Add a task or reminder" onPress={()=>router.push("/care/add")}/>:null}
        </JourneyPanel>}
        renderItem={({ item, index }) => (
          <View style={{ gap: 10 }}>
            {index === 0 || displayedTasks[index-1].displayStatus !== item.displayStatus ? <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,paddingTop:index===0?0:12}]}>{statusMeta[item.displayStatus].label} · {visibleTasks.filter(task => task.displayStatus === item.displayStatus).length}</Text> : null}
            <CareRow error={completionError?.id===item.id?completionError.message:undefined} canComplete={item.canComplete ?? isOwner} busy={busyId === item.id} blocked={busyId !== null} task={item} onComplete={handleComplete} onOpen={(task) => router.push(`/care/${task.id}`)} />
          </View>
        )}
      />
      <CareFeedback/>
      <CollectionAddSheet title="Add to Care" visible={adding} onClose={()=>setAdding(false)} choices={[
       {key:"task",title:"Task or reminder",detail:"Set a date and repeat if needed.",icon:"calendar",onPress:()=>router.push("/care/add")},
       {key:"routine",title:"Cleaning together",detail:"Pick practical jobs and share the load.",icon:"repeat",onPress:()=>router.push("/care/routine")},
       {key:"plan",title:"Seasonal upkeep",detail:"A plan for the areas you look after.",icon:"tool",onPress:()=>router.push("/care/plan")},
      ]}/>
    </SafeAreaView>
  );
}

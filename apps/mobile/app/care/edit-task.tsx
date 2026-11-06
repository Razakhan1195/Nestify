import { FormScrollView } from "@/components/FormScrollView";
import {usePreventRemove} from "expo-router/react-navigation";
import {JourneyHeading,JourneyPanel} from "@/components/JourneyUI";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { Button } from "@/components/Button";
import { QuietAction, ReadNotice } from "@/components/Brief";
import { fetchCare, type CareTask } from "@/lib/care-data";
import { apiPost } from "@/lib/api";
import { colors, typography } from "@/theme/tokens";
type Fields = { title: string; category: string; due_date: string; recurrence: string };
export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter(), navigation=useNavigation(), lock = useRef(false);
  const [task, setTask] = useState<CareTask | null>(null), [expected, setExpected] = useState<Fields | null>(null), [values, setValues] = useState<Fields | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [saved,setSaved]=useState(false);
  const dirty=Boolean(values&&expected&&JSON.stringify(values)!==JSON.stringify(expected));
  usePreventRemove((dirty&&!saved)||busy,({data})=>{if(busy){Alert.alert("Saving task","Wait for this save to finish.");return;}Alert.alert("Leave without saving?","Your saved task stays unchanged.",[{text:"Keep editing",style:"cancel"},{text:"Discard edits",style:"destructive",onPress:()=>navigation.dispatch(data.action)}]);});
  useEffect(()=>{if(saved&&!busy)router.replace({pathname:"/care/[id]",params:{id}});},[saved,busy,id,router]);
  function reload(){if(dirty)Alert.alert("Reload the saved task?","This replaces your unsaved edits.",[{text:"Keep editing",style:"cancel"},{text:"Reload",onPress:()=>setAttempt(v=>v+1)}]);else setAttempt(v=>v+1);}
  useEffect(() => { let active = true; void fetchCare().then(payload => {
    if (!active) return;
    if (payload.needsOnboarding || payload.accessRole === "member") throw Error("Only the household owner can edit tasks.");
    const current = payload.tasks.find(value => value.id === id && value.status !== "completed");
    if (!current) throw Error("This task is no longer open.");
    const fields = { title: current.title, category: current.category ?? "", due_date: current.due_date ?? "", recurrence: current.recurrence ?? "" };
    setTask(current); setExpected(fields); setValues(fields); setError(null);
  }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Couldn’t load task."); }); return () => { active = false; }; }, [id, attempt]);
  async function save() {
    if (!values || !expected || lock.current) return; lock.current = true; setBusy(true);
    try { await apiPost(`/api/mobile/v1/care/${id}`, { expected, values }); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t save this task."); } finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}><ScreenNavigation title="Edit task" fallback="/(tabs)/care" /><View style={{flex:1}} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20 }}>
    {error ? <ReadNotice message={error} busy={busy} onRetry={reload} /> : null}
    {values ? <><JourneyHeading title="Make the task fit your day."/><Text style={[typography.body, { color: colors.mutedForeground }]}>{task?.cleaningRoutineId ? "Changes apply to this open occurrence. Edit the routine to change future repeats." : "Changes apply to this open task and its subsequent repeats. Completed history stays unchanged."}</Text>
      <JourneyPanel><TextField label="Task" value={values.title} onChangeText={title => setValues({ ...values, title })} maxLength={140} editable={!busy} />
      <TextField label="Room or category" value={values.category} onChangeText={category => setValues({ ...values, category })} maxLength={80} editable={!busy} />
      <DateField label="Due date" value={values.due_date} onChange={due_date => { if (!busy) setValues({ ...values, due_date }); }} optional />
      {!task?.cleaningRoutineId ? <View style={{gap:12}}><Text style={[typography.section, { color: colors.foreground }]}>Repeat</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[{ value: "", label: "One-time" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Every two weeks" }, { value: "monthly", label: "Monthly" }].map(item => <QuietAction key={item.label} label={(values.recurrence === item.value ? "✓ " : "") + item.label} disabled={busy} onPress={() => setValues({ ...values, recurrence: item.value })} />)}</View></View> : null}
      </JourneyPanel><Button label="Save task" disabled={busy||!dirty||!values.title.trim() || !values.category.trim()} loading={busy} onPress={() => void save()} />
    </> : !error ? <Text style={[typography.body, { color: colors.mutedForeground }]}>Loading task…</Text> : null}
  </FormScrollView></View></SafeAreaView>;
}

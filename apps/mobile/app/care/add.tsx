import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {CareChoice} from "@/components/CleaningUI";
import {JourneyHeading,JourneyDisclosure} from "@/components/JourneyUI";
import {NavigationButton} from "@/components/NavigationButton";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { QuietAction } from "@/components/Brief";
import { pendingCareReminder, resetRemovedCareReminder } from "@/lib/care-save";
import { TextField } from "@/components/TextField";
import { ApiError } from "@/lib/api";
import { createCareTask } from "@/lib/care-data";
import { layout, radii, spacing, typography } from "@/theme/tokens";
import { usePreventRemove } from "expo-router/react-navigation";
import { safeBack } from "@/lib/navigation";

const categories = ["HVAC", "Plumbing", "Electrical", "Exterior", "Safety", "Appliance", "General"] as const;
const recurrenceOptions = [
  { value: "", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "biannual", label: "Twice a year" },
  { value: "annual", label: "Yearly" },
] as const;

function ChoiceChips({ values, selected, onSelect, disabled=false }: { values: readonly string[]; selected: string; onSelect: (value: string) => void; disabled?:boolean }) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {values.map((value) => (
        <Pressable
          key={value}
          accessibilityRole="radio" accessibilityLabel={value} accessibilityState={{checked:selected===value,disabled}} disabled={disabled}
          onPress={() => onSelect(value)}
          style={{ minHeight:44,justifyContent:"center",paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radii.full, backgroundColor: selected === value ? colors.primary : colors.secondary }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: selected === value ? colors.primaryForeground : colors.secondaryForeground }}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export default function AddCareTaskScreen() {
  const { colors } = useTheme();

  const router = useRouter();
  const navigation = useNavigation();
  const saveLock = useRef(false);
  const [saved, setSaved] = useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [recovered,setRecovered]=useState(false);
  const [removed,setRemoved]=useState(false);
  const [details,setDetails]=useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applyDraft=useCallback((draft:Record<string,string>|null)=>{
    if(draft){setTitle(draft.title);setCategory(draft.category);setDueDate(draft.due_date);setRecurrence(draft.recurrence);setDescription(draft.description);setRecovered(true);}
    setError(null);setReady(true);
  },[]);
  function restore(){return pendingCareReminder().then(applyDraft).catch(()=>setError("Could not check your previous save. Try again before adding another reminder."));}
  useEffect(()=>{
    let active=true;
    void pendingCareReminder().then(draft=>{if(active)applyDraft(draft);}).catch(()=>{if(active)setError("Could not check your previous save. Try again before adding another reminder.");});
    return()=>{active=false;};
  },[applyDraft]);
  const dirty = Boolean(title.trim() || dueDate.trim() || description.trim() || recurrence || category !== "General");
  usePreventRemove((dirty || saving) && !saved, ({ data }) => {
    if (saving) { Alert.alert("Saving your task", "Please wait for this to finish."); return; }
    Alert.alert("Discard this reminder?", "Your changes haven’t been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { if (saved) router.replace({pathname:"/(tabs)/care",params:{reminderAdded:"1",savedRequestId:saved}}); }, [saved, router]);
  async function handleSave() {
    if (saveLock.current || !ready || !title.trim()) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await createCareTask({
        title: title.trim(),
        category,
        due_date: dueDate.trim(),
        recurrence,
        priority: "normal",
        description: description.trim(),
        relevance: "",
      });
      setSaved(result.requestId);
    } catch (saveError) {
      if(saveError instanceof ApiError && saveError.status===410)setRemoved(true);
      setError(saveError instanceof ApiError ? saveError.message : "Could not add this care task.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View  style={{ flex: 1 }}>
        <FormScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingVertical: spacing.xl, gap: spacing.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{flex:1}}><JourneyHeading title="One less thing to remember." detail="Give a task a date. Repeat it if you need to."/></View>
            <NavigationButton onPress={() => safeBack(router, "/(tabs)/care")} label="Close care task" close/>
          </View>

          {!ready ? <View style={{gap:12}}>{error?<QuietAction label="Check previous save again" onPress={()=>void restore()}/>:<ActivityIndicator accessibilityLabel="Checking previous save"/>}</View>:null}
          {recovered?<Text style={[typography.body,{color:colors.mutedForeground}]}>Your previous save is ready to retry. Keep the same details to recover it without adding a second task.</Text>:null}
          <View pointerEvents={saving||!ready?"none":"auto"} style={{ gap: spacing.lg }}>
            {!recovered&&!title?<View style={{gap:10}}><Text style={[typography.section,{color:colors.foreground}]}>Start with something familiar</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{["Put the bins out","Replace a filter","Book a service","Water the plants"].map(value=><CareChoice key={value} label={value} selected={false} onPress={()=>setTitle(value)}/>)}</View></View>:null}
            <TextField editable={ready&&!saving} maxLength={140} label="Task" value={title} onChangeText={setTitle} placeholder="What would you like to remember?" />
            <DateField label="Due date (optional)" value={dueDate} onChange={setDueDate} optional />
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Repeat</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {recurrenceOptions.map((option) => (
                  <Pressable key={option.value || "once"} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:recurrence===option.value,disabled:saving||!ready}} disabled={saving||!ready} onPress={() => setRecurrence(option.value)} style={{ minHeight:44,justifyContent:"center",paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radii.full, backgroundColor: recurrence === option.value ? colors.primary : colors.secondary }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: recurrence === option.value ? colors.primaryForeground : colors.secondaryForeground }}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <JourneyDisclosure label="Add a note or category" open={details} onToggle={()=>setDetails(v=>!v)}>
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Type</Text>
              <ChoiceChips values={categories} selected={category} onSelect={setCategory} disabled={saving} />
            </View>
            <TextField editable={ready&&!saving} maxLength={1000} label="Notes (optional)" value={description} onChangeText={setDescription} placeholder="Anything useful to remember" multiline style={{ minHeight: 96, paddingTop: 14, textAlignVertical: "top" }} />
            </JourneyDisclosure>
          </View>

          {error ? <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text> : null}
          {removed ? <QuietAction label="Start a new reminder" onPress={()=>void resetRemovedCareReminder().then(()=>{setRemoved(false);setRecovered(false);setError(null);}).catch(()=>setError("Could not clear the old save. Please try again."))}/> : null}
          <Button label="Save reminder" onPress={handleSave} loading={saving} disabled={removed || !ready || saving || !title.trim() || !category} />
        </FormScrollView>
      </View>
    </SafeAreaView>
  );
}



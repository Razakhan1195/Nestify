import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {FormScrollView} from "@/components/FormScrollView";
import {JourneyHeading} from "@/components/JourneyUI";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationButton } from "@/components/NavigationButton";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { TextField } from "@/components/TextField";
import { ApiError } from "@/lib/api";
import { fetchCarePlanContext, generateCarePlan, saveCarePlan, formatCareDate, formatCareRecurrence, type CarePlanTask, type CarePlanPreferences, type CarePlanContext } from "@/lib/care-data";
import { readMaintenanceDraft, writeMaintenanceDraft, clearMaintenanceDraft, type MaintenanceDraft } from "@/lib/maintenance-draft";
import { radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

const responsibilities = [{id:"self",label:"I arrange upkeep"},{id:"landlord",label:"My landlord handles repairs"},{id:"building",label:"Building management helps"}] as const;
const intervals = [{id:"",label:"One time"},{id:"monthly",label:"Monthly"},{id:"quarterly",label:"Every 3 months"},{id:"biannual",label:"Every 6 months"},{id:"annual",label:"Yearly"}];
const makeCard = (colors: Colors) => ({padding:spacing.lg,borderRadius:radii["2xl"],backgroundColor:colors.surfaceRaised,gap:spacing.md});
function firstDate() { const d=new Date(); d.setDate(d.getDate()+7); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
export default function CarePlanScreen() {
  const { colors, premium } = useTheme();
  const card = useThemeMemo(() => makeCard(colors), [colors, premium]);

  const router=useRouter(), busy=useRef(false), draftWrites=useRef(Promise.resolve()), saved=useRef(false);
  const latestDraft=useRef<{homeId:string;draft:MaintenanceDraft}|null>(null);
  const [context,setContext]=useState<CarePlanContext|null>(null);
  const [preferences,setPreferences]=useState<CarePlanPreferences>({responsibility:"self",areas:[],startDate:firstDate()});
  const [tasks,setTasks]=useState<CarePlanTask[]>([]),[selected,setSelected]=useState<Record<number,boolean>>({});
  const [review,setReview]=useState(false),[editing,setEditing]=useState<number|null>(null);
  const [loading,setLoading]=useState(true),[generating,setGenerating]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null),[draftError,setDraftError]=useState(false),[restored,setRestored]=useState(false);
  const [ready,setReady]=useState(false),[uncertain,setUncertain]=useState(false);
  const [savedResult,setSavedResult]=useState<{count:number;requestId:string}|null>(null);
  const blocked=generating||saving||uncertain;
  usePreventRemove(saving,()=>Alert.alert("Saving your plan","Wait for the save result. Your choices are being kept."));
  useEffect(()=>{
    if(savedResult&&!saving)router.replace({pathname:"/(tabs)/care",params:{planAdded:String(savedResult.count),savedRequestId:savedResult.requestId}});
  },[savedResult,saving,router]);
  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      const ctx=await fetchCarePlanContext();setContext(ctx);
      const draft=await readMaintenanceDraft(ctx.homeId);
      if(draft) {setPreferences(draft.preferences);setTasks(draft.tasks);setSelected(draft.selected);setReview(draft.review);setUncertain(draft.savePending===true);setRestored(true);}
      else setPreferences(p=>({...p,responsibility:ctx.responsibility}));
      setReady(true);
    }catch(e){setError(e instanceof ApiError?e.message:"We couldn't load your plan. Check your connection and try again.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>{void load();},0);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>{
    if(ready&&context&&!saved.current)latestDraft.current={homeId:context.homeId,draft:{preferences,tasks,selected,review,savePending:uncertain}};
  },[preferences,tasks,selected,review,uncertain,ready,context]);
  useEffect(()=>()=>{
    const latest=latestDraft.current;
    if(latest&&!saved.current)draftWrites.current=draftWrites.current.then(()=>saved.current?undefined:writeMaintenanceDraft(latest.homeId,latest.draft)).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(!ready||!context||saving||saved.current)return;
    const snapshot={preferences,tasks,selected,review,savePending:uncertain};
    const timer=setTimeout(()=>{
      draftWrites.current=draftWrites.current.then(()=>saved.current?undefined:writeMaintenanceDraft(context.homeId,snapshot))
        .then(()=>setDraftError(false)).catch(()=>setDraftError(true));
    },200);
    return()=>clearTimeout(timer);
  },[preferences,tasks,selected,review,uncertain,ready,context,saving]);
  const chosen=useMemo(()=>tasks.filter((t,i)=>selected[i]&&!t.alreadyAdded),[tasks,selected]);
  const update=(index:number,patch:Partial<CarePlanTask>)=>setTasks(all=>all.map((t,i)=>i===index?{...t,...patch}:t));
  async function prepare() {
    if(busy.current||uncertain||!preferences.areas.length)return;
    busy.current=true;setGenerating(true);setError(null);
    try {
      const result=await generateCarePlan(preferences);
      setTasks(result.tasks);setSelected(Object.fromEntries(result.tasks.map((t,i)=>[i,!t.alreadyAdded&&!t.completedTask])));
      setReview(true);setEditing(null);setRestored(false);
    }catch(e){setError(e instanceof ApiError?e.message:"Couldn't prepare your choices. Your draft is kept. Try again.");}
    finally{busy.current=false;setGenerating(false);}
  }
  async function addSelected() {
    if(!chosen.length||busy.current||!context)return;
    if(chosen.some(t=>!t.title.trim()||!t.due_date)){setError("Give each selected task a title and date.");return;}
    busy.current=true;setSaving(true);setError(null);
    let attempted=false;
    try {
      await draftWrites.current;
      await writeMaintenanceDraft(context.homeId,{preferences,tasks,selected,review,savePending:true});
      latestDraft.current={homeId:context.homeId,draft:{preferences,tasks,selected,review,savePending:true}};
      attempted=true;
      const result=await saveCarePlan(chosen);
      saved.current=true;
      await draftWrites.current;
      await clearMaintenanceDraft(context.homeId).catch(()=>{});
      setSavedResult({count:result.count,requestId:result.requestId});
    }catch(e){
      const legacyUncertain=e instanceof ApiError&&e.status===400&&e.message.startsWith("Could not confirm this save.");
      const rejected=e instanceof ApiError&&[400,401,403,404,409].includes(e.status)&&!legacyUncertain;
      const pending=(uncertain||attempted)&&!rejected;
      setUncertain(pending);
      const snapshot={preferences,tasks,selected,review,savePending:pending};
      latestDraft.current={homeId:context.homeId,draft:snapshot};
      await writeMaintenanceDraft(context.homeId,snapshot).catch(()=>setDraftError(true));
      setError(pending?null:e instanceof ApiError?e.message:"We couldn’t keep your choices on this device. Try saving again.");
    }
    finally{busy.current=false;setSaving(false);}
  }
  function toggleArea(id:string) {setPreferences(p=>({...p,areas:p.areas.includes(id)?p.areas.filter(a=>a!==id):[...p.areas,id]}));}
  function choice(id:string,label:string,active:boolean,onPress:()=>void) {
    return <Pressable key={id} accessibilityRole="radio" accessibilityState={{checked:active,disabled:blocked}} disabled={blocked} onPress={onPress}
      style={{minHeight:44,paddingHorizontal:14,paddingVertical:12,borderRadius:radii.lg,backgroundColor:active?colors.accent:colors.surfaceRaised,borderWidth:1,borderColor:active?colors.primary:colors.border}}>
      <Text style={[typography.caption,{color:colors.foreground,fontWeight:"600"}]}>{label}</Text>
    </Pressable>;
  }
  return <SafeAreaView edges={["top","left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
    <FormScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,paddingBottom:spacing["4xl"],gap:spacing.xl}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:spacing.md}}>
        <NavigationButton label="Close" close disabled={saving} onPress={()=>safeBack(router,"/(tabs)/care")}/>
        <View style={{flex:1}}><Text style={[typography.title,{color:colors.foreground}]}>{review?"Your upkeep plan":"Seasonal upkeep"}</Text>
          <Text style={[typography.meta,{color:colors.mutedForeground}]}>{context?.homeName ?? "Maintenance plan"}</Text></View>
      </View>
      {loading?<View style={{paddingVertical:40,gap:spacing.md,alignItems:"center"}}><ActivityIndicator color={colors.primary}/><Text style={typography.body}>Loading your home…</Text></View>:null}
      {error?<View accessibilityRole="alert" style={{...card,backgroundColor:colors.criticalBg}}><Text style={{color:colors.criticalForeground}}>{error}</Text>{!context?<Button label="Try again" onPress={()=>void load()}/>:null}</View>:null}
      {draftError?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>We couldn’t keep this draft on your device. Stay here until you save, or retry after freeing device storage.</Text>:null}
      {uncertain?<View accessibilityLiveRegion="polite" style={{...card,backgroundColor:colors.warningBg}}><Text style={[typography.body,{color:colors.warningForeground}]}>Your last save needs confirmation. We’ll check the same tasks so they aren’t added twice.</Text><Button label="Check saved plan" loading={saving} onPress={()=>void addSelected()}/></View>:null}
      {restored?<Text style={[typography.caption,{color:colors.primary}]}>Your unfinished plan is restored.</Text>:null}
      {!loading&&context&&!review?<View style={{gap:spacing.xl}}>
        <View style={{...card,backgroundColor:colors.accent}}>
          <Feather name="calendar" size={28} color={colors.primary}/>
          <JourneyHeading eyebrow="SEASONAL UPKEEP" title="A little now. Fewer surprises later." detail="A plan for your place—not a list of every possible chore. Choose what you look after; we’ll suggest checks for you to review."/>
        </View>
        <View style={{gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>What do you look after?</Text>
          <Text style={[typography.caption,{color:colors.mutedForeground}]}>We’ll tailor tasks to your responsibilities.</Text>
          {responsibilities.map(r=>choice(r.id,r.label,preferences.responsibility===r.id,()=>setPreferences(p=>({...p,responsibility:r.id}))))}
        </View>
        <View style={{gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>What would you like to look after?</Text>
          <Text style={[typography.caption,{color:colors.mutedForeground}]}>Only select what applies. You can add your own task in Care.</Text>
          {context.areas.map(area=>{const active=preferences.areas.includes(area.id);return <Pressable key={area.id} accessibilityRole="checkbox" accessibilityState={{checked:active,disabled:blocked}} disabled={blocked} onPress={()=>toggleArea(area.id)}
            style={{...card,flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:active?colors.primary:colors.border,backgroundColor:active?colors.accent:colors.surfaceRaised}}>
            <Feather name={area.icon as keyof typeof Feather.glyphMap} size={23} color={colors.primary}/>
            <View style={{flex:1,gap:4}}><Text style={[typography.meta,{color:colors.foreground,fontWeight:"700"}]}>{area.label}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{area.detail}</Text>
              {context.suggestedAreas.includes(area.id)?<Text style={[typography.caption,{color:colors.primary}]}>Related item in your Vault · confirm it applies</Text>:null}</View>
            <Feather name={active?"check-circle":"circle"} size={22} color={active?colors.primary:colors.mutedForeground}/>
          </Pressable>;})}
        </View>
        <DateField disabled={blocked} label="When would you like to start?" value={preferences.startDate} onChange={startDate=>setPreferences(p=>({...p,startDate}))}/>
        <Button label="Build my upkeep plan" disabled={blocked||!preferences.areas.length||!preferences.startDate} loading={generating} onPress={()=>void prepare()}/>
        <Text style={[typography.caption,{color:colors.mutedForeground}]}>Nothing is added until you review and save. Your choices stay on this device.</Text>
      </View>:null}
      {!loading&&context&&review?<View style={{gap:spacing.lg}}>
        <View style={{...card,backgroundColor:colors.accent}}>
          <Text style={[typography.section,{color:colors.foreground}]}>Your choices, explained</Text>
          <Text style={[typography.body,{color:colors.mutedForeground}]}>{context.areas.filter(a=>preferences.areas.includes(a.id)).map(a=>a.label).join(" · ")}</Text>
          <Text style={[typography.caption,{color:colors.mutedForeground}]}>Based on your selections and published guidance. Your dates are planning choices; follow your equipment’s service instructions.</Text>
          <Button label="Change my setup" variant="secondary" disabled={blocked} onPress={()=>{setReview(false);setError(null);}}/>
        </View>
        {tasks.map((task,index)=><View key={task.id??index} style={{...card,borderWidth:1,borderColor:colors.border,opacity:task.alreadyAdded?0.7:1}}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:!!selected[index],disabled:!!task.alreadyAdded||blocked}} disabled={task.alreadyAdded||blocked} onPress={()=>setSelected(s=>({...s,[index]:!s[index]}))} style={{flexDirection:"row",gap:spacing.md,alignItems:"flex-start",minHeight:44}}>
            <Feather name={selected[index]?"check-circle":"circle"} size={24} color={colors.primary}/>
            <View style={{flex:1,gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>{task.title}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{task.reason}</Text></View>
          </Pressable>
          <Text style={[typography.body,{color:colors.foreground}]}>{task.description.split("\nSource:")[0]}</Text>
          {task.relatedItems?.length?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Related saved items: {task.relatedItems.join(" · ")}. Confirm these still apply; model-specific instructions take priority.</Text>:null}
          {task.effort?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{task.effort}</Text>:null}
          {task.completedTask?<View style={{gap:6}}>
            <Text style={[typography.meta,{color:colors.primary}]}>Previously completed{task.completedTask.completedAt?" · "+formatCareDate(task.completedTask.completedAt.slice(0,10)):""}. Not selected again automatically.</Text>
            <Button label="Review previous task" variant="secondary" onPress={()=>router.push(("/care/"+task.completedTask!.id) as never)}/>
          </View>:null}
          {task.source?<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(task.source!.url).catch(()=>setError("Couldn't open the guidance. Please try again."))} style={{minHeight:44,justifyContent:"center"}}><Text style={[typography.caption,{color:colors.primary}]}>{task.source.label} ↗</Text></Pressable>:null}
          {task.alreadyAdded?<Text style={[typography.meta,{color:colors.primary}]}>Already in Care</Text>:editing===index&&!blocked?<View style={{gap:spacing.md}}>
            <TextField label="Task name" value={task.title} maxLength={140} onChangeText={title=>update(index,{title})}/>
            <DateField label="First date" value={task.due_date} onChange={due_date=>update(index,{due_date})}/>
            <Text style={[typography.meta,{color:colors.foreground}]}>Repeat</Text>
            <View style={{flexDirection:"row",flexWrap:"wrap",gap:spacing.sm}}>{intervals.map(r=>choice(r.id,r.label,task.recurrence===r.id,()=>update(index,{recurrence:r.id})))}</View>
            <Text style={[typography.caption,{color:colors.mutedForeground}]}>Choose a repeat only when it suits the task and your equipment instructions. The next date advances when you complete it.</Text>
            <Button label="Done editing" variant="secondary" onPress={()=>setEditing(null)}/>
          </View>:<Pressable accessibilityRole="button" disabled={blocked} onPress={()=>setEditing(index)} style={{minHeight:48,backgroundColor:colors.surfaceSubtle,borderRadius:radii.lg,padding:spacing.md,flexDirection:"row",gap:12,alignItems:"center"}}>
            <Feather name="calendar" size={18} color={colors.primary}/><Text style={[typography.caption,{flex:1,color:colors.foreground}]}>{formatCareDate(task.due_date)} · {formatCareRecurrence(task.recurrence)}</Text><Feather name="edit-2" size={18} color={colors.primary}/>
          </Pressable>}
        </View>)}
        {tasks.length&&!uncertain?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Uncheck anything that does not apply or is already done. Use the date control to remind yourself later. Only selected tasks are added.</Text>:null}
        {tasks.length&&!chosen.length?<Text style={[typography.body,{color:colors.mutedForeground}]}>Select a task to add, or change your setup. Existing tasks stay in Care.</Text>:null}
        {!uncertain?<Button label={chosen.length===1?"Add 1 task to Care":`Add ${chosen.length} tasks to Care`} disabled={blocked||!chosen.length} loading={saving} onPress={()=>void addSelected()}/>:null}
        {!uncertain?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Your selected tasks will appear in Care, ready to track and complete.</Text>:null}
      </View>:null}
    </FormScrollView>
  </SafeAreaView>;
}




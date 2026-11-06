import { FormScrollView } from "@/components/FormScrollView";
import { JourneyHeading, JourneySteps, JourneyDisclosure, JourneyPanel } from "@/components/JourneyUI";
import { Feather } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { ReadNotice, QuietAction } from "@/components/Brief";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { CareChoice, CleaningPeople, CleaningArtwork } from "@/components/CleaningUI";
import { fetchHousehold, type HouseholdMember } from "@/lib/household-data";
import { cleaningPresets, cleaningRooms, cleaningSuggestions, suggestionTask, localCleaningDate, distributeCleaning, cleaningTaskProblem } from "@/lib/cleaning-catalog";
import { fetchCleaningRoutines, readRoutineDraft, readPendingRoutine, storeRoutineDraft, clearRoutineDraft, saveCustomRoutine, recoverRoutineSave, addCarePerson, type RoutineDraft } from "@/lib/custom-cleaning";
import { cleaningScheduleLabel, type CleaningTaskSpec } from "@/lib/custom-cleaning-types";
import { ApiError } from "@/lib/api";
import { colors, typography } from "@/theme/tokens";

const steps = ["Pick a routine", "Make it yours"];
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function CustomCleaningRoutine() {
  const { id } = useLocalSearchParams<{ id?: string }>(), router = useRouter();
  const [draft, setDraft] = useState<RoutineDraft | null>(null), [homeId, setHomeId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false), [sharing, setSharing] = useState(false), [rotate, setRotate] = useState(false);
  const [step, setStep] = useState(0), [room, setRoom] = useState<string>("Kitchen"), [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), [resumed, setResumed] = useState(false), [otherDraft, setOtherDraft] = useState(false), [saveUncertain, setSaveUncertain] = useState(false);
  const [team, setTeam] = useState<string[]>([]), [peopleOpen, setPeopleOpen] = useState(false), [personName, setPersonName] = useState("");
  const [canAddPerson, setCanAddPerson] = useState(false), [personBusy, setPersonBusy] = useState(false), [personPending,setPersonPending] = useState(false), [personError, setPersonError] = useState<string | null>(null);
  const personId = useRef(Crypto.randomUUID()), personLock = useRef(false), lock = useRef(false), writes = useRef(Promise.resolve());
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { let active = true;
    void (async () => {
      try {
        await writes.current;
        const [saved, household] = await Promise.all([fetchCleaningRoutines(), fetchHousehold()]);
        if (saved.role !== "owner" || !("available" in household) || !household.available || household.home.id !== saved.homeId) throw Error("Only the household owner can manage cleaning routines.");
        const pendingSave = await readPendingRoutine(saved.homeId), pending = pendingSave ?? await readRoutineDraft(saved.homeId);
        const routine = id ? saved.routines.find(row => row.id === id) : null;
        if (id && !routine) throw Error("This routine is no longer available.");
        if (!active) return;
        setHomeId(saved.homeId); setMembers(household.members); setCanAddPerson(saved.managedPeopleAvailable === true);
        if (pending && (!id || pending.id === id)) { setDraft(pending); setResumed(true); setSaveUncertain(Boolean(pendingSave)); setStep(1); }
        else if (pending) { setOtherDraft(true); setDraft(null); }
        else { if (routine) setStep(1); setDraft(routine ? { id: routine.id, version: routine.version, applyCurrent: true, values: { title: routine.title, timezone: routine.timezone, state: routine.state, tasks: routine.definition } } : { id: Crypto.randomUUID(), version: 0, applyCurrent: false, values: { title: "Our cleaning routine", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto", state: "active", tasks: [] } }); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Couldn’t load this routine."); }
      finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  }, [id, attempt]);
  useFocusEffect(useCallback(() => { let active = true;
    if (homeId) void fetchHousehold().then(h => { if (active && "available" in h && h.available && h.home.id === homeId) setMembers(h.members); }).catch(() => undefined);
    return () => { active = false; };
  }, [homeId]));
  const available = members.filter(m => m.status === "active" || (canAddPerson && m.status === "local" && !m.linked_user_id));
  const blocked = busy || saveUncertain || personBusy;
  function move(next: number) { setStep(next); setExpanded(null); scroll.current?.scrollTo({y:0,animated:true}); }
  function change(next: RoutineDraft) {
    if (blocked || !homeId) return;
    setDraft(next);
    writes.current = writes.current.then(() => storeRoutineDraft(homeId, next)).catch(() => { setError("Your draft couldn’t be kept on this device. Keep this screen open until you save."); });
  }
  function updateTask(key: string, patch: Partial<CleaningTaskSpec>) { if (draft) change({ ...draft, values: { ...draft.values, tasks: draft.values.tasks.map(task => task.key === key ? { ...task, ...patch } : task) } }); }
  function addTask() {
    if (!draft || draft.values.tasks.length >= 12) return;
    const key = Crypto.randomUUID(), start = localCleaningDate();
    change({ ...draft, values: { ...draft.values, tasks: [...draft.values.tasks, {key,title:"",room,start,unit:"week",every:1,weekdays:[new Date(start+"T12:00:00").getDay()],rotation:"fixed",members:[]}] } }); setExpanded(key); setPicker(false);
  }
  async function save() {
    if (!draft || !homeId || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await writes.current; await saveCustomRoutine(homeId, draft); router.replace({pathname:"/(tabs)/care",params:{routineId:draft.id,routineAdded:String(draft.values.tasks.length)}}); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t confirm the save. Retry the same details."); setSaveUncertain(!(e instanceof ApiError && e.status >= 400 && e.status < 500)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function addPerson() {
    if (personLock.current || !homeId || !personName.trim()) return;
    personLock.current = true; setPersonBusy(true); setPersonError(null);
    try { const result = await addCarePerson(homeId, personId.current, personName.trim()); setMembers(current => [...current.filter(p=>p.id!==result.member.id),result.member]); setPersonName(""); setPersonPending(false); personId.current=Crypto.randomUUID(); setPeopleOpen(false); setTeam(current=>[...current.filter(id=>id!==result.member.id),result.member.id]); }
    catch(e) { const uncertain=!(e instanceof ApiError && e.status >= 400 && e.status < 500); setPersonPending(uncertain); if(!uncertain)personId.current=Crypto.randomUUID(); setPersonError(uncertain?"Couldn’t confirm the person was added. Retry with the same name to avoid a duplicate.":e.message); }
    finally {personLock.current=false;setPersonBusy(false);}
  }
  async function recover() { if (!homeId || lock.current) return; lock.current=true;setBusy(true);try { const savedId=await recoverRoutineSave(homeId); if(savedId) router.replace("/care/routines"); else setError("No pending save was found. Reload this routine before making more changes."); } catch(e) {setError(e instanceof Error?e.message:"Couldn’t confirm the save.");} finally {lock.current=false;setBusy(false);} }
  async function discard() { if (!homeId) return; await writes.current; await clearRoutineDraft(homeId); router.replace("/care/routines"); }
  const tasks = draft?.values.tasks ?? [], problems = tasks.map(task=>cleaningTaskProblem(task,available.map(m=>m.id)));
  const valid = Boolean(draft?.values.title.trim() && tasks.length && !problems.some(Boolean));
  const names = (task: CleaningTaskSpec) => task.members.length ? task.members.map(member=>available.find(p=>p.id===member)?.display_name ?? "Choose a person").join(" → ") : "Anyone in the household";

  const editing = tasks.find(t=>t.key===expanded);
  function choosePreset(preset: typeof cleaningPresets[number]) {
    if(!draft)return;
    const owner=available.find(m=>m.role==='owner');
    const chosen=cleaningSuggestions.filter(s=>preset.jobs.includes(s.id)).map(s=>({...suggestionTask(s,Crypto.randomUUID()),members:owner?[owner.id]:[]}));
    change({...draft,values:{...draft.values,title:preset.title,tasks:chosen}}); move(1);
  }
  function peopleSheet(){setTeam([...new Set(tasks.flatMap(t=>t.members))]);setSharing(true);}
  const sheet = (visible:boolean, title:string, close:()=>void, children:React.ReactNode) => <Modal visible={visible} transparent animationType="slide" onRequestClose={close}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:'rgba(18,35,27,0.35)',justifyContent:'flex-end'}}><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={close} style={{flex:1}}/><SafeAreaView edges={['bottom']} style={{maxHeight:'88%',backgroundColor:colors.canvas,borderTopLeftRadius:28,borderTopRightRadius:28}}><View style={{paddingHorizontal:20,paddingVertical:12,flexDirection:'row',alignItems:'center'}}><Text accessibilityRole="header" style={[typography.title,{flex:1,color:colors.foreground}]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" disabled={personBusy} onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Feather name="x" size={22} color={colors.primary}/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,paddingTop:0,gap:18}}>{children}</ScrollView></SafeAreaView></KeyboardAvoidingView></Modal>;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:colors.canvas}}>
    <ScreenNavigation title={draft?.version?'Edit routine':'New routine'} fallback="/care/routines" disabled={blocked} onBack={step===1&&!draft?.version?()=>move(0):undefined}/>
    <View  style={{flex:1}}>
    <FormScrollView ref={scroll} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingTop:12,gap:20,paddingBottom:24}}>
      {loading?<ActivityIndicator color={colors.primary}/>:null}
      {error?<ReadNotice message={error} busy={busy} onRetry={saveUncertain?()=>void recover():()=>{setLoading(true);setError(null);setAttempt(v=>v+1);}}/>:null}
      {saveUncertain?<JourneyPanel tone="soft"><Text style={typography.body}>Your last save needs confirmation. Your choices are kept.</Text><Button label="Check saved routine" loading={busy} onPress={()=>void recover()}/><QuietAction label="Retry the same save" disabled={busy} onPress={()=>void save()}/></JourneyPanel>:null}
      {otherDraft?<><Text style={typography.body}>Finish your saved draft before editing another routine.</Text><Button label="Open saved draft" onPress={()=>router.replace('/care/custom-routine')}/></>:null}
      {draft&&!loading?<>
        {!draft.version?<JourneySteps labels={steps} current={step}/>:null}
        {resumed?<Text style={[typography.meta,{color:colors.primary}]}>Your unfinished choices are saved here.</Text>:null}
        <View pointerEvents={blocked?'none':'auto'} style={{gap:18}}>
        {step===0?<>
          <CleaningArtwork height={150}/>
          <JourneyHeading title="A little less on your plate." detail="Start with a few useful jobs. Change anything, share them out, and tick them off together."/>
          {cleaningPresets.map((preset,i)=><Pressable key={preset.id} accessibilityRole="button" accessibilityLabel={preset.title} onPress={()=>choosePreset(preset)} style={{padding:18,borderRadius:22,backgroundColor:i===0?colors.surfaceSubtle:colors.surface,flexDirection:'row',gap:14,alignItems:'center'}}><View style={{width:48,height:48,borderRadius:16,backgroundColor:i===1?'#F3E3D2':'#E4EBDD',alignItems:'center',justifyContent:'center'}}><Feather name={preset.icon} size={24} color={colors.primary}/></View><View style={{flex:1,gap:5}}><Text style={[typography.section,{color:colors.foreground}]}>{preset.title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{preset.detail}</Text><Text style={[typography.caption,{color:colors.primary}]}>{preset.jobs.length} suggested jobs · edit before starting</Text></View><Feather name="arrow-right" size={20} color={colors.primary}/></Pressable>)}
          <QuietAction label="Choose my own jobs" onPress={()=>{move(1);setPicker(true);}}/>
          {tasks.length?<QuietAction label="Continue my current choices" onPress={()=>move(1)}/>:null}
        </>:<>
          <JourneyHeading title={draft.values.title} detail="Ready when you are. Tap a job to change who does it or when it repeats."/>
          <Pressable accessibilityRole="button" accessibilityLabel="Share jobs with your household" onPress={peopleSheet} style={{padding:16,borderRadius:20,backgroundColor:colors.surfaceSubtle,flexDirection:'row',gap:12,alignItems:'center'}}><Feather name="users" size={25} color={colors.primary}/><View style={{flex:1,gap:4}}><Text style={[typography.section,{color:colors.primary}]}>Share the jobs</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{available.length>1?'Choose people or take weekly turns.':'Add family or roommates, or keep it just for you.'}</Text></View><Feather name="chevron-right" size={18} color={colors.primary}/></Pressable>
          <View style={{borderRadius:22,backgroundColor:colors.surface,overflow:'hidden'}}>{tasks.map((task,i)=><Pressable key={task.key} accessibilityRole="button" accessibilityLabel={`Edit ${task.title||'new job'}`} onPress={()=>setExpanded(task.key)} style={{padding:17,minHeight:80,flexDirection:'row',gap:12,alignItems:'center',borderBottomWidth:i<tasks.length-1?1:0,borderBottomColor:colors.border}}><View style={{width:34,height:34,borderRadius:12,backgroundColor:colors.surfaceSubtle,alignItems:'center',justifyContent:'center'}}><Feather name="check" size={17} color={colors.primary}/></View><View style={{flex:1,gap:5}}><Text style={[typography.body,{fontWeight:'600',color:colors.foreground}]}>{task.title||'Name your job'}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{cleaningScheduleLabel(task)} · {names(task)}{task.rotation!=='fixed'?' · Taking turns':''}</Text>{problems[i]?<Text style={[typography.caption,{color:colors.criticalForeground}]}>{problems[i]}</Text>:null}</View><Feather name="chevron-right" size={16} color={colors.mutedForeground}/></Pressable>)}</View>
          <QuietAction label="Add or remove jobs" onPress={()=>setPicker(true)}/>
          <JourneyDisclosure label="Routine settings" open={expanded==='settings'} onToggle={()=>setExpanded(expanded==='settings'?null:'settings')}><TextField label="Routine name" value={draft.values.title} maxLength={80} onChangeText={title=>change({...draft,values:{...draft.values,title}})}/>{draft.version>0?<><CareChoice label="Update open jobs too" selected={draft.applyCurrent} onPress={()=>change({...draft,applyCurrent:!draft.applyCurrent})}/><Text style={typography.meta}>Completed history stays saved. Removed jobs stop repeating; any open task can be removed in Care.</Text></>:null}<Text style={[typography.meta,{color:colors.mutedForeground}]}>Jobs advance when you mark them done. Pausing stops new repeats and keeps open jobs.</Text><QuietAction label="Discard unfinished changes" onPress={()=>Alert.alert('Discard changes?','Your saved routines and history stay unchanged.',[{text:'Keep editing',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>void discard().catch(()=>setError('Couldn’t discard. Try again.'))}])}/></JourneyDisclosure>
        </>}
        </View>
      </>:null}
    </FormScrollView>
    {draft&&!loading&&step===1&&!saveUncertain?<View style={{paddingHorizontal:20,paddingTop:12,paddingBottom:8,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.canvas,gap:8}}><Text style={[typography.caption,{color:colors.mutedForeground,textAlign:'center'}]}>{tasks.length} jobs · Included free with Rezlee</Text><Button label={draft.version?'Save changes':'Start this routine'} loading={busy} disabled={!valid||blocked} onPress={()=>void save()}/></View>:null}
    </View>
    {draft?sheet(picker,'Choose your jobs',()=>setPicker(false),<>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{cleaningRooms.map(value=><CareChoice key={value} label={value} selected={room===value} onPress={()=>setRoom(value)}/>)}</ScrollView>
      {cleaningSuggestions.filter(s=>s.room===room).map(s=>{const selected=tasks.find(t=>t.title===s.title&&t.room===s.room);return <Pressable key={s.id} accessibilityRole="checkbox" accessibilityLabel={s.title} accessibilityState={{checked:!!selected}} disabled={!selected&&tasks.length>=12} onPress={()=>change({...draft,values:{...draft.values,tasks:selected?tasks.filter(t=>t.key!==selected.key):[...tasks,suggestionTask(s,Crypto.randomUUID())]}})} style={{minHeight:58,flexDirection:'row',gap:12,alignItems:'center'}}><Feather name={selected?'check-square':'square'} size={22} color={colors.primary}/><View style={{flex:1}}><Text style={[typography.body,{color:colors.foreground}]}>{s.title}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{s.unit==='day'?'Daily':s.every===2?'Every two weeks':'Weekly'}</Text></View></Pressable>})}
      <QuietAction label="Add my own job" disabled={tasks.length>=12} onPress={addTask}/><Button label={`Done · ${tasks.length} jobs`} onPress={()=>setPicker(false)}/>
    </>):null}
    {draft?sheet(sharing,'Who’s helping?',()=>{if(!personBusy)setSharing(false);},<>
      <Text style={[typography.body,{color:colors.mutedForeground}]}>Pick the people to share these jobs. You can change any assignment afterwards.</Text>
      {available.length?<CleaningPeople members={available} selected={team} onSelect={id=>setTeam(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}/>:<Text style={typography.body}>Add someone below, or leave jobs open for anyone.</Text>}
      {team.length>1?<CareChoice label="Swap jobs each week" selected={rotate} onPress={()=>setRotate(v=>!v)}/>:null}
      {canAddPerson?<JourneyDisclosure label="Add a child or someone you manage" open={peopleOpen} onToggle={()=>setPeopleOpen(v=>!v)}><Text style={[typography.meta,{color:colors.mutedForeground}]}>Just a name. You mark their jobs done; no account or notifications are created.</Text><TextField label="First name or nickname" editable={!personPending&&!personBusy} value={personName} maxLength={80} onChangeText={setPersonName}/>{personError?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{personError}</Text>:null}<Button label="Add person" disabled={!personName.trim()} loading={personBusy} onPress={()=>void addPerson()}/></JourneyDisclosure>:null}
      <QuietAction label="Invite an adult to your household" disabled={personBusy} onPress={()=>{setSharing(false);router.push('/household/add');}}/>
      {members.some(m=>m.status==='invited')?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Invited people appear here after they join.</Text>:null}
      <Button label={team.length===1?`Assign to ${available.find(m=>m.id===team[0])?.display_name??'this person'}`:team.length?`Share between ${team.length} people`:'Leave open for anyone'} disabled={personBusy} onPress={()=>{change({...draft,values:{...draft.values,tasks:team.length?distributeCleaning(tasks,team.filter(id=>available.some(m=>m.id===id)),rotate):tasks.map(t=>({...t,members:[],rotation:'fixed'}))}});setSharing(false);}}/>
    </>):null}
    {editing&&draft?sheet(true,'Make this job yours',()=>setExpanded(null),<>
      <TextField label="Job" value={editing.title} maxLength={140} onChangeText={title=>updateTask(editing.key,{title})}/>
      <Text style={[typography.section,{color:colors.foreground}]}>Who’s on it?</Text><CleaningPeople members={available} selected={editing.members} anyone onSelect={id=>updateTask(editing.key,{members:id?(editing.rotation==='fixed'?[id]:editing.members.includes(id)?editing.members.filter(m=>m!==id):[...editing.members,id]):[],...(!id?{rotation:'fixed' as const}:{})})}/>
      {editing.rotation!=='fixed'?<Text style={typography.meta}>Taking {editing.rotation} turns: {names(editing)}. Choosing a person above makes this their job.</Text>:null}
      <JourneyDisclosure label="When does it repeat?" detail={cleaningScheduleLabel(editing)} open={peopleOpen} onToggle={()=>setPeopleOpen(v=>!v)}>
        <DateField label="First date" value={editing.start} onChange={start=>updateTask(editing.key,{start})}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['day','week','month'] as const).map(unit=><CareChoice key={unit} label={unit==='day'?'Daily':unit==='week'?'Weekly':'Monthly'} selected={editing.unit===unit} onPress={()=>updateTask(editing.key,{unit,every:1})}/>)}</View>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'}}><CareChoice label="−" disabled={editing.every<=1} selected={false} onPress={()=>updateTask(editing.key,{every:editing.every-1})}/><Text>Every {editing.every} {editing.unit}{editing.every>1?'s':''}</Text><CareChoice label="+" disabled={editing.every>=12} selected={false} onPress={()=>updateTask(editing.key,{every:editing.every+1})}/></View>
        {editing.unit==='week'?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{days.map((day,i)=><CareChoice key={day} label={day} selected={editing.weekdays.includes(i)} onPress={()=>updateTask(editing.key,{weekdays:editing.weekdays.includes(i)?editing.weekdays.filter(d=>d!==i):[...editing.weekdays,i].sort()})}/>)}</View>:null}
      </JourneyDisclosure>
      {available.length>1?<View style={{gap:10}}><Text style={typography.meta}>Assignment</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['fixed','weekly','monthly'] as const).map(rotation=><CareChoice key={rotation} label={rotation==='fixed'?'One person':rotation==='weekly'?'Weekly turns':'Monthly turns'} selected={editing.rotation===rotation} onPress={()=>updateTask(editing.key,{rotation,members:rotation==='fixed'?editing.members.slice(0,1):editing.members})}/>)}</View>{editing.rotation!=='fixed'?<Text style={typography.meta}>Select at least two people above. Their turn changes each {editing.rotation==='weekly'?'week':'month'}.</Text>:null}</View>:null}
      <TextField label="Room or area" value={editing.room} maxLength={80} onChangeText={room=>updateTask(editing.key,{room})}/>
      {cleaningTaskProblem(editing,available.map(m=>m.id))?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{cleaningTaskProblem(editing,available.map(m=>m.id))}</Text>:null}
      <Button label="Done" onPress={()=>setExpanded(null)}/><QuietAction label="Remove job" onPress={()=>{change({...draft,values:{...draft.values,tasks:tasks.filter(t=>t.key!==editing.key)}});setExpanded(null);}}/>
    </>):null}
  </SafeAreaView>;
}

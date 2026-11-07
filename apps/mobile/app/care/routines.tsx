import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { JourneyHeading, JourneyPanel } from "@/components/JourneyUI";
import { CleaningFeature } from "@/components/CleaningUI";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { ReadNotice, QuietAction } from "@/components/Brief";
import { Button } from "@/components/Button";
import { fetchCleaningRoutines, saveCustomRoutine, readPendingRoutine, recoverRoutineSave } from "@/lib/custom-cleaning";
import { cleaningScheduleLabel, type CleaningRoutine } from "@/lib/custom-cleaning-types";
import { typography } from "@/theme/tokens";
export default function CleaningRoutines() {
  const { colors } = useTheme();

  const router=useRouter(),params=useLocalSearchParams<{saved?:string}>();
  const [data,setData]=useState<Awaited<ReturnType<typeof fetchCleaningRoutines>>|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[pending,setPending]=useState(false);
  const [showStopped,setShowStopped]=useState(false);
  const lock=useRef(false),version=useRef(0);
  const load=useCallback(async()=>{const request=++version.current;setBusy(true);try{const next=await fetchCleaningRoutines();const save=next.role==="owner"?await readPendingRoutine(next.homeId):null;if(request===version.current){setData(next);setPending(Boolean(save));setError(null);}}catch{if(request===version.current)setError("Routines couldn’t be loaded. Your saved jobs are unchanged.");}finally{if(request===version.current)setBusy(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();return()=>{version.current++;};},[load]));
  async function changeState(routine:CleaningRoutine,state:CleaningRoutine["state"]){
    if(lock.current||!data||pending)return;lock.current=true;setBusy(true);
    try{await saveCustomRoutine(data.homeId,{id:routine.id,version:routine.version,applyCurrent:false,values:{title:routine.title,timezone:routine.timezone,state,tasks:routine.definition}});await load();}
    catch(e){setError(e instanceof Error?e.message:"Couldn’t change this routine.");setPending(Boolean(await readPendingRoutine(data.homeId).catch(()=>null)));}
    finally{lock.current=false;setBusy(false);}
  }
  async function checkPending(){if(!data||lock.current)return;lock.current=true;setBusy(true);try{await recoverRoutineSave(data.homeId);await load();}catch(e){setError(e instanceof Error?e.message:"Couldn’t confirm that change.");}finally{lock.current=false;setBusy(false);}}
  const active=data?.routines.filter(r=>r.state!=="ended")??[],rest=data?.routines.filter(r=>r.state==="ended")??[];
  return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.canvas}}><ScreenNavigation title="Cleaning together" fallback="/(tabs)/care" disabled={busy}/><ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{padding:20,gap:22,paddingBottom:48}}>
    {busy&&!data?<ActivityIndicator color={colors.primary}/>:null}
    {error?<ReadNotice message={error} busy={busy} onRetry={()=>void load()}/>:null}
    {params.saved?<JourneyPanel tone="soft"><Text accessibilityLiveRegion="polite" style={[typography.section,{color:colors.primary}]}>Your routine is saved.</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>Tasks are available in Care. Select Complete when a task is finished.</Text><Button label="View tasks" onPress={()=>router.replace("/(tabs)/care")}/><QuietAction label="Dismiss" onPress={()=>router.setParams({saved:undefined})}/></JourneyPanel>:null}
    {pending?<JourneyPanel tone="soft"><Text style={[typography.body,{color:colors.foreground}]}>A previous change still needs confirmation. Check it before editing again.</Text><Button label="Check the last change" loading={busy} onPress={()=>void checkPending()}/><QuietAction label="Open pending changes" disabled={busy} onPress={()=>router.push("/care/custom-routine")}/></JourneyPanel>:null}
    {data?.routines.length?<JourneyHeading eyebrow="A PLACE FOR EVERYONE’S PART" title="Your routines." detail="See your jobs, change who does them, or pause the repeats."/>:data?.role==="owner"?<><CleaningFeature onPress={()=>router.push("/care/custom-routine")}/><JourneyPanel><Text style={[typography.section,{color:colors.foreground}]}>From “someone should” to sorted.</Text>{["Choose useful jobs for your rooms.","Share them with family or roommates.","See who’s on it and tick it off in Care."].map((text,i)=><Text key={text} style={[typography.body,{color:colors.mutedForeground}]}>{i+1}. {text}</Text>)}</JourneyPanel></>:data?<JourneyHeading title="Your household’s routines." detail="Your household owner can set up jobs and assign them to you. Your shared jobs will appear in Care."/>:null}
    {[...active,...(showStopped?rest:[])].map(routine=><JourneyPanel key={routine.id}>
      <View style={{alignSelf:"flex-start",paddingHorizontal:10,paddingVertical:6,borderRadius:20,backgroundColor:routine.state==="active"?colors.successBg:colors.muted}}><Text style={[typography.caption,{color:colors.foreground}]}>{routine.state==="active"?"Active":routine.state==="paused"?"Paused":"Stopped"}</Text></View>
      <Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>{routine.title}</Text>
      <Text style={[typography.meta,{color:colors.mutedForeground}]}>{routine.definition.length} jobs · {new Set(routine.definition.map(t=>t.room)).size} areas</Text>
      {routine.definition.slice(0,3).map(task=><View key={task.key} style={{gap:4}}><Text style={[typography.body,{color:colors.foreground}]}>{task.title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{cleaningScheduleLabel(task)}</Text></View>)}
      {routine.definition.length>3?<Text style={[typography.meta,{color:colors.mutedForeground}]}>+ {routine.definition.length-3} more jobs</Text>:null}
      <Button label="See routine jobs" variant="secondary" onPress={()=>router.push({pathname:"/(tabs)/care",params:{routineId:routine.id}})}/>
      {data?.role==="owner"?<><QuietAction label="Edit jobs & people" disabled={busy||pending} onPress={()=>router.push({pathname:"/care/custom-routine",params:{id:routine.id}})}/><Pressable accessibilityRole="button" accessibilityLabel={`Manage ${routine.title}`} disabled={busy||pending} onPress={()=>Alert.alert(routine.title,"Pausing or stopping prevents future repeats. Open jobs and completed history stay saved.",[
        {text:routine.state==="active"?"Pause routine":routine.state==="paused"?"Resume routine":"Restart routine",onPress:()=>void changeState(routine,routine.state==="active"?"paused":"active")},
        ...(routine.state!=="ended"?[{text:"Stop routine",style:"destructive" as const,onPress:()=>void changeState(routine,"ended")}]:[]),
        {text:"Cancel",style:"cancel"},
      ])} style={{minHeight:44,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8}}><Feather name="more-horizontal" size={20} color={colors.primary}/><Text style={[typography.meta,{color:colors.primary}]}>Manage routine</Text></Pressable></>:null}
    </JourneyPanel>)}
    {data?.role==="owner"&&data.routines.length?<Button label="Create another routine" disabled={busy||pending} onPress={()=>router.push("/care/custom-routine")}/>:null}
    {rest.length?<QuietAction label={showStopped?"Hide stopped routines":`Stopped routines (${rest.length})`} onPress={()=>setShowStopped(v=>!v)}/>:null}
    <QuietAction label="Back to Care" onPress={()=>router.replace("/(tabs)/care")}/>
  </ScrollView></SafeAreaView>;
}


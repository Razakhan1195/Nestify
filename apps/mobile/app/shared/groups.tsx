import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {useCallback,useEffect,useRef,useState} from "react";
import {Redirect,useFocusEffect,useRouter} from "expo-router";
import {Pressable,Text,View} from "react-native";
import {useAuth} from "@/auth/AuthProvider";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {QuietAction} from "@/components/Brief";
import {Surface} from "@/components/ui/Surface";
import {SharedFrame,SharedLoading,SharedNotice,getSharedStyles} from "@/components/SharedExpenseUI";
import {fetchExpenseGroups,pendingGroupAction,retryGroupAction,saveGroupAction,type ExpenseGroup,type PendingGroupAction} from "@/lib/expense-groups";
import {sharedMoney} from "@/lib/shared-expense-math";
import {ApiError} from "@/lib/api";
import {Feather} from "@expo/vector-icons";
import { typography } from "@/theme/tokens";

export default function Groups(){
 const {session,isLoading}=useAuth();
 if(isLoading)return <SharedFrame title="Expense groups"><SharedLoading/></SharedFrame>;
 if(!session)return <Redirect href="/(auth)/login"/>;
 return <AccountGroups key={session.user.id} userId={session.user.id}/>;
}
function AccountGroups({userId}:{userId:string}){
  const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const router=useRouter(),version=useRef(0),lock=useRef(false),alive=useRef(true);
 const [ready,setReady]=useState(false),[hasHome,setHasHome]=useState<boolean|null>(null);
 const [groups,setGroups]=useState<ExpenseGroup[]>([]),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
 const [pending,setPending]=useState<PendingGroupAction|null>(null),[name,setName]=useState(""),[creating,setCreating]=useState(false),[archived,setArchived]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async()=>{
  const v=++version.current;setBusy(true);
  try{
   const [result,unfinished]=await Promise.all([fetchExpenseGroups(userId),pendingGroupAction()]);
   if(v===version.current&&alive.current){setGroups(result.groups);setHasHome(result.hasHome);setPending(unfinished);setError(null);setReady(true);}
  }catch(e){if(v===version.current&&alive.current){setReady(false);setError(e instanceof ApiError?e.message:"Could not load groups or check your previous save. Try again.");}}
  finally{if(v===version.current&&alive.current)setBusy(false);}
 },[userId]);
 useFocusEffect(useCallback(()=>{void load();return()=>{version.current++;};},[load]));
 async function create(){
  if(lock.current||!name.trim())return;lock.current=true;setSaving(true);setError(null);
  try{const result=await saveGroupAction({action:"create_group",name:name.trim()},userId);if(alive.current)router.push({pathname:"/shared",params:{groupId:result.groupId}});}
  catch(e){if(alive.current){setError(e instanceof ApiError?e.message:"Could not confirm your group. Check the previous save before trying new details.");setPending(await pendingGroupAction().catch(()=>null));}}
  finally{lock.current=false;if(alive.current)setSaving(false);}
 }
 async function recover(){
  if(lock.current)return;lock.current=true;setSaving(true);setError(null);
  try{const wasCreate=pending?.action==="create_group";const result=await retryGroupAction(userId);if(alive.current){await load();if(wasCreate&&result)router.push({pathname:"/shared",params:{groupId:result.groupId}});}}
  catch(e){if(alive.current){setError(e instanceof ApiError?e.message:"Could not confirm this save.");setPending(await pendingGroupAction().catch(()=>pending));}}
  finally{lock.current=false;if(alive.current)setSaving(false);}
 }
 const visible=groups.filter(g=>g.archived===archived);
 return <SharedFrame title="Expense groups" fallback="/shared" disabled={saving}>
  <View style={{gap:8}}><Text accessibilityRole="header" style={s.heading}>Your expense groups.</Text><Text style={s.body}>Roommates, family or a trip. Each group has its own people, expenses and balances.</Text><Text style={s.label}>Group invitations share expenses only. They don’t give access to Care, private bills or Vault. Amounts are recorded in CAD.</Text></View>
  {error?<SharedNotice message={error} onRetry={()=>void load()} busy={busy}/>:null}
  {pending?<Surface tone="subtle" style={{gap:12}}><Text style={s.body}>A previous group change still needs confirmation.</Text><Button label="Check previous save" loading={saving} onPress={()=>void recover()}/></Surface>:null}
  {busy&&!groups.length?<SharedLoading/>:null}
  {creating?<Surface tone="subtle" style={{gap:16}}><TextField label="Group name" value={name} onChangeText={setName} maxLength={80} editable={!saving} placeholder="Maple Street roommates"/><Button label="Create group" loading={saving} disabled={!name.trim()||!!pending||busy||!ready} onPress={()=>void create()}/><QuietAction label="Cancel" onPress={()=>{if(!saving)setCreating(false);}}/></Surface>:<Button label="Create a group" disabled={!!pending||busy||!ready} onPress={()=>setCreating(true)}/>}
  <Button label="Join with an invitation" variant="secondary" disabled={saving} onPress={()=>router.push("/shared/join")}/>
  <View accessibilityRole="tablist" style={{flexDirection:"row",gap:12}}>{[false,true].map(value=><Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{selected:archived===value}} onPress={()=>setArchived(value)} style={{minHeight:44,paddingHorizontal:18,paddingVertical:12,borderRadius:24,backgroundColor:archived===value?colors.primary:colors.surfaceSubtle}}><Text style={[s.body,{color:archived===value?colors.primaryForeground:colors.foreground}]}>{value?"Archived":"Active"}</Text></Pressable>)}</View>
  {visible.map(g=><Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`${g.name}. Open group expenses and balances`} style={({pressed})=>({opacity:pressed?0.7:1})} onPress={()=>router.push({pathname:"/shared",params:{groupId:g.id}})}><Surface style={{gap:8}}><View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text style={[typography.section,{color:colors.foreground,flex:1}]}>{g.name}</Text><Feather accessible={false} name="chevron-right" size={18} color={colors.mutedForeground}/></View><Text style={s.label}>{g.peopleCount} {g.peopleCount===1?"person":"people"} · {g.role==="owner"?"You manage this group":"Joined group"}</Text><Text style={s.body}>{g.youOweCents||g.youAreOwedCents?[g.youOweCents?"You owe "+sharedMoney(g.youOweCents):"",g.youAreOwedCents?"You’re owed "+sharedMoney(g.youAreOwedCents):""].filter(Boolean).join(" · "):"Settled up"}</Text></Surface></Pressable>)}
  {!busy&&!visible.length?<Text style={s.body}>{archived?"Archived groups will remain here with their history.":"Create a group, then add the people you share costs with. You can add names before inviting anyone."}</Text>:null}

  {hasHome!==null?<QuietAction label={hasHome?"Your household expenses":"Set up your home in Rezlee"} onPress={()=>router.push(hasHome?"/shared":"/onboarding")}/>:null}
  <Text style={s.label}>Up to 40 current participants per group. Record expenses and repayments; no money moves through Rezlee.</Text>
 </SharedFrame>;
}

import {groupParams} from "@/lib/shared-expenses";
import {AddExpensePerson} from "@/components/ExpensePeople";
import {Surface} from "@/components/ui/Surface";
import {CollectionIntro} from "@/components/CollectionIntro";
import { useFocusEffect,useRouter } from "expo-router";
import {useCallback,useRef,useState} from "react";
import {Pressable,Text,View} from "react-native";
import {Button} from "@/components/Button";
import {sharedLedgerStage,sharedEntryContext} from "@/lib/shared-ledger-presentation";
import {BriefRow,QuietAction} from "@/components/Brief";
import {SharedBalances} from "@/components/SharedBalances";
import {SharedFrame,SharedLoading,SharedNotice,sharedStyles as s,useSharedLedger} from "@/components/SharedExpenseUI";
import {fetchSharedExpenses,pendingSharedSave,saveSharedExpense,sharedDate,type PendingSharedSave} from "@/lib/shared-expenses";
import {sharedMoney} from "@/lib/shared-expense-math";
import {colors,typography} from "@/theme/tokens";
import {ApiError} from "@/lib/api";

export default function SharedExpenses({embedded=false,inline=false}:{embedded?:boolean;inline?:boolean}){
 const router=useRouter(),{data,setData,error,busy,load}=useSharedLedger();
 const [activityFilter,setActivityFilter]=useState<"all"|"expense"|"repayment">("all");
 const [checkedPending,setCheckedPending]=useState(false);
 const [pendingCheckError,setPendingCheckError]=useState<string|null>(null);
 const [checkingPending,setCheckingPending]=useState(true);
 const pendingCheckVersion=useRef(0);
 const pendingCheckRunning=useRef(false);
 const [pending,setPending]=useState<PendingSharedSave|null>(null),[saveError,setSaveError]=useState<string|null>(null),[working,setWorking]=useState(false),[moreBusy,setMoreBusy]=useState(false);
 const checkPending=useCallback(async()=>{
  if(pendingCheckRunning.current)return;
  pendingCheckRunning.current=true;
  const version=++pendingCheckVersion.current;
  setCheckingPending(true);setCheckedPending(false);setPendingCheckError(null);
  try{
   const saved=await pendingSharedSave();
   if(version===pendingCheckVersion.current){setPending(saved);setCheckedPending(true);}
  }catch{
   if(version===pendingCheckVersion.current)setPendingCheckError("We couldn’t check your previous save. Try again before adding another expense.");
  }finally{
   if(version===pendingCheckVersion.current){pendingCheckRunning.current=false;setCheckingPending(false);}
  }
 },[]);
 useFocusEffect(useCallback(()=>{
  void checkPending();
  return()=>{pendingCheckVersion.current++;pendingCheckRunning.current=false;};
 },[checkPending]));
 async function recover(){
  if(!pending||working)return;setWorking(true);setSaveError(null);
  try{await saveSharedExpense(pending.homeId,pending.command,pending.groupId,data?.viewerId);setPending(null);await load();}
  catch(e){setSaveError(e instanceof ApiError?e.message:"Could not confirm the save. Try again.");setPending(await pendingSharedSave().catch(()=>pending));}
  finally{setWorking(false);}
 }
 async function more(){
  if(!data?.nextCursor||moreBusy)return;setMoreBusy(true);
  try{const next=await fetchSharedExpenses({before:data.nextCursor,groupId:data.groupId,expectedUserId:data.viewerId});setData(old=>old&&old.home.id===next.home.id?{...next,viewerId:old.viewerId,entries:[...old.entries,...next.entries.filter(e=>!old.entries.some(v=>v.id===e.id))]}:old);}
  catch{setSaveError("Could not load more history. Your entries are still saved.");}
  finally{setMoreBusy(false);}
 }
 const ready=Boolean(data&&!data.archived&&!error&&!busy&&checkedPending&&!pending&&!working);
 const stage=data?sharedLedgerStage(data):null;
 const entries=data?.entries.filter(entry=>activityFilter==="all"||entry.kind===activityFilter)??[];
 return <SharedFrame title="Shared expenses" embedded={embedded} inline={inline} fallback="/(tabs)/bills">
  {embedded?<View style={{gap:6}}><Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>Bills</Text><Text style={s.label}>Your household’s shared expenses. Private bills stay with their account owner.</Text></View>:null}
  {!data?<QuietAction label="View expense groups" onPress={()=>router.push("/shared/groups")}/>:null}
  {data?.archived?<SharedNotice message="Archived group. Your history is still available. Open People & invites to restore it."/>:null}
  {error?<SharedNotice message={error} onRetry={()=>void load()} busy={busy}/>:null}
  {busy&&!data?<SharedLoading/>:null}
  {checkingPending&&data?<Text accessibilityLiveRegion="polite" style={s.label}>Checking unfinished saves…</Text>:null}
  {pendingCheckError?<SharedNotice message={pendingCheckError} onRetry={()=>void checkPending()} busy={checkingPending}/>:null}
  {saveError?<SharedNotice message={saveError}/>:null}
  {pending?<View style={{gap:12}}><SharedNotice message={pending.command.operation==="create"&&pending.command.kind==="expense"?"Check your expense: "+pending.command.details.title+" · "+sharedMoney(pending.command.details.amountCents):pending.command.operation==="create"&&pending.command.kind==="repayment"?"Check your recorded repayment of "+sharedMoney(pending.command.details.amountCents):"A previous change still needs confirmation. Your attempted details are kept."}/><Button label="Check previous save" loading={working} disabled={!data||Boolean(error)||data.home.id!==pending.homeId} onPress={()=>void recover()}/></View>:null}
  {pending&&data&&pending.homeId!==data.home.id?<QuietAction label="Open the unfinished save’s group" onPress={()=>router.push({pathname:"/shared",params:pending.groupId?{groupId:pending.groupId}:{}})}/>:null}
  {data?<>
   {stage==="start"&&!data.entries.length?<CollectionIntro section="expenses" spacious
    actionLabel="Add your first expense" disabled={!ready}
    detail="Add a shared cost, choose who paid, and split it with the people involved. You can add people as you go."
    onPress={()=>router.push({pathname:"/shared/edit",params:groupParams(data)})}/>:null}
   <QuietAction label={data.groupId?"All expense groups":"View expense groups"} onPress={()=>router.push("/shared/groups")}/>
   <Surface tone="subtle" style={{gap:16}}>
    <View style={{flexDirection:"row",alignItems:"center",gap:16,flexWrap:"wrap"}}>
     <View style={{flex:1,gap:4,minWidth:150}}><Text style={s.label}>{data.groupId?"Expense group":"Your household"}</Text><Text accessibilityRole="header" style={s.heading}>{data.home.name}</Text></View>
     <QuietAction label="People & invites" onPress={()=>router.push({pathname:"/shared/people",params:groupParams(data)})}/>
    </View>
    <Text style={s.body}>{data.people.filter(person=>person.state!=="former").slice(0,3).map(person=>person.self?"You":person.name).join(" · ")}{data.people.filter(person=>person.state!=="former").length>3?" · +"+(data.people.filter(person=>person.state!=="former").length-3)+" more":""}</Text>
    <Text style={s.label}>Choose who shares each expense. Track a person by name first; invite them when you’re ready.</Text>
   </Surface>
   {stage==="start"&&!data.entries.length?<>
    {data.role==="owner"&&!data.archived&&!data.people.some(person=>!person.self&&person.state!=="former")?<AddExpensePerson expectedUserId={data.viewerId} groupId={data.groupId} homeId={data.home.id} onAdded={async()=>{if(!await load())throw Error("Refresh failed");}}/>:null}
   </>:<>
    <SharedBalances data={data} ready={ready} onSelect={pair=>router.push({pathname:"/shared/repay",params:groupParams(data,{from:pair.from,to:pair.to})})}/>
    <Button label="Add expense" disabled={!ready} onPress={()=>router.push({pathname:"/shared/edit",params:groupParams(data)})}/>
   </>}
   {data.entries.length?<View>
    <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,marginBottom:8}]}>Activity</Text>
    <View accessibilityRole="tablist" style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:12}}>
     {([{key:"all",label:"All"},{key:"expense",label:"Expenses"},{key:"repayment",label:"Repayments"}] as const).map(filter=><Pressable key={filter.key} accessibilityRole="tab" accessibilityState={{selected:activityFilter===filter.key}} onPress={()=>setActivityFilter(filter.key)} style={{minHeight:44,paddingHorizontal:16,paddingVertical:12,borderRadius:22,backgroundColor:activityFilter===filter.key?colors.primary:colors.surfaceSubtle}}><Text style={[s.body,{color:activityFilter===filter.key?colors.primaryForeground:colors.foreground}]}>{filter.label}</Text></Pressable>)}
    </View>
    {!entries.length?<Text style={[s.label,{marginVertical:12}]}>No {activityFilter==="repayment"?"repayments":"expenses"} in the loaded activity.</Text>:null}
    {entries.map(entry=><BriefRow key={entry.id} title={(entry.voided?"Removed · ":"")+(entry.kind==="expense"?entry.details.title:"Repayment")} value={sharedMoney(entry.details.amountCents)} detail={sharedDate(entry.details.happenedOn)+" · "+sharedEntryContext(entry,data.people,sharedMoney)} onPress={()=>router.push({pathname:"/shared/[id]",params:groupParams(data,{id:entry.id})})}/>)}
    {data.nextCursor?<Text style={[s.label,{marginTop:12}]}>Earlier activity is available below. Filters apply to the entries loaded so far.</Text>:null}
    {data.nextCursor?<QuietAction label={moreBusy?"Loading…":"Load earlier entries"} disabled={moreBusy} onPress={()=>void more()}/>:null}
   </View>:null}
   <QuietAction label={busy?"Refreshing…":"Refresh balances"} onPress={()=>{if(!busy)void load();}}/>
   <Text style={s.label}>{data.groupId?"Shared entries are visible only to people who join this group. Care, private bills and Vault stay private.":"Shared entries are visible to everyone who joins this household. Your original bills and documents remain private."}</Text>
  </>:null}
 </SharedFrame>;
}


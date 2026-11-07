import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {groupParams} from "@/lib/shared-expenses";
import {useLocalSearchParams,useRouter} from "expo-router";
import {useRef,useState} from "react";
import {Alert,Text,View} from "react-native";
import {Feather} from "@expo/vector-icons";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {QuietAction} from "@/components/Brief";
import {Surface} from "@/components/ui/Surface";
import {SharedFrame,SharedLoading,SharedNotice,getSharedStyles,useSharedLedger} from "@/components/SharedExpenseUI";
import {saveSharedExpense,sharedDate,sharedPersonName,type ExpenseDetails,type RepaymentDetails} from "@/lib/shared-expenses";
import {sharedMoney} from "@/lib/shared-expense-math";
import { typography } from "@/theme/tokens";
import {ApiError} from "@/lib/api";
export default function SharedExpenseDetail(){
  const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const {id,existing,saved}=useLocalSearchParams<{id:string;existing?:string;saved?:string}>(),router=useRouter(),{data,error,busy,load}=useSharedLedger(id);
 const [removing,setRemoving]=useState(false),[reason,setReason]=useState(""),[saving,setSaving]=useState(false),[failure,setFailure]=useState<string|null>(null),[history,setHistory]=useState(false);
 const lock=useRef(false),entry=data?.entries[0];
 const name=(id:string)=>sharedPersonName(data?.people??[],id);
 async function remove(){
  if(!entry||!data||lock.current||!reason.trim())return;lock.current=true;setSaving(true);setFailure(null);
  try{await saveSharedExpense(data.home.id,{operation:"void",id:entry.id,version:entry.version,reason:reason.trim()},data.groupId,data.viewerId);setRemoving(false);await load();}
  catch(e){setFailure(e instanceof ApiError?e.message:"Could not confirm this change. Check Shared expenses before retrying.");}
  finally{setSaving(false);lock.current=false;}
 }
 return <SharedFrame title={entry?.kind==="repayment"?"Repayment":"Shared expense"} disabled={saving}>
  {error?<SharedNotice message={error} onRetry={()=>void load()}/>:null}
  {failure?<SharedNotice message={failure}/>:null}
  {busy&&!data?<SharedLoading/>:null}
  {entry&&data?<>
   {saved==="1"&&!entry.voided?<View accessibilityLiveRegion="polite" style={{gap:10,paddingVertical:8}}><Feather name="check-circle" size={32} color={colors.primary}/><Text style={s.heading}>{entry.kind==="repayment"?"Payment recorded":"Expense saved"}</Text><Text style={s.body}>{entry.kind==="repayment"?(()=>{const d=entry.details;const pair=data.balances.find(p=>(p.from===d.from&&p.to===d.to)||(p.from===d.to&&p.to===d.from));return pair?name(pair.from)+" owes "+name(pair.to)+" "+sharedMoney(pair.cents)+" now.":data.people.some(p=>p.self&&(p.id===d.from||p.id===d.to))?"You’re settled up with "+name(data.people.find(p=>p.self)?.id===d.from?d.to:d.from)+".":name(d.from)+" and "+name(d.to)+" are settled up.";})():"Your shared balances are updated."}</Text></View>:null}
   {existing==="1"?<Text accessibilityLiveRegion="polite" style={s.label}>This bill was already shared. You’re viewing the existing expense.</Text>:null}
   <Surface tone="subtle" style={{gap:12}}>
    <Text style={s.label}>{data.home.name} · {entry.voided?"Removed from balances":"Recorded in CAD"}</Text>
    <Text accessibilityRole="header" style={s.heading}>{entry.kind==="expense"?entry.details.title:"Payment details"}</Text>
    <Text style={[typography.display,{color:colors.foreground,fontVariant:["tabular-nums"]}]}>{sharedMoney(entry.details.amountCents)}</Text>
    <Text style={s.body}>{entry.kind==="expense"?"Paid by "+name(entry.details.paidBy):name(entry.details.from)+" → "+name(entry.details.to)}</Text>
    <Text style={s.label}>{sharedDate(entry.details.happenedOn)}</Text>
   </Surface>
   {entry.kind==="repayment"&&saved==="1"?<Button label="Back to balances" onPress={()=>router.replace({pathname:"/shared",params:groupParams(data)})}/>:null}
   {entry.kind==="expense"?<View>
    <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Shares</Text>
    {entry.details.shares.map(share=><View key={share.personId} style={[s.row,{flexDirection:"row",gap:16}]}><View style={{flex:1}}><Text style={s.body}>{name(share.personId)}</Text>{data.people.find(p=>p.id===share.personId)?.state==="former"?<Text style={s.label}>Former participant · history retained</Text>:null}</View><Text style={s.body}>{sharedMoney(share.cents)}</Text></View>)}
   </View>:<Text style={s.label}>This records a payment made outside Rezlee. It does not transfer or independently verify money.</Text>}
   {saved==="1"&&!entry.voided&&data.role==="owner"&&entry.kind==="expense"&&data.people.some(person=>person.guest&&person.state==="local"&&entry.details.shares.some(share=>share.personId===person.id))?<View style={{gap:6}}><Text style={s.label}>Your expense is saved even if someone hasn’t joined.</Text><QuietAction label="Invite them to join Rezlee" onPress={()=>router.push({pathname:"/shared/people",params:groupParams(data)})}/></View>:null}
   {entry.kind==="repayment"?<Text style={s.label}>{data.changes.find(c=>c.action==="added")?"Recorded by "+data.changes.find(c=>c.action==="added")!.actor_name:"Open change history to see who recorded this payment."} · Not bank verified</Text>:null}
   {entry.details.note?<View style={{gap:6}}><Text style={s.label}>Note</Text><Text style={s.body}>{entry.details.note}</Text></View>:null}
   {entry.kind==="repayment"&&!entry.canEdit&&!entry.voided?<Text style={s.label}>If this payment looks wrong, ask {data.changes.find(c=>c.action==="added")?.actor_name??"the person who recorded it"} or the household owner to correct the record.</Text>:null}
   {entry.canEdit&&!error&&!busy&&!removing?<View style={{gap:12}}>
    {entry.kind==="expense"?<Button label="Correct expense" variant="secondary" onPress={()=>router.push({pathname:"/shared/edit",params:groupParams(data,{id:entry.id})})}/>:null}
    <QuietAction label={entry.kind==="expense"?"Remove expense":"Remove repayment"} onPress={()=>setRemoving(true)}/>
   </View>:null}
   {removing?<Surface style={{gap:14}}>
    <Text style={s.heading}>Keep a record of the correction</Text><Text style={s.body}>This entry will stop affecting balances. Its history stays visible. Other expenses and repayments stay unchanged.</Text>
    <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={240} editable={!saving} placeholder="Duplicate, entered incorrectly, refunded…"/>
    <Button label="Remove from balances" loading={saving} disabled={!reason.trim()} onPress={()=>Alert.alert("Remove this entry?","Recorded balances will be recalculated. This does not refund or move money.",[{text:"Keep",style:"cancel"},{text:"Remove",style:"destructive",onPress:()=>void remove()}])}/>
    <QuietAction label="Cancel" onPress={()=>{if(!saving)setRemoving(false);}}/>
   </Surface>:null}
   <View style={{gap:8}}>
    <QuietAction label={history?"Hide history":"View change history"} onPress={()=>setHistory(v=>!v)}/>
    {history?data.changes.map(change=>{
     const d=change.details,removed="reason" in d,record=removed?d.previous:d as ExpenseDetails|RepaymentDetails;
     return <View key={change.id} style={[s.row,{gap:6}]}>
      <Text style={s.body}>{change.action==="added"?"Added":change.action==="corrected"?"Corrected":"Removed"} by {change.actor_name}</Text>
      <Text style={s.label}>{new Date(change.created_at).toLocaleString("en-CA")} · Version {change.version}</Text>
      {removed?<Text style={s.body}>{d.reason}</Text>:null}
      <Text style={s.body}>{sharedMoney(record.amountCents)} · {"paidBy" in record?"Paid by "+name(record.paidBy):name(record.from)+" → "+name(record.to)}</Text>
      {"shares" in record?record.shares.map(share=><Text key={share.personId} style={s.label}>{name(share.personId)} · {sharedMoney(share.cents)}</Text>):null}
      {record.note?<Text style={s.label}>{record.note}</Text>:null}
     </View>;
    }):null}
    {history&&data.moreChanges?<Text style={s.label}>Showing the latest 20 changes.</Text>:null}
   </View>
   {!(entry.kind==="repayment"&&saved==="1")?<Button label="Back to balances" variant="secondary" onPress={()=>router.replace({pathname:"/shared",params:groupParams(data)})}/>:null}
  </>:null}
 </SharedFrame>;
}

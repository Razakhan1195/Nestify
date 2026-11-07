import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {groupParams} from "@/lib/shared-expenses";
import {useLocalSearchParams,useNavigation,useRouter} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import {useEffect,useRef,useState} from "react";
import {Alert,Text,View} from "react-native";
import {Feather} from "@expo/vector-icons";
import {QuietAction} from "@/components/Brief";
import { typography } from "@/theme/tokens";
import {Button} from "@/components/Button";
import {DateField} from "@/components/DateField";
import {TextField} from "@/components/TextField";
import {Surface} from "@/components/ui/Surface";
import {SharedFrame,SharedLoading,SharedNotice,getSharedStyles,useSharedLedger} from "@/components/SharedExpenseUI";
import {remindSharedBalance,sharedDate,localToday,pendingSharedSave,saveSharedExpense,sharedPersonName,type SharedPayload,type SharedCommand} from "@/lib/shared-expenses";
import {centsInput,parseCadCents,sharedMoney} from "@/lib/shared-expense-math";
import {ApiError} from "@/lib/api";

function Repayment({data,from,to,onReloadLatest}:{data:SharedPayload;from:string;to:string;onReloadLatest:()=>Promise<void>}){
  const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const router=useRouter(),navigation=useNavigation(),lock=useRef(false),attempt=useRef<SharedCommand|null>(null),pair=data.balances.find(b=>b.from===from&&b.to===to);
 const [amount,setAmount]=useState(pair?centsInput(pair.cents):""),[date,setDate]=useState(localToday()),[note,setNote]=useState(""),[error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false),[saved,setSaved]=useState<string|null>(null);
 const [uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[detailsOpen,setDetailsOpen]=useState(false),[reminding,setReminding]=useState(false),[reminder,setReminder]=useState<string|null>(null);
 const self=data.people.find(p=>p.self)?.id, outgoing=self===from,incoming=self===to;
 const other=data.people.find(p=>p.id===(outgoing?to:from));
 const action=outgoing?"Record payment sent":incoming?"Record payment received":"Record repayment";
 const cents=parseCadCents(amount),canRecord=data.role==="owner"||data.people.some(p=>p.self&&(p.id===from||p.id===to));
 const valid=Boolean(!data.archived&&pair&&cents&&cents<=pair.cents&&date<=localToday()&&date>="2000-01-01"&&canRecord);
 usePreventRemove(!saved&&Boolean(note||saving||date!==localToday()||amount!==(pair?centsInput(pair.cents):"")),({data:action})=>{
  if(saving){Alert.alert("Recording repayment","Wait for the result before leaving.");return;}
  Alert.alert("Leave this repayment?","Unsaved changes will be discarded. Any interrupted save can be checked from Shared expenses.",[{text:"Keep editing",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(action.action)}]);
 });
 useEffect(()=>{if(saved)router.replace({pathname:"/shared/[id]",params:groupParams(data,{id:saved,saved:"1"})});},[saved,router,data]);
 async function save(){
  if(lock.current||(!uncertain&&!valid))return;lock.current=true;setSaving(true);setError(null);
  try{const command=uncertain&&attempt.current?attempt.current:{operation:"create" as const,kind:"repayment" as const,expectedBalanceCents:pair!.cents,details:{from,to,amountCents:cents!,happenedOn:date,note:note.trim()}};attempt.current=command;const r=await saveSharedExpense(data.home.id,command,data.groupId,data.viewerId);setSaved(r.id!);}
  catch(e){const pending=await pendingSharedSave().catch(()=>undefined);const rejected=e instanceof ApiError&&[400,403,404,409].includes(e.status);setUncertain(Boolean(pending)||(!rejected&&pending===undefined));setConflict(e instanceof ApiError&&e.status===409&&!pending);setError(pending?"We couldn’t confirm the repayment. Check the saved attempt before changing it.":e instanceof ApiError?e.message:"Could not confirm this repayment. Retry with the same details.");}
  finally{lock.current=false;setSaving(false);}
 }
 async function remind(){
  if(lock.current)return;lock.current=true;setReminding(true);setError(null);
  try{const result=await remindSharedBalance(data.home.id,from,to);setReminder(result.alreadySent?"A reminder was already added in the last 24 hours.":"Reminder added to their Rezlee inbox. Phone delivery depends on their notification settings.");}
  catch(e){setError(e instanceof ApiError?e.message:"Could not confirm the reminder. Try again.");}
  finally{lock.current=false;setReminding(false);}
 }
 if(!pair||!canRecord)return <><SharedNotice message={!pair?"There is no outstanding balance between these people. Return to Shared expenses to see the latest balances.":"You can record repayments you sent or received. The household owner can also record them."}/><Button label="Back to balances" variant="secondary" onPress={()=>router.replace({pathname:"/shared",params:groupParams(data)})}/></>;
 return <>
  <Surface tone="subtle" style={{gap:12}}>
   <View style={{flexDirection:"row",gap:12,alignItems:"center"}}><View style={{width:48,height:48,borderRadius:24,backgroundColor:colors.accent,alignItems:"center",justifyContent:"center"}}><Feather name="user" size={24} color={colors.primary}/></View><View style={{flex:1,gap:4}}><Text style={s.label}>{outgoing?"Settle with":incoming?"Payment from":"Record payment"}</Text><Text style={s.heading}>{outgoing||incoming?other?.name:sharedPersonName(data.people,from)+" → "+sharedPersonName(data.people,to)}</Text></View></View>
   <Text style={[typography.display,{color:colors.foreground,fontVariant:["tabular-nums"]}]}>{sharedMoney(pair.cents)}</Text>
   <Text style={s.label}>{outgoing?"You owe "+other?.name:incoming?other?.name+" owes you":"Outstanding balance"}</Text>
  </Surface>
  {error?<SharedNotice message={error}/>:null}
  {conflict?<Button label="Refresh outstanding balance" variant="secondary" onPress={()=>void onReloadLatest()}/>:null}
  <View pointerEvents={saving||uncertain||conflict?"none":"auto"} style={{gap:20}}>
   <TextField label="Payment amount (CAD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={12} editable={!saving&&!uncertain&&!conflict}/>
   {cents&&cents>pair.cents?<Text style={s.label}>Use an amount up to {sharedMoney(pair.cents)}. You can record a partial repayment.</Text>:null}
   <QuietAction label={detailsOpen?"Hide date and note":(date===localToday()?"Today":sharedDate(date))+" · Date & note"} onPress={()=>setDetailsOpen(v=>!v)}/>
   {detailsOpen?<><DateField label="Payment date" value={date} onChange={setDate}/>
   <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} editable={!saving&&!uncertain&&!conflict} placeholder="Interac e-Transfer, cash…"/></>:null}
  </View>
  {cents!==null&&cents>0&&cents<=pair.cents?<View accessibilityLiveRegion="polite" style={{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:8}}><Feather name={cents===pair.cents?"check-circle":"arrow-right"} size={20} color={colors.primary}/><Text style={[s.body,{flex:1}]}>{cents===pair.cents?"This will settle this balance.":sharedMoney(pair.cents-cents)+" will remain."}</Text></View>:null}
  <Button label={uncertain?"Check saved repayment":action} loading={saving} disabled={reminding||conflict||(!uncertain&&!valid)} onPress={()=>uncertain?void save():Alert.alert("Already "+(incoming?"received":"sent")+" this money?","Record "+sharedMoney(cents??0)+" from "+sharedPersonName(data.people,from)+" to "+sharedPersonName(data.people,to)+". This updates your shared balance. No money moves through Rezlee.",[{text:"Cancel",style:"cancel"},{text:"Record",onPress:()=>void save()}])}/>
  {reminder?<Text accessibilityLiveRegion="polite" style={s.body}>{reminder}</Text>:incoming&&data.settlementNotices&&other&&["owner","member"].includes(other.state)?<Button label="Send reminder" variant="secondary" loading={reminding} disabled={saving||uncertain||conflict} onPress={()=>Alert.alert("Remind "+other.name+"?","A reminder to review this balance will appear in their Rezlee inbox. They may also receive a push notification. You can remind once every 24 hours.",[{text:"Cancel",style:"cancel"},{text:"Send reminder",onPress:()=>void remind()}])}/>:null}
  {other&&!["owner","member"].includes(other.state)?<Text style={s.label}>{other.name} hasn’t joined this household. This payment can still be recorded, but they won’t receive an app notification.</Text>:null}
  <Text style={s.label}>Only record money already sent or received. This is a shared record, not a payment confirmation from your bank.</Text>
 </>;
}
export default function RecordRepayment(){
 const [formVersion,setFormVersion]=useState(0);
 const {from="",to=""}=useLocalSearchParams<{from:string;to:string}>(),{data,error,busy,load}=useSharedLedger();
 return <SharedFrame title="Settle up">
  {error?<SharedNotice message={error} onRetry={()=>void load()}/>:null}{busy&&!data?<SharedLoading/>:null}
  {data&&!error?<Repayment key={data.home.id+from+to+formVersion} data={data} from={from} to={to} onReloadLatest={async()=>{if(await load())setFormVersion(v=>v+1);}}/>:null}
 </SharedFrame>;
}

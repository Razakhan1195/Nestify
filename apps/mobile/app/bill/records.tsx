import { openSavedOriginal } from "@/lib/open-saved-original";
import { useTheme } from "@/theme/useTheme";
import {useCallback,useRef,useState} from "react";
import {useFocusEffect,useLocalSearchParams,useRouter} from "expo-router";
import {ActivityIndicator,Alert,Pressable,ScrollView,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Surface} from "@/components/ui/Surface";
import {Button} from "@/components/Button";
import {QuietAction,BriefRow} from "@/components/Brief";
import {apiGet,apiPost,ApiError} from "@/lib/api";
import {canCountBillOnce,recordPeriod,recordAmountLabel,recordChanges,recordMoney,recordSource,unresolvedBillCopies,type BillRecord,type BillRecordPayload} from "@/lib/bill-record-review";
import { spacing, typography } from "@/theme/tokens";
export default function BillRecords(){const {billId}=useLocalSearchParams<{billId:string}>();return <Records key={billId} id={billId}/>;}
function Records({id}:{id:string}){
  const { colors } = useTheme();

 const router=useRouter(),lock=useRef(false);const [data,setData]=useState<BillRecordPayload|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null),[other,setOther]=useState<BillRecord|null>(null),[selected,setSelected]=useState<string|null>(null),[history,setHistory]=useState(false);
 const endpoint="/api/mobile/v1/bills/"+encodeURIComponent(id)+"/records";
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await apiGet<BillRecordPayload>(endpoint,{timeoutMs:15000}));setOther(null);setSelected(null);}catch(e){setError(e instanceof ApiError?e.message:"Could not load statement records. Check your connection and try again.");}finally{setLoading(false);}},[endpoint]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function original(b:BillRecord){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{const r=await apiGet<{url:string}>("/api/mobile/v1/bills/"+b.id+"/original",{timeoutMs:15000});await openSavedOriginal(r.url);}catch(e){setError(e instanceof ApiError?e.message:"Could not open the original. Try again.");}finally{lock.current=false;setBusy(false);}}
 async function earlierOriginal(documentId:string){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{const r=await apiGet<{url:string}>("/api/mobile/v1/vault/records?id="+encodeURIComponent(documentId)+"&file=1",{timeoutMs:15000});await openSavedOriginal(r.url);}catch(e){setError(e instanceof ApiError?e.message:"The earlier original is unavailable. It may have been removed from Vault.");}finally{lock.current=false;setBusy(false);}}
 async function save(selectedId:string|null){if(!data||!other||lock.current)return;lock.current=true;setBusy(true);setError(null);try{await apiPost(endpoint,{otherId:other.id,fingerprint:data.bill.fingerprint,otherFingerprint:other.fingerprint,selectedId},{timeoutMs:20000});setSuccess(selectedId?"Choice saved. Only your selected record counts in bill history. Both originals are kept.":"Both records kept. Nothing was combined.");await load();}catch(e){setError(e instanceof ApiError?e.message:"Could not confirm this choice. Reload to check before retrying.");}finally{lock.current=false;setBusy(false);}}
 function choose(b:BillRecord){setOther(b);setSelected(null);setSuccess(null);setError(null);}
 const text=(value:string)=><Text style={[typography.body,{color:colors.mutedForeground}]}>{value}</Text>;
 function card(b:BillRecord,selectable=false){return <Surface style={{gap:spacing.sm,...(selectable&&selected===b.id?{borderColor:colors.primary,borderWidth:2}:{})}}>
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>{recordSource(b)}</Text>
  <Text style={[typography.section,{color:colors.foreground}]}>{b.providerName??b.name}</Text>
  {b.account?text(b.account):text("Account not recorded")}
  <View style={{gap:4}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>{recordAmountLabel(b)}</Text><Text style={[typography.section,{color:colors.foreground}]}>{recordMoney(b)}</Text></View>
  {text(recordPeriod(b))}
  {b.originalDocumentId?<QuietAction label="Open original" disabled={busy} onPress={()=>void original(b)}/>:text("No original file attached")}
  {selectable?<Pressable accessibilityRole="radio" accessibilityState={{checked:selected===b.id,disabled:busy}} disabled={busy} onPress={()=>setSelected(b.id)} style={{paddingVertical:spacing.md,minHeight:48}}><Text style={[typography.body,{fontWeight:"600",color:colors.primary}]}>{selected===b.id?"✓ Selected for history":"Use this record"}</Text></Pressable>:null}
 </Surface>;}
 const pending=data?.enabled?unresolvedBillCopies(data):[];
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}><ScreenNavigation title="Statement records" fallback={"/bill/"+id}/><ScrollView contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
  {loading?<ActivityIndicator accessibilityLabel="Loading statement records"/>:null}
  {error?<View style={{gap:spacing.sm}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><QuietAction label="Reload saved records" disabled={busy} onPress={()=>void load()}/></View>:null}
  {!loading&&data&&!data.enabled?text("Statement review is unavailable right now. Your saved bills are unchanged."):null}
  {!loading&&data?.enabled?<>
   {success?<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.primary}]}>{success}</Text>:null}
   {other?<>
    <Text style={[typography.section,{color:colors.foreground}]}>Compare saved records</Text>
    {text(canCountBillOnce(data.bill,other)?"Check the account and original. If these are the same bill, choose one record for history. Both originals stay.":"These records describe different information. Keep both so charges, balances and utility data stay available.")}
    {!canCountBillOnce(data.bill,other)?text("Different amount labels do not by themselves indicate an error."):null}
    {card(data.bill,canCountBillOnce(data.bill,other))}{card(other,canCountBillOnce(data.bill,other))}
    {canCountBillOnce(data.bill,other)?<Button label="Save selected record" disabled={busy||!selected} loading={busy} onPress={()=>{if(selected)Alert.alert("Count this record once?","The other copy stays accessible here. Shared expenses and payment records are unchanged.",[{text:"Cancel",style:"cancel"},{text:"Confirm choice",onPress:()=>void save(selected)}]);}}/>:null}
    <QuietAction label={canCountBillOnce(data.bill,other)?"These are different bills":"Keep both records"} disabled={busy} onPress={()=>void save(null)}/>
    <QuietAction label="Back to records" disabled={busy} onPress={()=>{setOther(null);setSelected(null);}}/>
   </>:<>
    {card(data.bill)}
    {pending.length?<View style={{gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>Possible copies</Text>{text("Same provider and period. Confirm the account before combining.")}{pending.map(b=><BriefRow key={b.id} title={recordSource(b)+" · "+recordMoney(b)} detail={b.account??"Account not recorded"} onPress={()=>choose(b)}/>)}</View>:null}
    {data.choices.map(c=><Surface key={c.other.id} tone="subtle" style={{gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>{!c.current?"Check your previous choice":c.selectedId?"Two records, counted once":"Both records kept"}</Text>{text(recordSource(c.other)+" · "+recordMoney(c.other))}{!c.current?text("A statement changed. Both records are visible again until you review the change."):null}{c.selectedId&&c.current?<QuietAction label="Open record used in history" disabled={busy} onPress={()=>router.push("/bill/"+c.selectedId)}/>:null}{c.other.originalDocumentId?<QuietAction label="Open other original" disabled={busy} onPress={()=>void original(c.other)}/>:null}<QuietAction label="Review or change choice" disabled={busy} onPress={()=>choose(c.other)}/></Surface>)}
    <QuietAction label={history?"Hide change history":"View change history"} onPress={()=>setHistory(v=>!v)}/>
    {history?<View style={{gap:spacing.md}}>{!data.versions.length?text("No changes recorded since change history was enabled. Earlier versions cannot be reconstructed."):text("Previous values are retained when a saved statement changes. A change does not by itself mean an error or a saving.")}{data.versions.map((v,i)=>{const next=i===0?data.bill:data.versions[i-1].snapshot;const changes=recordChanges(v.snapshot,next);return <Surface key={v.id} tone="subtle" style={{gap:spacing.sm}}><Text style={[typography.meta,{color:colors.foreground}]}>Changed {new Date(v.recordedAt).toLocaleDateString("en-CA")}</Text>{changes.length?changes.map(c=><View key={c.label} style={{gap:4}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>{c.label}</Text>{text(c.before+" → "+c.after)}</View>):text("Supporting statement details changed.")}{v.snapshot.originalDocumentId&&v.snapshot.originalDocumentId!==next.originalDocumentId?<QuietAction label="Open earlier original" disabled={busy} onPress={()=>void earlierOriginal(v.snapshot.originalDocumentId!)}/>:null}</Surface>;})}{data.moreVersions?text("Showing the 20 most recent changes. Earlier saved versions are retained."):null}</View>:null}
    {!pending.length&&!data.choices.length?text("No matching statement copies found in the checked history."):null}
    {data.moreCandidates?text("Only the first 50 records for this period were checked. This is not a complete duplicate check."):null}
   </>}
  </>:null}
 </ScrollView></SafeAreaView>;
}

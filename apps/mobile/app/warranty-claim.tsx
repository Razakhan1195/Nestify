import { useTheme } from "@/theme/useTheme";
import {useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,Pressable,Share,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Redirect,useRouter} from "expo-router";
import {usePreventRemove,useNavigation} from "expo-router/react-navigation";
import {randomUUID} from "expo-crypto";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {FormScrollView} from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel} from "@/components/JourneyUI";
import {TextField} from "@/components/TextField";
import {Button} from "@/components/Button";
import {apiGet,apiPost,ApiError} from "@/lib/api";
import {manualWarrantyDraft,type ClaimReceipt} from "@/lib/warranty-claim";
import { spacing, typography } from "@/theme/tokens";
type Entry={id:string;kind:"document"|"item";title:string;detail:string};
type Cursor={time:string;id:string;kind:"document"|"item"};
type Page={rows:Entry[];nextCursor:Cursor|null;needsOnboarding?:boolean};
const endpoint="/api/mobile/v1/warranty-claims";
export default function WarrantyClaimScreen(){
  const { colors } = useTheme();

 const {session,isLoading}=useAuth();
 if(isLoading)return <ActivityIndicator color={colors.primary}/>;
 if(!session)return <Redirect href="/(auth)/login"/>;
 return <ClaimForm key={session.user.id} userId={session.user.id}/>;
}
function ClaimForm({userId}:{userId:string}){
  const { colors } = useTheme();

 const router=useRouter(),navigation=useNavigation();
 const [item,setItem]=useState(""),[issue,setIssue]=useState(""),[query,setQuery]=useState("");
 const [rows,setRows]=useState<Entry[]>([]),[cursor,setCursor]=useState<Cursor|null>(null),[selected,setSelected]=useState<Entry[]>([]);
 const [history,setHistory]=useState<ClaimReceipt[]>([]),[receipt,setReceipt]=useState<ClaimReceipt|null>(null);
 const [confirmed,setConfirmed]=useState(false),[ai,setAi]=useState(false),[loaded,setLoaded]=useState(false),[checkingAvailability,setCheckingAvailability]=useState(true);
 const [busy,setBusy]=useState(false),[searching,setSearching]=useState(true),[error,setError]=useState<string|null>(null);
 const [draft,setDraft]=useState(""),[dirty,setDirty]=useState(false),[stale,setStale]=useState(false),[expired,setExpired]=useState(false);
 const [requestId,setRequestId]=useState<string|null>(null);
 const inFlight=useRef(false),alive=useRef(true),searchVersion=useRef(0);
 const textStyle=[typography.body,{color:colors.foreground}];
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function search(next:Cursor|null=null){
  const version=++searchVersion.current;setSearching(true);setError(null);
  try{
   const result=await apiGet<Page>("/api/mobile/v1/vault/search?view=documents&q="+encodeURIComponent(query.trim())+(next?"&cursor="+encodeURIComponent(JSON.stringify(next)):""),{expectedUserId:userId});
   if(!alive.current||version!==searchVersion.current)return;
   if(result.needsOnboarding){router.replace("/onboarding");return;}
   setRows(old=>next?[...new Map([...old,...result.rows].map(r=>[r.id,r])).values()]:result.rows);setCursor(result.nextCursor);
  }catch(e){if(alive.current&&version===searchVersion.current)setError(e instanceof ApiError?e.message:"Could not find your records. Try again.");}
  finally{if(alive.current&&version===searchVersion.current)setSearching(false);}
 }
 async function load(){
  setCheckingAvailability(true);
  try{
   const result=await apiGet<{drafts:ClaimReceipt[];aiAvailable:boolean}>(endpoint,{expectedUserId:userId});
   if(!alive.current)return;setHistory(result.drafts);setAi(result.aiAvailable);setLoaded(true);
  }catch(e){if(alive.current)setError(e instanceof ApiError?e.message:"Could not check earlier readings.");}
  finally{if(alive.current)setCheckingAvailability(false);}
 }
 // Load private records and reading receipts; AI starts only from the explicit action.
 useEffect(()=>{
  let active=true;const initialSearch=searchVersion.current;
  void (async()=>{
   const results=await Promise.allSettled([
    apiGet<{drafts:ClaimReceipt[];aiAvailable:boolean}>(endpoint,{expectedUserId:userId}),
    apiGet<Page>("/api/mobile/v1/vault/search?view=documents&q=",{expectedUserId:userId}),
   ]);
   if(!active)return;
   const [previous,records]=results;setCheckingAvailability(false);
   if(previous.status==="fulfilled"){setHistory(previous.value.drafts);setAi(previous.value.aiAvailable);setLoaded(true);}
   else setError(previous.reason instanceof ApiError?previous.reason.message:"Could not check earlier readings.");
   if(initialSearch!==searchVersion.current)return;
   setSearching(false);
   if(records.status==="fulfilled"){
    if(records.value.needsOnboarding){router.replace("/onboarding");return;}
    setRows(records.value.rows);setCursor(records.value.nextCursor);
   }else setError(records.reason instanceof ApiError?records.reason.message:"Could not load your records. Search to try again.");
  })();
  return()=>{active=false;};
 },[userId,router]);
 usePreventRemove(busy||dirty,({data})=>{
  if(busy){Alert.alert("Reading in progress","Wait for the reading to finish. Nothing is being sent to the warranty provider.");return;}
  Alert.alert("Leave this draft?","Edits on this screen will be discarded. Saved readings remain available in warranty assistance.",[{text:"Keep editing",style:"cancel"},{text:"Leave",style:"destructive",onPress:()=>navigation.dispatch(data.action)}]);
 });
 function accept(r:ClaimReceipt,changed=false,timedOut=false,preserveEdits=false){
  setReceipt(r);setRequestId(r.request_id);setItem(r.input.itemName);setIssue(r.input.issue);setConfirmed(true);
  setSelected(r.input.sources.map(s=>({id:s.id,title:s.title,kind:"document",detail:"Selected record"})));
  setStale(changed);setExpired(timedOut);if(!preserveEdits){setDraft(r.result?.draft??"");setDirty(false);}
 }
 async function check(id=requestId){
  if(!id||inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);
  try{
   const result=await apiGet<{draft:ClaimReceipt;sourceChanged:boolean;readingExpired:boolean}>(endpoint+"?requestId="+id,{expectedUserId:userId});
   if(alive.current)accept(result.draft,result.sourceChanged,result.readingExpired,Boolean(draft&&dirty&&id===requestId));
  }catch(e){if(alive.current){setError(e instanceof ApiError?e.message:"Could not check the reading.");if(e instanceof ApiError&&e.status===404)setRequestId(null);}}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 async function read(){
  if(inFlight.current||!loaded||!ai||!confirmed||!selected.length||!item.trim()||issue.trim().length<10)return;
  inFlight.current=true;setBusy(true);setError(null);
  const id=requestId??randomUUID();setRequestId(id);
  try{
   const result=await apiPost<{draft:ClaimReceipt}>(endpoint,{requestId:id,documentIds:selected.map(r=>r.id),itemName:item,issue,recordsConfirmed:true},{timeoutMs:55000,expectedUserId:userId});
   if(alive.current){accept(result.draft);void load();}
  }catch(e){if(alive.current)setError(e instanceof ApiError?e.message:"Could not confirm this reading. Check its status before starting again.");}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 function changeReading(){
  setReceipt(null);setRequestId(null);setDraft("");setStale(false);setExpired(false);setConfirmed(false);setDirty(true);
 }
 function openReading(id:string){
  if(dirty)Alert.alert("Open saved reading?","This will discard edits on this screen.",[{text:"Keep editing",style:"cancel"},{text:"Open reading",onPress:()=>void check(id)}]);
  else void check(id);
 }
 const locked=busy||!!requestId||Boolean(draft),canRead=loaded&&ai&&confirmed&&selected.length>0&&item.trim().length>0&&issue.trim().length>=10;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title="Warranty assistance" fallback="/(tabs)/vault"/>
  <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   <JourneyHeading title="Prepare a warranty request." detail="Bring the receipt and warranty together, check the wording and prepare a message for the provider."/>
   {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
   {!loaded&&!checkingAvailability?<Button label="Check availability again" variant="secondary" onPress={()=>void load()}/>:null}
   {history.length&&!receipt?<JourneyPanel><Text style={textStyle}>Recent readings</Text>{history.slice(0,5).map(r=><Button key={r.request_id} variant="secondary" label={r.input.itemName+" · "+(r.state==="ready"?"Review":r.state==="failed"?"Reading incomplete":"Check reading")} disabled={busy} onPress={()=>openReading(r.request_id)}/>)}</JourneyPanel>:null}
   <JourneyPanel>
    <TextField label="Item name" value={item} maxLength={200} editable={!locked} onChangeText={v=>{setItem(v);setDirty(true);}}/>
    <TextField label="What happened?" value={issue} maxLength={2000} multiline editable={!locked} onChangeText={v=>{setIssue(v);setDirty(true);}}/>
    <Text style={textStyle}>Choose up to two saved records, such as the receipt and warranty. Only selected records are read.</Text>
    {selected.map(r=><View key={r.id} style={{gap:6}}><Text style={textStyle}>{r.title}</Text>{!locked?<Button label={"Remove "+r.title} variant="secondary" onPress={()=>{setSelected(old=>old.filter(x=>x.id!==r.id));setConfirmed(false);setDirty(true);}}/>:null}</View>)}
    {!locked?<>
     <TextField label="Find receipt or warranty" value={query} maxLength={100} onChangeText={v=>{searchVersion.current++;setQuery(v);setRows([]);setCursor(null);setSearching(false);}} onSubmitEditing={()=>void search()}/>
     <Button label="Search records" variant="secondary" disabled={searching} onPress={()=>void search()}/>
     {searching?<ActivityIndicator color={colors.primary}/>:null}
     {!searching&&!rows.length?<Text style={textStyle}>No records shown. Search by name, or add the receipt or warranty in Vault.</Text>:null}
     {rows.filter(r=>!selected.some(s=>s.id===r.id)).map(r=><Pressable key={r.id} accessibilityRole="button" accessibilityLabel={"Select "+r.title} disabled={selected.length>=2} onPress={()=>{setSelected(old=>[...old,r]);setConfirmed(false);setDirty(true);}} style={{paddingVertical:12,opacity:selected.length>=2?0.5:1,borderBottomWidth:1,borderColor:colors.border}}><Text style={textStyle}>{r.title}</Text><Text style={{color:colors.mutedForeground}}>{r.detail}</Text></Pressable>)}
     {cursor?<Button label="Load more records" variant="secondary" disabled={searching} onPress={()=>void search(cursor)}/>:null}
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed}} onPress={()=>setConfirmed(v=>!v)} style={{paddingVertical:12,minHeight:48}}><Text style={textStyle}>{confirmed?"☑":"☐"} These records are for this item. I will check the original wording before relying on it.</Text></Pressable>
     <Button label="Read selected records" disabled={!canRead} loading={busy} onPress={()=>void read()}/>
    </>:null}
    {draft&&!receipt?<Button label="Change item or problem" variant="secondary" disabled={busy} onPress={()=>Alert.alert("Replace this draft?","This clears the message so you can change the item or problem.",[{text:"Keep draft",style:"cancel"},{text:"Change details",onPress:changeReading}])}/>:null}
    {!ai&&loaded?<Text style={textStyle}>Automatic reading is unavailable. You can still prepare a request yourself below.</Text>:null}
    {requestId?<Button label={busy?"Checking…":"Check reading status"} variant="secondary" disabled={busy} onPress={()=>void check()}/>:null}
    {receipt?.state==="reading"?<Text style={textStyle}>{expired?"This reading did not finish in time. Check once more or start a new reading.":"The reading is still in progress. Check its status; the same request will not run twice."}</Text>:null}
    {receipt?.state==="failed"?<Text style={textStyle}>No usable reading was saved. Your originals are unchanged. You can write the request yourself or start a new reading.</Text>:null}
    {receipt&&(receipt.state!=="reading"||expired)?<Button label="Change details or start a new reading" variant="secondary" disabled={busy} onPress={()=>{if(dirty)Alert.alert("Replace current draft?","This clears edits on this screen.",[{text:"Keep editing",style:"cancel"},{text:"Start new reading",onPress:changeReading}]);else changeReading();}}/>:null}
   </JourneyPanel>
   {receipt?.result?<JourneyPanel>
    <Text style={[typography.section,{color:colors.foreground}]}>Check against the originals</Text>
    {stale?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>An original changed or was removed. These findings may be out of date; read the current records again before using them.</Text>:null}
    {receipt.result.warnings.map(w=><Text key={w} style={textStyle}>{w}</Text>)}
    {receipt.result.evidence.facts.map((fact,index)=>{const source=receipt.result!.sources.find(s=>s.id===fact.sourceId);return <View key={index} style={{gap:8}}><Text style={{color:colors.mutedForeground}}>{fact.kind} · {source?.title??"Selected record"}{fact.page?" · page "+fact.page:""}</Text><Text selectable style={textStyle}>“{fact.excerpt}”</Text><Button label="Open source record" variant="secondary" onPress={()=>router.push({pathname:"/vault-record",params:{id:fact.sourceId}})}/></View>;})}
    <Text style={textStyle}>File passages were read by AI and need checking against the original. No provider has confirmed coverage.</Text>
   </JourneyPanel>:null}
   <JourneyPanel>
    <Text style={[typography.section,{color:colors.foreground}]}>Your request</Text>
    {!draft?<Button label="Write a request without AI" variant="secondary" disabled={busy||!item.trim()||issue.trim().length<10} onPress={()=>{setDraft(manualWarrantyDraft(item,issue));setDirty(true);}}/>:null}
    {draft?<><TextField label="Review and edit your message" value={draft} multiline maxLength={6000} onChangeText={v=>{setDraft(v);setDirty(true);}}/><Text style={textStyle}>Check product details, dates and the recipient. Attach the originals separately if needed. Nothing is sent automatically. Edits stay on this screen until you copy or share them.</Text><Button label="Share reviewed draft" disabled={busy||stale||!draft.trim()} onPress={()=>void Share.share({message:draft}).catch(()=>setError("Could not open sharing. You can select and copy the message instead."))}/></>:null}
   </JourneyPanel>
  </FormScrollView>
 </SafeAreaView>;
}

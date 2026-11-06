import { safeBack } from "@/lib/navigation";
import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel,JourneySteps,JourneyDisclosure} from "@/components/JourneyUI";
import {EnergyEvidenceReview} from "@/components/EnergyEvidenceReview";
import {energyEvidenceError,type EnergyEvidence} from "@/lib/energy-evidence";
import {fillEmptyStatementFields,type StatementSuggestions} from "@/lib/statement-suggestions";
import {useCallback,useEffect,useRef,useState} from "react";
import {useLocalSearchParams,useNavigation,useFocusEffect,useRouter} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, AppState, Linking, Text, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {QuietAction} from "@/components/Brief";
import {TextField} from "@/components/TextField";
import {DateField} from "@/components/DateField";
import {apiGet,apiPatch,apiPost,ApiError} from "@/lib/api";
import {evidenceDefaults,evidenceError,explainStatement,type StatementEvidence} from "@/lib/statement-evidence";
import {colors,spacing,typography} from "@/theme/tokens";
type Reading={enabled:boolean;attempt:{status:string;result:StatementSuggestions|null}|null};
type Payload={id:string;title:string;amount:number|null;category:string;periodStart:string|null;periodEnd:string|null;version:string;hasOriginal:boolean;fields:StatementEvidence;reviewedAt:string|null;needsReview:boolean;statementReaderSupported?:boolean;energyEvidenceSupported?:boolean;energy?:EnergyEvidence|null;energyNeedsReview?:boolean};
export default function StatementDetails(){
 const {session}=useAuth();
 const {billId,intent}=useLocalSearchParams<{billId:string;intent?:string}>();
 return <Details key={(session?.user.id??"signed-out")+":"+billId} id={billId} signedIn={Boolean(session)} readingFirst={intent==="read"}/>;
}
function Details({id,signedIn,readingFirst}:{id:string;signedIn:boolean;readingFirst:boolean}){
 const navigation=useNavigation(),router=useRouter(),lock=useRef(false);
 const [energy,setEnergy]=useState<EnergyEvidence|null>(null),[energyTouched,setEnergyTouched]=useState(false);
 const [data,setData]=useState<Payload|null>(null),[fields,setFields]=useState({...evidenceDefaults});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[editing,setEditing]=useState(false);
 const [error,setError]=useState<string|null>(null),[success,setSuccess]=useState(false),[reviewed,setReviewed]=useState(false),[section,setSection]=useState<string|null>(null);
 const [choice,setChoice]=useState<{key:"unit"|"reading";title:string;options:Array<{value:string;label:string}>}|null>(null);
 const [reading,setReading]=useState<Reading|null>(null),[readingError,setReadingError]=useState<string|null>(null),[showQuotes,setShowQuotes]=useState(false);
 const endpoint="/api/mobile/v1/bills/"+encodeURIComponent(id??"")+"/evidence";
 const fetchData=useCallback(()=>signedIn?apiGet<Payload>(endpoint,{timeoutMs:15000}):Promise.reject(new ApiError("Sign in to review this statement.",401)),[endpoint,signedIn]);
 const apply=useCallback((result:Payload)=>{setError(null);setData(result);setFields(result.fields);setEnergy(result.energy??null);setEnergyTouched(false);setEditing(!readingFirst&&Boolean(!result.reviewedAt||result.needsReview||result.energyNeedsReview));setDirty(false);setReviewed(false);setSuccess(false);setLoading(false);},[readingFirst]);
 const failed=useCallback((e:unknown)=>{setError(e instanceof ApiError?e.message:"Could not load this statement. Check your connection and try again.");setLoading(false);},[]);
 function load(){setLoading(true);void fetchData().then(apply,failed);}
 useEffect(()=>{let active=true;void fetchData().then(result=>{if(active)apply(result);},e=>{if(active)failed(e);});return()=>{active=false;};},[fetchData,apply,failed]);
 const readEndpoint=endpoint+"/read";
 useFocusEffect(useCallback(()=>{
  if(!data?.statementReaderSupported)return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  async function check(){
   if(AppState.currentState!=="active"){timer=setTimeout(()=>void check(),3000);return;}
   try{
    const result=await apiGet<Reading>(readEndpoint,{timeoutMs:15000});
    if(!active)return;setReading(result);setReadingError(null);
    if(result.attempt&&["queued","running"].includes(result.attempt.status))timer=setTimeout(()=>void check(),3000);
   }catch{if(active)setReadingError("Could not check statement reading. Your saved bill is unchanged.");}
  }
  void check();return()=>{active=false;if(timer)clearTimeout(timer);};
 },[readEndpoint,reading?.attempt?.status,data?.statementReaderSupported]));
 async function checkRead(){
  try{setReading(await apiGet<Reading>(readEndpoint,{timeoutMs:15000}));setReadingError(null);}
  catch{setReadingError("Could not check statement reading. Try again when connected.");}
 }
 async function startRead(){
  if(lock.current)return;lock.current=true;setBusy(true);setReadingError(null);
  try{setReading(await apiPost<Reading>(readEndpoint,{confirmed:true},{timeoutMs:15000}));}
  catch(e){setReadingError(e instanceof ApiError?e.message:"Could not confirm that reading started. Check status before trying again.");}
  finally{lock.current=false;setBusy(false);}
 }
 function useSuggestions(){
  const suggestions=reading?.attempt?.result;if(!suggestions)return;
  const next=fillEmptyStatementFields(fields,suggestions.fields);
  if(!energy&&!energyTouched&&suggestions.energy)setEnergy(suggestions.energy);
  setFields(next);setDirty(true);setReviewed(false);setEditing(true);setSection("money");setSuccess(false);
 }
 usePreventRemove(dirty||busy,({data:event})=>{
  if(busy){Alert.alert("Saving details","Wait for this save to finish before leaving.");return;}
  Alert.alert("Leave without saving?","Your saved statement stays unchanged. These edits will be lost.",[{text:"Keep editing",style:"cancel"},{text:"Discard edits",style:"destructive",onPress:()=>navigation.dispatch(event.action)}]);
 });
 function change(key:keyof StatementEvidence,value:string){setFields(v=>({...v,[key]:value}));setDirty(true);setReviewed(false);setSuccess(false);}
 async function save(){
  if(!data||lock.current||!reviewed)return;
  const invalid=evidenceError(fields)??(energy?energyEvidenceError(energy):null);if(invalid){setError(invalid);return;}
  lock.current=true;setBusy(true);setError(null);
  try{const result=await apiPatch<Payload>(endpoint,{fields,version:data.version,reviewed:true,...(data.energyEvidenceSupported?{energy}:{})},{timeoutMs:20000});setData(result);setFields(result.fields);setEnergy(result.energy??null);setEnergyTouched(false);setDirty(false);setEditing(false);setReviewed(false);setSuccess(true);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not confirm the save. Your edits remain here. Reload to check before retrying.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function original(){
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{const result=await apiGet<{url:string}>("/api/mobile/v1/bills/"+encodeURIComponent(id)+"/original",{timeoutMs:15000});await Linking.openURL(result.url);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not open the original. Try again.");}
  finally{lock.current=false;setBusy(false);}
 }
 const analysis=data?explainStatement(data,data.needsReview?evidenceDefaults:data.fields):null;
 const label=(s:string)=><Text style={[typography.body,{color:colors.mutedForeground}]}>{s}</Text>;
 const money=(key:keyof StatementEvidence,title:string)=><TextField label={title} value={fields[key]} maxLength={14} keyboardType="numbers-and-punctuation" editable={!busy} onChangeText={v=>change(key,v)}/>;
 function choose(key:"unit"|"reading",title:string,options:Array<{value:string;label:string}>){
  setChoice({key,title,options});
 }
 function reload(){
  if(dirty)Alert.alert("Reload saved details?","Unsaved edits will be discarded.",[{text:"Keep editing",style:"cancel"},{text:"Reload",style:"destructive",onPress:()=>void load()}]);else void load();
 }
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title={readingFirst?"Read saved bill":"Bill details"} fallback={"/bill/"+id}/>
  <View style={{flex:1}} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:24,paddingBottom:48}}>
   {loading?<ActivityIndicator accessibilityLabel="Loading statement details"/>:null}
   {error?<View style={{gap:spacing.sm}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><QuietAction label="Reload saved details" disabled={busy} onPress={reload}/></View>:null}
   {!loading&&data?<>
    <JourneyHeading eyebrow={data.title} title={editing?"Get the details right.":readingFirst?"From statement to understanding.":"The facts behind your bill."} detail="Keep the original close. Review the details before using them to explain a change."/>
    <JourneySteps labels={["Original","Review details","Saved evidence"]} current={editing?1:data.reviewedAt&&!data.needsReview&&!data.energyNeedsReview?2:0}/>
    {data.hasOriginal?<Button label="Open saved original" variant="secondary" disabled={busy} onPress={()=>void original()}/>:null}
    {editing?label("Review only the details printed on the original. Leave anything unknown blank."):null}
    {!data.hasOriginal?label("Attach the original from your bill, or enter the details you can verify."):null}
    {data.hasOriginal&&data.statementReaderSupported&&!reading&&!readingError&&!editing?<View style={{gap:spacing.sm}}><ActivityIndicator accessibilityLabel="Checking statement reader"/>{label("Checking your saved original…")}</View>:null}
    {readingFirst&&!editing&&data.hasOriginal&&(!data.statementReaderSupported||reading?.enabled===false)&&!reading?.attempt?label("Automatic reading is unavailable right now. Your original is safe; you can return later or enter verified details below."):null}
    {readingError?<View style={{gap:spacing.sm}}>{label(readingError)}<QuietAction label="Check reading status" disabled={busy} onPress={()=>void checkRead()}/></View>:null}
    {data.hasOriginal&&reading?.enabled&&!reading.attempt?<View style={{gap:spacing.sm}}>{label("Rezlee can suggest these details from the saved original. You will review them before saving.")}<Button label="Read saved statement" disabled={busy} onPress={()=>Alert.alert("Read this statement?","Send the saved original to Rezlee’s AI service? Your statement stays unchanged until you review and save. Existing corrections will not be replaced.",[{text:"Cancel",style:"cancel"},{text:"Read statement",onPress:()=>void startRead()}])}/></View>:null}
    {reading?.attempt&&["queued","running"].includes(reading.attempt.status)?<View style={{gap:spacing.sm}}><ActivityIndicator accessibilityLabel="Reading saved statement"/>{label("Reading your original. You can leave this screen and return; Rezlee will keep the result.")}</View>:null}
    {reading?.attempt?.status==="failed"?label("Reading did not finish reliably. It will not retry automatically. Open the original and enter the details you can verify."):null}
    {reading?.attempt?.status==="changed"?label("The statement changed after this reading. Use the original to review details; previous suggestions will not be applied."):null}
    {reading?.attempt?.status==="complete"&&reading.attempt.result?<JourneyPanel tone="soft">
     <Text style={[typography.section,{color:colors.foreground}]}>Suggestions ready to review</Text>
     {reading.attempt.result.notes.map((note,i)=><Text key={i} style={[typography.body,{color:colors.mutedForeground}]}>{note}</Text>)}
     {(Object.values(reading.attempt.result.fields).some(Boolean)||reading.attempt.result.energy?.lines.length)?<>
      <QuietAction label="Review extracted details" disabled={busy} onPress={useSuggestions}/>
      {label("Fields you already entered stay unchanged. Check all suggestions against the original before confirming.")}
      <QuietAction label={showQuotes?"Hide source excerpts":"Show source excerpts"} onPress={()=>setShowQuotes(v=>!v)}/>
      {showQuotes?Object.entries(reading.attempt.result.quotes).map(([key,quote])=><Text key={key} style={[typography.body,{color:colors.mutedForeground}]}>{key.replace(/([A-Z])/g," $1")}: “{quote}”</Text>):null}
     </>:label("No details could be safely prefilled. The original and manual fields remain available below.")}
    </JourneyPanel>:null}
    {data.needsReview||data.energyNeedsReview?label("The statement’s amount, account or period changed. Review these supporting details again before using them in an explanation."):null}
    {choice?<View style={{gap:spacing.sm}}><Text style={[typography.section,{color:colors.foreground}]}>{choice.title}</Text>{choice.options.map(o=><QuietAction key={o.value} label={o.label} disabled={busy} onPress={()=>{change(choice.key,o.value);setChoice(null);}}/>)}<QuietAction label="Cancel selection" onPress={()=>setChoice(null)}/></View>:null}
    {success?<View style={{gap:spacing.sm}}><Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.foreground}]}>Details saved. Your account insights will use these reviewed details.</Text><Button label="Back to account" onPress={()=>safeBack(router,id?"/bill/"+encodeURIComponent(id):"/(tabs)/bills")}/></View>:null}
    {editing?<View style={{gap:spacing.lg}}>
     {data.energyEvidenceSupported&&energy?<EnergyEvidenceReview value={energy} disabled={busy} onChange={v=>{setEnergy(v);setEnergyTouched(true);setDirty(true);setReviewed(false);setSuccess(false);}}/>:null}
     {data.energyEvidenceSupported&&!energy&&/electric|hydro|gas/i.test(data.category)?<QuietAction label="Add printed energy charges" disabled={busy} onPress={()=>{setEnergy({version:1,service:/gas/i.test(data.category)?"gas":"electricity",scope:"single_service",lines:[]});setEnergyTouched(true);setDirty(true);setReviewed(false);}}/>:null}
     <JourneyDisclosure label="Balances and charge breakdown" disabled={busy} open={section==="money"} onToggle={()=>setSection(section==="money"?null:"money")}>
      {label("Current-period charges stay as saved on the statement. Change that amount using Edit bill. Amount due and previous balance below are evidence only.")}
      {money("previousBalance","Previous balance shown (CAD)")}
      {money("amountDue","Amount due when issued (CAD)")}
      {label("For an arithmetic check, enter the subtotal before tax and before credits, the total tax, and total discounts/credits. Use 0 only when confirmed. If the bill uses a different structure, leave these blank.")}
      {money("subtotal","Subtotal before tax and credits (CAD)")}
      {money("tax","Tax for this period (CAD)")}
      {money("credits","Period discounts and credits (positive CAD)")}
     </JourneyDisclosure>
     <JourneyDisclosure label="Usage and reading details" disabled={busy} open={section==="usage"} onToggle={()=>setSection(section==="usage"?null:"usage")}>
      {label("Use consumption for this billing period, not the cumulative meter register. For multiple meters, mixed fuels or solar import/export, leave the total blank unless the statement clearly identifies a comparable total.")}
      <TextField label="Printed period usage" value={fields.usage} maxLength={17} keyboardType="decimal-pad" editable={!busy} onChangeText={v=>change("usage",v)}/>
      <QuietAction label={"Unit: "+(fields.unit||"Choose printed unit")} disabled={busy} onPress={()=>choose("unit","Usage unit",["","kWh","m³","GJ","L","Other"].map(v=>({value:v,label:v||"Not recorded"})))}/>
      <QuietAction label={"Reading: "+(fields.reading||"Not recorded")} disabled={busy} onPress={()=>choose("reading","Reading type",["","actual","estimated","mixed","unknown"].map(v=>({value:v,label:v||"Not recorded"})))}/>
      <TextField label="Printed plan name (optional)" value={fields.ratePlan} maxLength={120} editable={!busy} onChangeText={v=>change("ratePlan",v)}/>
     </JourneyDisclosure>
     <JourneyDisclosure label="Discount end date" disabled={busy} open={section==="discount"} onToggle={()=>setSection(section==="discount"?null:"discount")}>{label("Only record an explicitly stated discount end date. This does not create a reminder or assume what the future price will be.")}<DateField label="Discount ends" optional value={fields.discountEnds} disabled={busy} onChange={v=>change("discountEnds",v)}/></JourneyDisclosure>
     <Button label={reviewed?"Details checked ✓":"Confirm details match the original"} variant="secondary" disabled={busy} onPress={()=>setReviewed(v=>!v)}/>
     <Button label="Save reviewed details" loading={busy} disabled={busy||!reviewed} onPress={()=>void save()}/>
    </View>:!success?<QuietAction label={readingFirst?"Enter details instead":"Correct statement details"} disabled={busy} onPress={()=>{setEditing(true);setSuccess(false);}}/>:null}
    {!editing&&energy?<EnergyEvidenceReview value={energy}/>:null}
    {analysis&&data.reviewedAt&&!data.needsReview&&analysis.facts.length>0&&!readingFirst?<View style={{gap:spacing.md,borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.lg}}>
     <Text style={[typography.section,{color:colors.foreground}]}>{editing?"Based on saved details":"What this tells you"}</Text>
     {data.reviewedAt?label("Based on details you reviewed on "+data.reviewedAt.slice(0,10)+". This is not an independent audit of the provider."):label("No supporting details saved yet. You can still take the next step below.")}
     {analysis.facts.map((fact,i)=><Text key={i} style={[typography.body,{color:colors.foreground}]}>{fact}</Text>)}
     <Text style={[typography.section,{color:colors.foreground}]}>Next check</Text>
     {label(analysis.next)}
     {analysis.checks.slice(1).map((check,i)=><Text key={i} style={[typography.body,{color:colors.mutedForeground}]}>{check}</Text>)}
     {label("No overbilling or saving is established by this screen. Comparing billed usage with meter data requires matching units, meters, dates and complete readings.")}
    </View>:null}
   </>:null}
  </FormScrollView></View>
 </SafeAreaView>;
}


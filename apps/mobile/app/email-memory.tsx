import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading} from "@/components/JourneyUI";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter, useNavigation, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, AppState, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Surface } from "@/components/ui/Surface";
import { CollectionAddSheet } from "@/components/CollectionUI";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError, renewApiSession } from "@/lib/api";
import { newVaultSaveRequestId } from "@/lib/vault-save-intent";
import { savedBillDestination } from "@/lib/collection-navigation";
import { colors, spacing, typography } from "@/theme/tokens";

const endpoint="/api/mobile/v1/email-memory";
type Fields={title:string;category:string;issued_on:string;expires_on:string;notes:string};
type Bill={record_kind:"historical";bill_title:string;category:string;provider_name:string;account_number:string;amount:string;billing_period_start:string;billing_period_end:string;issue_date:string;due_date:string;notes:string};
type Job={id:string;title?:string;source?:string;originalName?:string|null;status:"reading"|"ready"|"failed"|"ignored"|"saved"|"discarded";canRetry:boolean;documentId:string|null;billId:string|null;
 proposal:{category:string;title:string|null;summary:string|null;evidence:string[];missing_detail:string|null;amount_due?:string|null;currency?:string|null;due_date?:string|null;provider?:string|null}|null;fields:Fields|null;bill:Bill|null;createdAt:string};
type Payload={jobs:Job[];homeId:string;homeName:string};
type Capability={enabled:boolean;reading:boolean;gmail?:boolean;homeId:string;homeName:string};
const categoryNames:Record<string,string>={utility_bill:"Bill details",service_invoice:"Service record",receipt:"Purchase record",warranty:"Warranty"};
export default function EmailMemoryScreen(){
 const params=useLocalSearchParams<{id?:string}>();
 const router=useRouter(),navigation=useNavigation();
 const [cap,setCap]=useState<Capability|null>(null),[jobs,setJobs]=useState<Job[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[text,setText]=useState(""),[consent,setConsent]=useState(false);
 const [selected,setSelected]=useState<Job|null>(null),[fields,setFields]=useState<Fields|null>(null),[bill,setBill]=useState<Bill|null>(null);
 const [reviewed,setReviewed]=useState(false),[details,setDetails]=useState(false),[dirty,setDirty]=useState(false);
 const [uploadChoices,setUploadChoices]=useState(false),[privacy,setPrivacy]=useState(false),[billDetails,setBillDetails]=useState(false);
 const [savePending,setSavePending]=useState(false);
 const [checking,setChecking]=useState(false);
 const checkLock=useRef(false);
 const lock=useRef(false),requestId=useRef<string|null>(null),lastText=useRef(""),pendingPayload=useRef<unknown>(null),active=useRef(false);
 const selectedId=useRef<string|null>(typeof params.id==="string"?params.id:null),jobsRef=useRef<Job[]>([]);
 const message=(e:unknown)=>e instanceof ApiError?e.message:"Could not connect. Your saved progress is kept. Try again.";
 usePreventRemove(dirty||busy,({data})=>{
  if(busy){Alert.alert("Checking your request","Please wait a moment before leaving.");return;}
  Alert.alert("Leave these changes?","Your unsaved text or corrections will be discarded. Started imports and saved records remain available.",[
   {text:"Keep editing",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)},
  ]);
 });
 const open=useCallback((job:Job)=>{
  selectedId.current=job.id;setSelected(job);setFields(job.fields);setBill(job.bill);setReviewed(false);setDetails(false);setBillDetails(false);setDirty(false);setSavePending(false);pendingPayload.current=null;setError(null);
 },[]);
 const refresh=useCallback(async()=>{
  const capabilities=await apiGet<Capability>(endpoint+"?capabilities=1",{timeoutMs:10000});
  if(!active.current)return;setCap(capabilities);
  if(capabilities.gmail && !params.id){router.replace("/gmail-memory");return;}
  if(capabilities.enabled){
   const payload=await apiGet<Payload>(endpoint+(params.id?"?id="+encodeURIComponent(String(params.id)):""),{timeoutMs:10000});
   if(!active.current)return;setJobs(payload.jobs);jobsRef.current=payload.jobs;
   const current=payload.jobs.find(j=>j.id===selectedId.current);
   if(current)setSelected(previous=>{
    if(!previous||previous?.status==="reading"||previous?.status==="failed"){
     if(current.status==="ready"){setFields(current.fields);setBill(current.bill);}
     return current;
    }return previous;
   });
  }
 },[params.id,router]);
 useFocusEffect(useCallback(()=>{
  active.current=true;
  void refresh().then(()=>{if(active.current)setError(null);}).catch(e=>{if(active.current)setError(message(e));}).finally(()=>{if(active.current)setLoading(false);});
  const interval=setInterval(()=>{if(active.current&&AppState.currentState==="active"&&jobsRef.current.some(j=>j.status==="reading"))void refresh().catch(e=>{if(active.current)setError(message(e));});},5000);
  return()=>{active.current=false;clearInterval(interval);};
 },[refresh]));
 async function checkSavedProgress(){
  if(checkLock.current||lock.current)return;
  checkLock.current=true;setChecking(true);
  try{
   await renewApiSession();
   await refresh();
   if(active.current)setError(null);
  }catch(e){if(active.current)setError(e instanceof ApiError&&e.status===401
   ?"Your sign-in could not be renewed. Sign in to Rezlee again with the same account, then reopen this import. Your saved progress is kept."
   :message(e));}
  finally{checkLock.current=false;if(active.current)setChecking(false);}
 }
 async function start(){
  if(lock.current||!cap?.reading||!consent||text.trim().length<20)return;
  lock.current=true;setBusy(true);setError(null);
  if(lastText.current!==text){requestId.current=newVaultSaveRequestId();lastText.current=text;}
  requestId.current??=newVaultSaveRequestId();
  try{
   const result=await apiPost<{id:string;status:Job["status"]}>(endpoint,{id:requestId.current,expectedHomeId:cap.homeId,text,consent:true},{timeoutMs:15000});
   const payload=await apiGet<Payload>(endpoint+"?id="+result.id,{timeoutMs:10000});
   open(payload.jobs[0]);setText("");setConsent(false);setDirty(false);await refresh();
  }catch(e){setError(message(e));}
  finally{lock.current=false;setBusy(false);}
 }
 async function save(){
  if(lock.current||!selected||!fields||!cap||(!reviewed&&!savePending))return;
  lock.current=true;setBusy(true);setError(null);
  pendingPayload.current??={id:selected.id,expectedHomeId:cap.homeId,reviewed:true,destination:bill?"bill":"record",record:fields,...(bill?{bill}:{})};
  setSavePending(true);
  try{
   const result=await apiPatch<{status:string;documentId:string;billId:string|null}>(endpoint,pendingPayload.current,{timeoutMs:25000});
   setSelected({...selected,status:"saved",documentId:result.documentId,billId:result.billId});
   setDirty(false);setSavePending(false);pendingPayload.current=null;await refresh();
  }catch(e){setError(message(e));if(e instanceof ApiError&&e.status===409){setSavePending(false);pendingPayload.current=null;setReviewed(false);}}
  finally{lock.current=false;setBusy(false);}
 }
 async function discard(){
  if(!selected||lock.current)return;
  const id=selected.id;lock.current=true;setBusy(true);setError(null);
  try{await apiDelete(endpoint+"?id="+id);setSelected(params.id?{...selected,status:"discarded",proposal:null}:null);selectedId.current=null;setFields(null);setBill(null);setDirty(false);setSavePending(false);pendingPayload.current=null;await refresh();}
  catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}
 }
 function confirmDiscard(){
  Alert.alert(selected?.status==="saved"?"Remove import entry?":"Discard this import?",selected?.status==="saved"?"This removes the import details. Your saved record and bill remain; delete them in Vault or Bills if you no longer want them.":"This removes the suggestions and stops any unfinished reading. Nothing will be added to your home.",[
   {text:"Keep",style:"cancel"},{text:"Remove",style:"destructive",onPress:()=>void discard()},
  ]);
 }
 function edit(key:keyof Fields,value:string){if(busy||savePending)return;setFields(p=>p?{...p,[key]:value}:p);setReviewed(false);setDirty(true);}
 function editBill(key:keyof Bill,value:string){if(busy||savePending)return;setBill(p=>p?{...p,[key]:value}:p);setReviewed(false);setDirty(true);}
 function newInput(){if(params.id){router.dismissTo("/gmail-memory");return;}setSelected(null);selectedId.current=null;setFields(null);setBill(null);setReviewed(false);setError(null);setDirty(false);pendingPayload.current=null;setSavePending(false);}
 const intro=!selected;
 const notice=selected?.proposal?.category==="utility_bill"&&!selected.bill;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title={params.id?"Review & save":"From your email"} fallback={params.id?"/gmail-memory":"/(tabs)/vault"}/>
  <View style={{flex:1}} >
  <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   {error?<Surface tone="subtle" style={{gap:spacing.sm}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><Button label={checking?"Renewing session and checking…":"Check saved progress"} loading={checking} variant="secondary" disabled={busy} onPress={()=>void checkSavedProgress()}/></Surface>:null}
   {loading?<ActivityIndicator accessibilityLabel="Checking email capture"/>:!cap?<Button label="Back to email imports" variant="secondary" onPress={()=>router.dismissTo("/gmail-memory")}/>:!cap.enabled?<>
    <JourneyHeading title="Keep the useful home details." detail="Email import is temporarily unavailable. Your saved records are safe. You can upload the original email attachment or enter its details."/>
    <Button label="Check availability" variant="secondary" loading={checking} onPress={()=>void checkSavedProgress()}/>
    <Button label="Upload a household document" onPress={()=>router.push("/vault-record")}/>
    <Button label="Upload a statement" variant="secondary" onPress={()=>router.push("/bill/import")}/>
   </>:intro&&params.id?<Button label="Back to email imports" onPress={()=>router.dismissTo("/gmail-memory")}/>:intro?<>
    <JourneyHeading title="Keep the home details." detail="Paste the useful part of a bill, receipt, warranty or service email. Review, then save."/>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>Saving to {cap.homeName} · No inbox connection</Text>
    {cap.reading?<>
     <TextField label="Relevant email text" multiline value={text} editable={!busy} maxLength={12000} onChangeText={v=>{setText(v);setConsent(false);setDirty(Boolean(v));}} style={{minHeight:140,textAlignVertical:"top",paddingTop:12}}/>
     <Text style={[typography.caption,{color:colors.mutedForeground}]}>Leave out conversations, sign-in codes and unrelated personal details.</Text>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent,disabled:busy}} disabled={busy} onPress={()=>setConsent(v=>!v)} style={{minHeight:48,flexDirection:"row",gap:spacing.sm,alignItems:"flex-start",paddingVertical:8}}>
      <Feather name={consent?"check-square":"square"} size={22} color={colors.primary}/>
      <Text style={[typography.body,{color:colors.foreground,flex:1}]}>Use AI to read this excerpt. I’ll review before saving.</Text>
     </Pressable>
     <Button label={busy?"Starting…":"Find useful details"} disabled={busy||!consent||text.trim().length<20} onPress={()=>void start()}/>
     <Button label="What gets saved?" variant="secondary" onPress={()=>setPrivacy(v=>!v)}/>
     {privacy?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Only your pasted excerpt is sent to Rezlee’s AI service. Rezlee doesn’t save the full pasted text. Suggestions may include short supporting excerpts; review and remove any you don’t want to keep. Saved records stay until you delete them. Discard an import to remove its suggestions.</Text>:null}
    </>:<Text style={[typography.body,{color:colors.mutedForeground}]}>Automatic email reading is unavailable. Upload an attachment above or try again later.</Text>}
    <Button label="Upload an attachment instead" variant="secondary" disabled={busy} onPress={()=>setUploadChoices(true)}/>
    {jobs.length?<View style={{gap:spacing.sm}}>
     <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Your recent imports</Text>
     {jobs.map(job=><Pressable key={job.id} accessibilityRole="button" disabled={busy} onPress={()=>open(job)} style={{paddingVertical:spacing.md,borderBottomWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:spacing.md}}>
      <View style={{flex:1,gap:4}}><Text style={[typography.body,{color:colors.foreground}]}>{job.title??job.proposal?.title??(job.status==="saved"?"Saved home information":"Household email")}</Text>
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>{({reading:"Finding useful details",ready:"Ready to review",failed:"Needs another attempt",ignored:"No supported record found",saved:"Saved",discarded:"Removed"})[job.status]}</Text></View><Feather name="chevron-right" size={18} color={colors.primary}/>
     </Pressable>)}
    </View>:null}
   </>:selected.status==="reading"?<>
    <Surface tone="subtle" style={{gap:spacing.md}}><ActivityIndicator color={colors.primary}/><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Reading home details</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>You can keep using Rezlee. Return to From your email in Vault to review the result. Nothing is being added automatically.</Text></Surface>
    <Button label="Back to Vault" onPress={()=>router.replace("/(tabs)/vault")}/>
    <Button label="Cancel this import" variant="secondary" onPress={confirmDiscard}/>
   </>:selected.status==="ready"&&fields?<>
    <Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>{notice?"Billing notice":categoryNames[selected.proposal?.category??""]??"Household record"}</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{bill?"Add current-period charges to your bill history, with a supporting email record in Vault.":notice?"Save the useful details from this email. This notice won’t be added to spending trends.":"Keep the reviewed details in Vault, where you and Ask Rezlee can find them later."}</Text>
    <Surface tone="subtle" style={{gap:spacing.md}}>
     {notice&&(selected.proposal?.amount_due||selected.proposal?.due_date)?<View style={{gap:spacing.sm}}>
      <Text style={[typography.section,{color:colors.foreground}]}>{selected.proposal?.provider}</Text>
      {selected.proposal?.amount_due?<><Text style={[typography.caption,{color:colors.mutedForeground}]}>Amount due shown in email</Text><Text style={[typography.heading,{color:colors.foreground}]}>{selected.proposal.amount_due}{selected.proposal.currency?" "+selected.proposal.currency:""}</Text>{!selected.proposal.currency?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Currency not stated in the email</Text>:null}</>:null}
      {selected.proposal?.due_date?<Text style={[typography.body,{color:colors.foreground}]}>Due {selected.proposal.due_date}</Text>:null}
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>Payment status is unknown. This amount may include previous balances.</Text>
     </View>:null}
     <Text style={[typography.body,{color:colors.foreground}]}>{selected.proposal?.summary}</Text>
     {selected.proposal?.missing_detail?<Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>{selected.proposal.missing_detail}</Text>:null}
     {selected.proposal?.evidence.map((quote,i)=><Text key={i} style={[typography.caption,{color:colors.mutedForeground}]}>“{quote}”</Text>)}
    </Surface>
    {selected.originalName?<Text style={[typography.caption,{color:colors.mutedForeground}]}>From Gmail · {selected.originalName}. The original will be saved privately when you confirm.</Text>:null}
    <TextField label="Record title" value={fields.title} editable={!busy&&!savePending} maxLength={200} onChangeText={v=>edit("title",v)}/>
    {bill?<Surface tone="subtle" style={{gap:spacing.md}}>
     <Text style={[typography.section,{color:colors.foreground}]}>{bill.provider_name}</Text>
     <Text style={[typography.caption,{color:colors.mutedForeground}]}>{bill.account_number}</Text>
     <Text style={[typography.heading,{color:colors.foreground}]}>${bill.amount} CAD</Text>
     <Text style={[typography.body,{color:colors.mutedForeground}]}>Current-period charges · {bill.billing_period_start} – {bill.billing_period_end}</Text>
     <Button label={billDetails?"Hide bill corrections":"Correct bill details"} variant="secondary" disabled={busy||savePending} onPress={()=>setBillDetails(v=>!v)}/>
     {billDetails?<>
     <TextField label="Provider" value={bill.provider_name} editable={!busy&&!savePending} onChangeText={v=>editBill("provider_name",v)}/>
     <TextField label="Account reference" value={bill.account_number} editable={!busy&&!savePending} onChangeText={v=>editBill("account_number",v)}/>
     <TextField label="Current-period charges · CAD" value={bill.amount} editable={!busy&&!savePending} keyboardType="decimal-pad" onChangeText={v=>editBill("amount",v)}/>
     <DateField label="Period starts" value={bill.billing_period_start} onChange={v=>editBill("billing_period_start",v)}/>
     <DateField label="Period ends" value={bill.billing_period_end} onChange={v=>editBill("billing_period_end",v)}/>
     </>:null}
     <Text style={[typography.caption,{color:colors.mutedForeground}]}>These are recorded charges, not an outstanding balance or proof of payment.</Text>
     <Button label="Save only the email record" variant="secondary" disabled={busy||savePending} onPress={()=>{setBill(null);setReviewed(false);setDirty(true);}}/>
    </Surface>:selected.proposal?.category==="utility_bill"?<Surface tone="subtle" style={{gap:spacing.sm}}>
     <Text style={[typography.body,{color:colors.foreground}]}>{notice?"Have the full statement? Upload it to see the charge breakdown and compare billing periods. You can save this notice without it.":selected.proposal.missing_detail??"Attach the actual statement to confirm current-period charges and the account’s billing history."}</Text>
     <Button label="Upload the statement" variant="secondary" disabled={busy||savePending} onPress={()=>router.push("/bill/import")}/>
    </Surface>:null}
    {fields.expires_on?<DateField label="Printed expiry date" value={fields.expires_on} optional onChange={v=>edit("expires_on",v)}/>:null}
    <Button label={details?"Hide record details":"Review saved details and excerpts"} variant="secondary" disabled={busy||savePending} onPress={()=>setDetails(v=>!v)}/>
    {details?<>
     <TextField label="Details to keep" multiline value={fields.notes} maxLength={5000} editable={!busy&&!savePending} onChangeText={v=>edit("notes",v)} style={{minHeight:150,textAlignVertical:"top",paddingTop:12}}/>
     {fields.issued_on?<DateField label="Printed issue date" value={fields.issued_on} optional onChange={v=>edit("issued_on",v)}/>:null}
    </>:null}
    {selected.proposal?.category==="service_invoice"?<Text style={[typography.caption,{color:colors.mutedForeground}]}>This saves service evidence. It does not mark a Care task completed or prove the work was carried out.</Text>:null}
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:reviewed,disabled:busy||savePending}} disabled={busy||savePending} onPress={()=>setReviewed(v=>!v)} style={{minHeight:48,paddingVertical:8,flexDirection:"row",gap:10}}>
     <Feather name={reviewed?"check-square":"square"} size={22} color={colors.primary}/><Text style={[typography.body,{color:colors.foreground,flex:1}]}>I checked these details against the email.</Text>
    </Pressable>
    <Button label={busy?"Saving…":savePending?"Retry the same save":bill?"Add to bill history":notice?"Save notice to Vault":"Save to Vault"} disabled={busy||(!savePending&&(!reviewed||!fields.title.trim()))} onPress={()=>void save()}/>
    <Button label="Discard import" variant="secondary" disabled={busy} onPress={confirmDiscard}/>
   </>:selected.status==="saved"?<>
    <Surface tone="subtle" style={{gap:spacing.md}}><Feather name="check-circle" size={32} color={colors.primary}/><Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>{selected.billId?"Your bill history is updated":"Saved to Vault"}</Text>
    <Text style={[typography.section,{color:colors.foreground}]}>{fields?.title??selected.title}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>Your reviewed details are saved. Ask Rezlee can use them as supporting home information.</Text></Surface>
    {selected.billId?<Button label="View bill history" onPress={()=>router.push(savedBillDestination(selected.billId!,true))}/>:null}
    {selected.documentId?<Button label="View saved record" variant={selected.billId?"secondary":"primary"} onPress={()=>router.push({pathname:"/vault-record",params:{id:selected.documentId!}})}/>:null}
    <Button label={params.id?"Back to email imports":"Add another email"} variant="secondary" onPress={newInput}/>
    <Button label="Remove import entry" variant="secondary" onPress={confirmDiscard}/>
   </>:<>
    <Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>{selected.status==="failed"?"We couldn’t finish reading":selected.status==="discarded"?"This import was removed":"No supported home record found"}</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{selected.status==="failed"?(selected.canRetry?"Paste the same excerpt to retry. We won’t reread it automatically.":"This excerpt has reached its attempt limit. Upload its attachment or save a record manually."):"Nothing was added to your home. Try the actual bill, receipt, warranty or service invoice."}</Text>
    {selected.canRetry||selected.status!=="failed"?<Button label={params.id?"Back to email imports":"Paste another excerpt"} onPress={newInput}/>:null}
    <Button label="Upload a document" variant="secondary" onPress={()=>router.push("/vault-record")}/>
    <Button label="Remove import entry" variant="secondary" disabled={busy} onPress={confirmDiscard}/>
   </>}
  </FormScrollView></View>
  <CollectionAddSheet title="Upload from your email" visible={uploadChoices} onClose={()=>setUploadChoices(false)} choices={[
   {key:"bill",title:"Bill statement",detail:"Review charges and add to bill history",icon:"file-text",onPress:()=>router.push("/bill/import")},
   {key:"record",title:"Receipt or document",detail:"Keep the original and useful details in Vault",icon:"folder",onPress:()=>router.push("/vault-record")},
  ]}/>
 </SafeAreaView>;
}

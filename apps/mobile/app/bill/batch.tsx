import { FormScrollView } from "@/components/FormScrollView";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {energyEvidenceError} from "@/lib/energy-evidence";
import {statementUploadForm} from "@/lib/statement-upload-form";
import {StatementIntakeDetails} from "@/components/StatementIntakeDetails";
import {emptyIntakeEvidence,extractedIntakeEvidence,mergeIntakeEvidence,intakeEvidencePayload,hasIntakeEvidence,type IntakeEvidence} from "@/lib/statement-intake-evidence";
import {evidenceError} from "@/lib/statement-evidence";
import { missingStatementFields, shouldReadStatement, statementHasDetails, statementReadFailure } from "@/lib/statement-reading";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter,useNavigation} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {useAuth} from "@/auth/AuthProvider";
import {statementBatches} from "@/lib/statement-batch";
import {batchCounts,emptyStatementFields,type StatementBatch,type StatementBatchItem,type StatementFields} from "@/lib/statement-batch-core";
import {newVaultSaveRequestId} from "@/lib/vault-save-intent";
import {fetchOnboarding} from "@/lib/onboarding-data";
import {statementSuggestions,statementReviewHints,statementDuplicate,statementChargeReview} from "@/lib/statement-review";
import {apiGet,apiPatch,apiFormPost,ApiError} from "@/lib/api";
import {RECORD_PICKER_TYPES,RECORD_FILE_TYPES,uploadMimeType,uploadValidationError} from "@/lib/upload-validation";
import {StatementBatchProgress,StatementBatchResults} from "@/components/StatementBatchProgress";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {CollectionAddSheet} from "@/components/CollectionUI";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {DateField} from "@/components/DateField";
import {QuietAction} from "@/components/Brief";
import {colors,spacing,typography} from "@/theme/tokens";
const endpoint="/api/mobile/v1/bills/history/upload";
type FilePart=Pick<DocumentPicker.DocumentPickerAsset,"uri"|"name"|"mimeType"|"size">;
const empty=emptyStatementFields;
export default function StatementBatchScreen(){const {session}=useAuth();return <Batch key={session?.user.id??"out"} userId={session?.user.id}/>;}
function Batch({userId}:{userId?:string}){
 const router=useRouter(),navigation=useNavigation();
 const [batch,setBatch]=useState<StatementBatch|null>(null),current=useRef<StatementBatch|null>(null);
 const [energyEnabled,setEnergyEnabled]=useState(false);
 const [supporting,setSupporting]=useState<IntakeEvidence>(emptyIntakeEvidence),[evidenceEnabled,setEvidenceEnabled]=useState(false);
 const [home,setHome]=useState<{id:string;name:string}|null>(null),[available,setAvailable]=useState(false),[ai,setAi]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),lock=useRef(false);
 const [error,setError]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [fields,setFields]=useState<StatementFields>(empty),[dirty,setDirty]=useState(false),[reviewed,setReviewed]=useState(false);
 const [files,setFiles]=useState<Record<string,FilePart>>({});
 const [reload,setReload]=useState(0);
 const [readConsent,setReadConsent]=useState(false),[manual,setManual]=useState(false);
 const [exit,setExit]=useState(false);
 const [options,setOptions]=useState(false),[evidence,setEvidence]=useState(false);
 const scroll=useRef<ScrollView>(null);
 useEffect(()=>{if(exit&&!busy)router.replace({pathname:"/(tabs)/bills",params:{section:"history"}});},[exit,busy,router]);
 useEffect(()=>{
  let active=true;if(!userId)return;
  void Promise.all([statementBatches.read(userId),fetchOnboarding(),apiGet<{batchUpload?:boolean;statementIntakeEvidence?:boolean;statementEnergyEvidence?:boolean}>("/api/mobile/v1/bills/capabilities",{timeoutMs:10000}),apiGet<{receiptExtraction?:boolean;statementExtraction?:boolean}>("/api/mobile/v1/ai/scan",{timeoutMs:10000}).catch(()=>null)])
   .then(([saved,setup,caps,scan])=>{if(!active)return;current.current=saved;setBatch(saved);setFiles(Object.fromEntries((saved?.items??[]).filter(i=>i.file).map(i=>[i.requestId,i.file!])));setHome(setup.home&&setup.accessRole!=="member"?{id:setup.home.id,name:setup.home.nickname}:null);setAvailable(caps.batchUpload===true);setEvidenceEnabled(caps.statementIntakeEvidence===true);setEnergyEnabled(caps.statementEnergyEvidence===true);setAi((scan?.statementExtraction??scan?.receiptExtraction)===true);setError(null);})
   .catch(()=>{if(active)setError("Could not load the batch and your home. Check your connection and try again.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[userId,reload]);
 usePreventRemove((busy||dirty)&&!exit,({data})=>{
  if(busy){Alert.alert("A step is in progress","You can return to this batch from Bills. Check its status before uploading again.",[{text:"Stay here",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)}]);return;}
  Alert.alert("Leave these edits?","Changes since your last saved draft will be lost.",[{text:"Keep editing",style:"cancel"},{text:"Discard edits",style:"destructive",onPress:()=>navigation.dispatch(data.action)}]);
 });
 const persist=useCallback(async(next:StatementBatch)=>{
  if(!userId)throw Error("Sign in required");
  const saved=await statementBatches.write(userId,next,current.current?.revision??null);
  current.current=saved;setBatch(saved);return saved;
 },[userId]);
 const updateItem=useCallback(async(id:string,patch:Partial<StatementBatchItem>)=>{
  if(!current.current)throw Error("Batch unavailable");
  return persist({...current.current,items:current.current.items.map(i=>i.requestId===id?{...i,...patch}:i)});
 },[persist]);
 function chooseItem(item:StatementBatchItem){
  const apply=()=>{setSelected(item.requestId);setEvidence(false);scroll.current?.scrollTo({y:0,animated:false});setFields(item.fields);setSupporting(item.evidence??emptyIntakeEvidence());setManual(false);setReviewed(false);setDirty(false);setError(null);};
  if(dirty)Alert.alert("Discard unsaved edits?","Save your draft to keep these changes.",[{text:"Keep editing",style:"cancel"},{text:"Discard",style:"destructive",onPress:apply}]);else apply();
 }
 async function pickBatch(){
  if(lock.current||!home||!available||!ai||current.current)return;
  lock.current=true;setBusy(true);setError(null);
  try{
   const result=await DocumentPicker.getDocumentAsync({type:RECORD_PICKER_TYPES,multiple:true,copyToCacheDirectory:true});
   if(result.canceled)return;
   if(result.assets.length>5){setError("Choose up to five statements at a time. No files were added.");return;}
   const items:StatementBatchItem[]=[];const chosen:Record<string,FilePart>={};
   for(const asset of result.assets){
    let prepared;
    try{prepared=await prepareAttachment({uri:asset.uri,name:asset.name,type:uploadMimeType(asset.name,asset.mimeType),size:asset.size});}
    catch{setError(asset.name+": This photo could not be prepared. Choose another photo or a PDF. No files were added.");return;}
    const file={...prepared,mimeType:prepared.type};
    const invalid=uploadValidationError(file.size,uploadMimeType(file.name,file.mimeType),RECORD_FILE_TYPES);
    if(invalid){setError(file.name+": "+invalid+" No files were added.");return;}
    const requestId=newVaultSaveRequestId();chosen[requestId]=file;
    items.push({requestId,name:file.name.slice(0,250),status:"review",readAttempted:false,file:{uri:file.uri,name:file.name.slice(0,250),mimeType:file.mimeType,size:file.size},fields:{...empty,bill_title:file.name.replace(/\.[^.]+$/,"").slice(0,200)}});
   }
   const saved=await persist({version:1,revision:0,homeId:home.id,homeName:home.name,items});
   setReadConsent(true);setFiles(chosen);chooseItem(saved.items[0]);
  }catch{setError("Could not save the batch on this device. No statements were submitted.");}
  finally{lock.current=false;setBusy(false);}
 }
 const item=batch?.items.find(i=>i.requestId===selected);
 const sameHome=Boolean(home&&batch?.homeId===home.id);
 const file=item?files[item.requestId]:undefined;
 const previousAccount=batch?.items.slice().reverse().find(i=>i.requestId!==selected&&i.status==="saved"&&i.fields.provider_name&&i.fields.account_number);
 const currencyReady=!item?.currencyReview||item.currencyReview==="CAD";
 const advanceIssueMissing=Boolean(fields.billing_period_end>new Date().toISOString().slice(0,10)&&!fields.issue_date);
 const readyFields=Boolean((!supporting.energy||!energyEvidenceError(supporting.energy))&&!evidenceError(supporting.fields)&&!advanceIssueMissing&&currencyReady&&fields.bill_title.trim()&&fields.provider_name.trim()&&fields.category.trim()&&fields.account_number.trim()&&fields.amount.trim()&&fields.billing_period_start&&fields.billing_period_end);
 async function selectOriginal(){
  if(!item||lock.current)return;lock.current=true;setBusy(true);
  try{
   const result=await DocumentPicker.getDocumentAsync({type:item.status==="review"?RECORD_PICKER_TYPES:RECORD_FILE_TYPES,copyToCacheDirectory:true});
   if(result.canceled)return;const asset=result.assets[0];
   const original={uri:asset.uri,name:asset.name,type:uploadMimeType(asset.name,asset.mimeType),size:asset.size};
   // An in-flight save has an immutable fingerprint. Never re-encode its original.
   const prepared=item.status==="review"?await prepareAttachment(original):original;
   const chosen={...prepared,mimeType:prepared.type};
   if(chosen.name!==item.name&&asset.name!==item.name){setError("Choose the original named "+item.name+". Start a new batch for a different statement.");return;}
   const invalid=uploadValidationError(chosen.size,uploadMimeType(chosen.name,chosen.mimeType),RECORD_FILE_TYPES);
   if(invalid){setError(invalid);return;}
   await updateItem(item.requestId,{file:{uri:chosen.uri,name:chosen.name,mimeType:chosen.mimeType,size:chosen.size}});
   setFiles(previous=>({...previous,[item.requestId]:chosen}));setReviewed(false);setError(null);
  }catch{setError("Could not select the original. Try again.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function saveDraft(closeEditor=false){
  if(!item||lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{await updateItem(item.requestId,{fields,evidence:supporting});setDirty(false);if(closeEditor)setManual(false);}
  catch{setError("Could not keep these edits on your device. They are still on this screen.");}
  finally{lock.current=false;setBusy(false);}
 }
 const read=useCallback(async(retry=false)=>{
  if(!item||!file||lock.current||(item.readAttempted&&!retry)||!ai||!sameHome)return;
  lock.current=true;setBusy(true);setError(null);setReviewed(false);
  try{
   await updateItem(item.requestId,{readAttempted:true,readState:"reading",fields,evidence:supporting});setDirty(false);
   const form=new FormData();form.append("kind","bill_history");form.append("file",{uri:file.uri,name:file.name,type:uploadMimeType(file.name,file.mimeType)} as unknown as Blob);
   const response=await apiFormPost<{data:Record<string,unknown>}>("/api/mobile/v1/ai/scan",form,{timeoutMs:55000});
   const suggestions=statementSuggestions(response.data,fields.account_number);
   const money=statementChargeReview(response.data);
   const extracted=evidenceEnabled?extractedIntakeEvidence(response.data):emptyIntakeEvidence();
   const nextEvidence=retry?mergeIntakeEvidence(supporting,extracted):extracted;
   let next={...empty,...suggestions,amount:money.amount,bill_title:suggestions.bill_title||fields.bill_title} as StatementFields;
   if(retry)next=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,fields[key as keyof StatementFields]||value])) as StatementFields;
   const currencyReview=retry&&item.currencyReview==="CAD"&&money.currencyReview!=="foreign"?"CAD":money.currencyReview;
   const hints=statementReviewHints(response.data).filter(hint=>!hint.startsWith("Currency could not")&&!hint.startsWith("This file is not confirmed as CAD"));
   await updateItem(item.requestId,{readState:"complete",fields:next,evidence:nextEvidence,currencyReview,message:hints.join(" ").slice(0,500)});setFields(next);setSupporting(nextEvidence);
  }catch(error){
   const message=statementReadFailure(error instanceof ApiError?error.status:undefined);
   try{await updateItem(item.requestId,{readState:"failed",message});}catch{/* Original request remains for recovery. */}
   setError(message);
  }
  finally{lock.current=false;setBusy(false);}
 },[item,file,ai,sameHome,fields,updateItem,evidenceEnabled,supporting]);
 useEffect(()=>{
  if(!item||manual||!shouldReadStatement(item,{enabled:ai,consent:readConsent,hasFile:Boolean(file),busy,dirty,sameHome}))return;
  // Cancel before dispatch if the customer changes selection or leaves this screen.
  const timer=setTimeout(()=>void read(),0);
  return()=>clearTimeout(timer);
 },[item,manual,ai,readConsent,file,busy,dirty,sameHome,read]);
 function retryReading(){
  if(!item||lock.current||!ai||!sameHome)return;
  Alert.alert("Read this statement again?","This sends the original for another reading. Details already filled in are kept; only missing fields are filled.",[{text:"Cancel",style:"cancel"},{text:"Read again",onPress:()=>void read(true)}]);
 }
 async function confirmCad(){
  if(!item||lock.current||!sameHome)return;
  lock.current=true;setBusy(true);
  try{await updateItem(item.requestId,{currencyReview:"CAD",fields,evidence:supporting});setDirty(false);setError(null);}
  catch{setError("Could not keep the currency confirmation. Your draft is unchanged.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function submit(confirmed=false){
  if(!item||lock.current||!sameHome||(item.status==="review"&&!available))return;
  if(item.status==="review"&&((!reviewed&&!confirmed)||!file||!readyFields))return;
  if(item.status==="review"&&hasIntakeEvidence(supporting)&&!evidenceEnabled){setError("We couldn’t confirm that statement details can be saved. Your draft is kept; try again shortly.");return;}
  if(item.status==="review"&&supporting.energy&&!energyEnabled){setError("Energy details cannot be saved right now. Your draft is kept; try again shortly.");return;}
  lock.current=true;setBusy(true);setError(null);
  const key=item.requestId;
  try{
   let values=fields,originalExpected:string|null=null;
   let details=intakeEvidencePayload(supporting);
   if(item.status!=="review"){
    try{
     const saved=await apiPatch<{billId:string}>(endpoint+"?requestId="+key,undefined,{timeoutMs:45000});
     await updateItem(key,{status:"saved",billId:saved.billId,message:undefined,file:undefined});setFiles(previous=>{const next={...previous};delete next[key];return next;});setSelected(null);setDirty(false);return;
    }catch(e){
     if(!(e instanceof ApiError&&[404,428].includes(e.status)))throw e;
     if(e.status===428){
      const recovery=await apiGet<{fields:StatementFields&{supporting_details?:IntakeEvidence};expectedVersion:string|null}>(endpoint+"?requestId="+key,{timeoutMs:15000});
      values=recovery.fields;details=recovery.fields.supporting_details;originalExpected=recovery.expectedVersion;
     }else {
      await updateItem(key,{status:"review",message:"No saved attempt was found. Review the original again before retrying."});
      setFields(item.fields);setReviewed(false);setError("No saved attempt was found. Check the original and confirm its details before retrying.");return;
     }
     await updateItem(key,{status:"needs_file",fields:values,evidence:details});
     if(!file){setError("Choose the same original file, then check and finish this save.");return;}
    }
   }else{
    await updateItem(key,{status:"submitting",fields,evidence:supporting,message:undefined});setDirty(false);
   }
   if(!file)return;
   const form=statementUploadForm({
    fields:values,evidence:details,requestId:key,homeId:batch!.homeId,expectedVersion:originalExpected,
    file:{uri:file.uri,name:file.name,type:uploadMimeType(file.name,file.mimeType)} as unknown as Blob,
   });
   const response=await apiFormPost<{billId:string}>(endpoint,form,{timeoutMs:45000});
   await updateItem(key,{status:"saved",billId:response.billId,message:undefined,file:undefined});setFiles(previous=>{const next={...previous};delete next[key];return next;});setSelected(null);setDirty(false);
  }catch(e){
   try{
    const duplicate=e instanceof ApiError?statementDuplicate(e.details):null;
    if(duplicate){await updateItem(key,{status:"duplicate",billId:duplicate.billId,message:"This period is already saved. No second bill was created. Open the saved statement to review or attach its original."});setSelected(null);setDirty(false);
    }else if(e instanceof ApiError&&[400,413].includes(e.status)){
     await updateItem(key,{status:"review"});setReviewed(false);setError(e.message);
    }else{
     if(e instanceof ApiError&&[403,409,410].includes(e.status))await updateItem(key,{status:"blocked",message:e.message.slice(0,500)});
     setError(e instanceof ApiError?e.message:"Could not confirm this save. Its reference is kept; check status before starting another copy.");
    }
   }catch{setError("Could not update the batch status. Reopen the batch to check the same save.");}
  }finally{lock.current=false;setBusy(false);}
 }
 async function skip(){
  if(!item||lock.current||item.status!=="review")return;
  lock.current=true;setBusy(true);
  try{await updateItem(item.requestId,{status:"skipped",fields,evidence:supporting});setSelected(null);setDirty(false);}
  catch{setError("Could not skip this item. Try again.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function restoreSkipped(){
  if(!item||item.status!=="skipped"||lock.current||!sameHome)return;
  lock.current=true;setBusy(true);setError(null);
  try{await updateItem(item.requestId,{status:"review"});setFields(item.fields);setSupporting(item.evidence??emptyIntakeEvidence());setReviewed(false);setDirty(false);}
  catch{setError("Could not restore this statement. Your other saved bills are unchanged.");}
  finally{lock.current=false;setBusy(false);}
 }
 function discardBatch(){
  if(!userId||!current.current||busy)return;
  Alert.alert("Remove this batch from this device?","Saved bills stay in History and originals stay in Vault. Unsubmitted drafts will be discarded. This does not cancel submitted uploads; check Vault before adding those originals again.",[
   {text:"Keep batch",style:"cancel"},{text:"Remove batch",style:"destructive",onPress:()=>{
    if(!userId||!current.current||lock.current)return;
    lock.current=true;setBusy(true);
    void statementBatches.clear(userId,current.current.revision).then(()=>{setDirty(false);setExit(true);}).catch(()=>setError("Could not clear this batch. Reopen it and try again.")).finally(()=>{lock.current=false;setBusy(false);});
   }},
  ]);
 }
 async function finish(){
  if(!userId||!current.current||lock.current||batchCounts(current.current).pending)return;
  lock.current=true;setBusy(true);
  try{await statementBatches.clear(userId,current.current.revision);setDirty(false);setExit(true);}
  catch{setError("Could not clear the completed batch. Saved bills remain in History.");}
  finally{lock.current=false;setBusy(false);}
 }
 function edit(key:keyof StatementFields,value:string){setFields(v=>({...v,[key]:value}));setDirty(true);setReviewed(false);}
 async function showStatements(){
  if(lock.current)return;
  if(dirty&&item){
   lock.current=true;setBusy(true);
   try{await updateItem(item.requestId,{fields,evidence:supporting});setDirty(false);}
   catch{setError("Could not keep your edits. Please stay here and try again.");return;}
   finally{lock.current=false;setBusy(false);}
  }
  setSelected(null);setManual(false);setError(null);scroll.current?.scrollTo({y:0,animated:false});
 }
 const openOriginal=()=>file?void Linking.openURL(file.uri).catch(()=>setError("Preview unavailable. Your statement is still kept.")):void selectOriginal();
 const formatDate=(value:string)=>value?new Date(value+"T12:00:00Z").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):"Not found";
 if(!userId)return <SafeAreaView><Text>Sign in to manage statement uploads.</Text><Button label="Sign in" onPress={()=>router.replace("/(auth)/login")}/></SafeAreaView>;
 const counts=batch?batchCounts(batch):null;
 const reviewable=Boolean(item&&(manual||statementHasDetails(item)||item.readState==="complete"));
 const choices=[
  ...(item?[{key:"original",title:"View original",detail:item.name,icon:"file-text" as const,onPress:openOriginal},
    {key:"replace",title:"Choose original again",detail:"Use this if the saved file is unavailable.",icon:"upload" as const,onPress:()=>void selectOriginal()},
    ...(ai&&file&&item.status==="review"?[{key:"read",title:"Read again",detail:"Fill missing details without replacing your edits.",icon:"refresh-cw" as const,onPress:retryReading}]:[]),
    {key:"evidence",title:"Reading details",detail:"See the labels and notes from this statement.",icon:"info" as const,onPress:()=>setEvidence(v=>!v)}]:[]),
  {key:"remove",title:"Remove unfinished batch",detail:"Statements already saved will stay in Bills.",icon:"trash-2" as const,onPress:discardBatch},
 ];
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title={item?"Review statement":"Upload statements"} fallback="/(tabs)/bills"/>
  <View style={{flex:1}} >
  <FormScrollView keyboardDismissMode="on-drag" ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   {loading?<ActivityIndicator accessibilityLabel="Loading statements"/>:<>
    {error?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text>:null}
    {!available?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>Saving is unavailable. Your drafts are kept.</Text>:null}
    {!batch?<>
     <Text style={[typography.title,{color:colors.foreground}]}>Let your bills fill in the details</Text>
     <Text style={[typography.body,{color:colors.mutedForeground}]}>Choose your statements. Rezlee reads them; you review and save.</Text>
     {home?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{home.name}</Text>:null}
     <Text style={[typography.meta,{color:colors.mutedForeground}]}>Up to 5 PDFs or photos · 4 MB each · Canadian dollars</Text>
     {!ai?<Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>Statement reading is unavailable. Please try again later.</Text>:null}
     <Button label="Choose statements" disabled={busy||!available||!home||!ai} onPress={()=>void pickBatch()}/>
     <Text style={[typography.meta,{color:colors.mutedForeground}]}>Files are sent securely to the document-reading service.</Text>
     {!ai||error?<QuietAction label="Check again" onPress={()=>{setLoading(true);setReload(v=>v+1);}}/>:null}
    </>:<>
     {!sameHome?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>Return to {batch.homeName} to save these statements.</Text>:null}
     {item?<>
      <View style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8}}>
       <QuietAction label="All statements" disabled={busy} onPress={()=>void showStatements()}/>
       <Text style={[typography.meta,{color:colors.mutedForeground}]}>{batch.items.findIndex(row=>row.requestId===item.requestId)+1} of {batch.items.length}</Text>
       <QuietAction label="Options" disabled={busy} onPress={()=>setOptions(true)}/>
      </View>
      {item.billId?<><Text style={[typography.title,{color:colors.foreground}]}>{item.status==="duplicate"?"Already in Bills":"Statement saved"}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{item.fields.provider_name}</Text><Button label="View statement" onPress={()=>router.push({pathname:"/bill/[id]",params:{id:item.billId!}})}/><QuietAction label="View account insights" onPress={()=>router.push({pathname:"/bill/history-insights",params:{billId:item.billId!}})}/></>:item.status==="skipped"?<><Text style={[typography.section,{color:colors.foreground}]}>Statement skipped</Text><Button label="Review this statement" disabled={busy||!sameHome} onPress={()=>void restoreSkipped()}/></>:item.status!=="review"?<>
       <Text style={[typography.section,{color:colors.foreground}]}>Check your previous save</Text>
       <Text style={[typography.body,{color:colors.mutedForeground}]}>{item.message||"We will check its status before trying again."}</Text>
       {!file?<QuietAction label="Choose original" disabled={busy||!sameHome} onPress={()=>void selectOriginal()}/>:null}
       <Button label={busy?"Checking…":"Check save status"} disabled={busy||!sameHome} onPress={()=>void submit()}/>
      </>:<>
       {busy&&item.readState==="reading"?<View style={{gap:spacing.md,paddingVertical:spacing.xl}}><ActivityIndicator accessibilityLabel="Reading statement"/><Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.foreground,textAlign:"center"}]}>Reading your statement…</Text></View>:null}
       {!reviewable&&!busy?<>
        <Text style={[typography.section,{color:colors.foreground}]}>{item.name}</Text>
        {!file?<><Text style={[typography.body,{color:colors.mutedForeground}]}>Choose the original to continue.</Text><Button label="Choose original" disabled={!sameHome} onPress={()=>void selectOriginal()}/></>:!ai?<><Text style={[typography.body,{color:colors.mutedForeground}]}>Statement reading is unavailable. Your draft is kept.</Text><QuietAction label="Check again" onPress={()=>setReload(v=>v+1)}/></>:item.readAttempted?<><Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>{item.readState==="reading"?"Reading was interrupted. Your file and draft are kept. Try again when you’re ready.":item.message||"Reading did not finish. Your file is kept."}</Text><Button label="Try reading again" disabled={!sameHome} onPress={retryReading}/></>:<><Text style={[typography.body,{color:colors.mutedForeground}]}>Rezlee reads the file. You review before saving.</Text><Button label="Read statement" disabled={!sameHome} onPress={()=>{setReadConsent(true);void read();}}/></>}
        <QuietAction label="Enter details instead" onPress={()=>setManual(true)}/>
       </>:null}
       {reviewable&&!(busy&&item.readState==="reading")?<>
        {!manual?<View style={{gap:spacing.md}}>
         <View style={{gap:4}}><Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>{fields.provider_name||"Your statement"}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{[fields.category,fields.account_number].filter(Boolean).join(" · ")}</Text></View>
         {fields.amount?<View style={{gap:4}}><Text style={[typography.title,{color:colors.foreground}]}>{currencyReady?new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(Number(fields.amount))+" CAD":Number(fields.amount).toFixed(2)}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>This period’s charges, including tax</Text></View>:null}
         {fields.billing_period_start&&fields.billing_period_end?<View style={{borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border,paddingVertical:spacing.md,gap:4}}><Text style={[typography.meta,{color:colors.mutedForeground}]}>Service period</Text><Text style={[typography.body,{color:colors.foreground}]}>{formatDate(fields.billing_period_start)} – {formatDate(fields.billing_period_end)}</Text></View>:null}
         <View style={{flexDirection:"row",flexWrap:"wrap",gap:spacing.lg}}><QuietAction label="Edit details" disabled={busy} onPress={()=>setManual(true)}/><QuietAction label="View original" disabled={busy} onPress={openOriginal}/></View>
        </View>:<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Edit statement details</Text>}
        {item.currencyReview==="unconfirmed"?<View style={{gap:4}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>Is this amount in Canadian dollars?</Text><QuietAction label="Yes, Canadian dollars" disabled={busy||!sameHome} onPress={()=>void confirmCad()}/></View>:null}
        {item.currencyReview==="foreign"?<Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>Only Canadian-dollar statements can be saved. Skip this file; no currency conversion is applied.</Text>:null}
        {!manual&&(missingStatementFields(fields).length>0||advanceIssueMissing)?<Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>Check the missing details below.</Text>:null}
        {!manual?<StatementIntakeDetails key={item.requestId} value={supporting} disabled={busy||!sameHome} onChange={next=>{setSupporting(next);setDirty(true);setReviewed(false);}}/>:null}
        {manual?<TextField label="Statement name" maxLength={140} value={fields.bill_title} editable={!busy} onChangeText={v=>edit("bill_title",v)}/>:null}
        {manual||!item.fields.provider_name?<TextField label="Provider" maxLength={120} value={fields.provider_name} editable={!busy} onChangeText={v=>edit("provider_name",v)}/>:null}
        {manual||!item.fields.category?<TextField label="Service" maxLength={80} value={fields.category} editable={!busy} onChangeText={v=>edit("category",v)}/>:null}
        {manual||!item.fields.account_number?<><TextField label="Account nickname" placeholder="Home internet" maxLength={80} value={fields.account_number} editable={!busy} onChangeText={v=>edit("account_number",v)}/>{previousAccount&&previousAccount.fields.provider_name.toLowerCase()===fields.provider_name.toLowerCase()?<QuietAction label={"Use "+previousAccount.fields.account_number} disabled={busy} onPress={()=>edit("account_number",previousAccount.fields.account_number)}/>:null}</>:null}
        {manual||!item.fields.billing_period_start?<DateField label="Period start" value={fields.billing_period_start} onChange={v=>{if(!busy)edit("billing_period_start",v);}}/>:null}
        {manual||!item.fields.billing_period_end?<DateField label="Period end" value={fields.billing_period_end} onChange={v=>{if(!busy)edit("billing_period_end",v);}}/>:null}
        {manual||!item.fields.amount?<><TextField label={currencyReady?"Charges for this period (CAD)":"Charges for this period"} maxLength={40} keyboardType="numbers-and-punctuation" value={fields.amount} editable={!busy} onChangeText={v=>edit("amount",v)}/>{!manual&&ai&&file&&!busy?<QuietAction label="Read missing charges again" disabled={!sameHome} onPress={retryReading}/>:null}</>:null}
        {manual||advanceIssueMissing?<DateField label="Issue date" optional={!advanceIssueMissing} value={fields.issue_date} onChange={v=>{if(!busy)edit("issue_date",v);}}/>:null}
        {manual?<><DateField label="Due date" optional value={fields.due_date} onChange={v=>{if(!busy)edit("due_date",v);}}/><TextField label="Notes" maxLength={5000} multiline value={fields.notes} editable={!busy} onChangeText={v=>edit("notes",v)}/><Button label="Done editing" disabled={busy} onPress={()=>void saveDraft(true)}/></>:<>
         {!file?<><Text style={[typography.body,{color:colors.mutedForeground}]}>Choose the original to finish saving.</Text><QuietAction label="Choose original" disabled={busy} onPress={()=>void selectOriginal()}/></>:null}
         <Button label={busy?"Saving…":"Save statement"} disabled={busy||!sameHome||!available||!file||!readyFields} onPress={()=>void submit(true)}/>
         <Text style={[typography.meta,{color:colors.mutedForeground}]}>Statement in Bills · Original in your private Vault</Text>
        </>}
       </>:null}
       {!manual?<QuietAction label="Skip for now" disabled={busy} onPress={()=>void skip()}/>:null}
      </>}
      {evidence&&item.message?<View style={{gap:8}}><Text style={[typography.section,{color:colors.foreground}]}>Reading details</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{item.message}</Text></View>:null}
     </>:<>
      <View style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}><Text style={[typography.meta,{color:colors.mutedForeground}]}>{batch.homeName}</Text>{counts!.pending>0?<QuietAction label="Options" disabled={busy} onPress={()=>setOptions(true)}/>:null}</View>
      <StatementBatchProgress batch={batch} selected={null} disabled={busy} onChoose={chooseItem}/>
      {counts!.pending>0?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Progress is saved. Continue any time from Bills.</Text>:null}
      <StatementBatchResults batch={batch} disabled={busy||dirty||!sameHome}/>
      {counts!.pending===0?<Button label="Done" disabled={busy} onPress={()=>void finish()}/>:null}
     </>}
    </>}
   </>}
  </FormScrollView></View>
  <CollectionAddSheet title="Statement options" visible={options} onClose={()=>setOptions(false)} choices={choices}/>
 </SafeAreaView>;
}

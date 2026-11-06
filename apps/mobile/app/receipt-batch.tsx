import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading} from "@/components/JourneyUI";
import {CollectionAddSheet} from "@/components/CollectionUI";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {statementReadFailure} from "@/lib/statement-reading";
import {useEffect,useRef,useState} from "react";
import {useRouter,useNavigation} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Linking, Text, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {useAuth} from "@/auth/AuthProvider";
import {receiptBatches} from "@/lib/receipt-batch";
import {batchCounts,validBatchId,type ReceiptBatch,type ReceiptBatchItem,type ReceiptFields} from "@/lib/receipt-batch-core";
import {newVaultSaveRequestId} from "@/lib/vault-save-intent";
import {fetchOnboarding} from "@/lib/onboarding-data";
import {receiptSuggestions,mergeReceiptSuggestions,receiptReadLabel} from "@/lib/receipt-review";
import {apiGet,apiPatch,apiFormPost,ApiError} from "@/lib/api";
import {RECORD_PICKER_TYPES,RECORD_FILE_TYPES,uploadMimeType,uploadValidationError} from "@/lib/upload-validation";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {DateField} from "@/components/DateField";
import {QuietAction,BriefRow} from "@/components/Brief";
import {colors,spacing,typography} from "@/theme/tokens";
const endpoint="/api/mobile/v1/vault/records";
type FilePart=Pick<DocumentPicker.DocumentPickerAsset,"uri"|"name"|"mimeType"|"size">;
const empty:ReceiptFields={title:"",category:"Receipt",issued_on:"",expires_on:"",notes:""};
export default function ReceiptBatchScreen(){const {session}=useAuth();return <Batch key={session?.user.id??"out"} userId={session?.user.id}/>;}
function Batch({userId}:{userId?:string}){
 const router=useRouter(),navigation=useNavigation();
 const [batch,setBatch]=useState<ReceiptBatch|null>(null),current=useRef<ReceiptBatch|null>(null);
 const [home,setHome]=useState<{id:string;name:string}|null>(null),[available,setAvailable]=useState(false),[ai,setAi]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),lock=useRef(false);
 const [error,setError]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [fields,setFields]=useState<ReceiptFields>(empty),[dirty,setDirty]=useState(false),[reviewed,setReviewed]=useState(false);
 const [files,setFiles]=useState<Record<string,FilePart>>({});
 const [reload,setReload]=useState(0);
 const [exit,setExit]=useState(false),[readConsent,setReadConsent]=useState(false),[options,setOptions]=useState(false);
 useEffect(()=>{if(exit&&!busy)router.replace("/(tabs)/vault");},[exit,busy,router]);
 useEffect(()=>{
  let active=true;if(!userId)return;
  void Promise.all([receiptBatches.read(userId),fetchOnboarding(),apiGet<{receiptBatch?:boolean}>(endpoint+"?capabilities=1",{timeoutMs:10000}),apiGet<{receiptExtraction?:boolean}>("/api/mobile/v1/ai/scan",{timeoutMs:10000}).catch(()=>null)])
   .then(([saved,setup,caps,scan])=>{if(!active)return;current.current=saved;setBatch(saved);setFiles(Object.fromEntries((saved?.items??[]).filter(i=>i.file).map(i=>[i.requestId,i.file!])));setHome(setup.home&&setup.accessRole!=="member"?{id:setup.home.id,name:setup.home.nickname}:null);setAvailable(caps.receiptBatch===true);setAi(scan?.receiptExtraction===true);setError(null);})
   .catch(()=>{if(active)setError("Could not load the batch and your home. Check your connection and try again.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[userId,reload]);
 usePreventRemove((busy||dirty)&&!exit,({data})=>{
  if(busy){Alert.alert("A step is in progress","You can return to this batch from Vault. Check its status before uploading again.",[{text:"Stay here",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)}]);return;}
  Alert.alert("Leave these edits?","Changes since your last saved draft will be lost.",[{text:"Keep editing",style:"cancel"},{text:"Discard edits",style:"destructive",onPress:()=>navigation.dispatch(data.action)}]);
 });
 async function persist(next:ReceiptBatch){
  if(!userId)throw Error("Sign in required");
  const saved=await receiptBatches.write(userId,next,current.current?.revision??null);
  current.current=saved;setBatch(saved);return saved;
 }
 async function updateItem(id:string,patch:Partial<ReceiptBatchItem>){
  if(!current.current)throw Error("Batch unavailable");
  return persist({...current.current,items:current.current.items.map(i=>i.requestId===id?{...i,...patch}:i)});
 }
 function chooseItem(item:ReceiptBatchItem){
  const apply=()=>{setOptions(false);setSelected(item.requestId);setFields(item.fields);setReviewed(false);setDirty(false);setError(null);};
  if(dirty)Alert.alert("Discard unsaved edits?","Save your draft to keep these changes.",[{text:"Keep editing",style:"cancel"},{text:"Discard",style:"destructive",onPress:apply}]);else apply();
 }
 async function pickBatch(){
  if(lock.current||!home||!available||current.current)return;
  lock.current=true;setBusy(true);setError(null);
  try{
   const result=await DocumentPicker.getDocumentAsync({type:RECORD_PICKER_TYPES,multiple:true,copyToCacheDirectory:true});
   if(result.canceled)return;
   if(result.assets.length>5){setError("Choose up to five receipts at a time. No files were added.");return;}
   const items:ReceiptBatchItem[]=[];const chosen:Record<string,FilePart>={};
   for(const asset of result.assets){
    let prepared;
    try{prepared=await prepareAttachment({uri:asset.uri,name:asset.name,type:uploadMimeType(asset.name,asset.mimeType),size:asset.size});}
    catch{setError(asset.name+": This photo could not be prepared. Choose another photo or a PDF. No files were added.");return;}
    const file={...prepared,mimeType:prepared.type};
    const invalid=uploadValidationError(file.size,uploadMimeType(file.name,file.mimeType),RECORD_FILE_TYPES);
    if(invalid){setError(file.name+": "+invalid+" No files were added.");return;}
    const requestId=newVaultSaveRequestId();chosen[requestId]=file;
    items.push({requestId,name:file.name.slice(0,250),status:"review",readAttempted:false,file:{uri:file.uri,name:file.name,mimeType:file.mimeType,size:file.size},fields:{...empty,title:file.name.replace(/\.[^.]+$/,"").slice(0,200)}});
   }
   const saved=await persist({version:1,revision:0,homeId:home.id,homeName:home.name,items});
   setFiles(chosen);setReadConsent(true);chooseItem(saved.items[0]);
  }catch{setError("Could not save the batch on this device. No receipts were submitted.");}
  finally{lock.current=false;setBusy(false);}
 }
 const item=batch?.items.find(i=>i.requestId===selected);
 const sameHome=Boolean(home&&batch?.homeId===home.id);
 const file=item?files[item.requestId]:undefined;
 async function selectOriginal(){
  if(!item||lock.current)return;lock.current=true;setBusy(true);
  try{
   const result=await DocumentPicker.getDocumentAsync({type:item.status==="review"?RECORD_PICKER_TYPES:RECORD_FILE_TYPES,copyToCacheDirectory:true});
   if(result.canceled)return;const asset=result.assets[0];
   const original={uri:asset.uri,name:asset.name,type:uploadMimeType(asset.name,asset.mimeType),size:asset.size};
   // An in-flight save has an immutable fingerprint. Never re-encode its original.
   const prepared=item.status==="review"?await prepareAttachment(original):original;
   const chosen={...prepared,mimeType:prepared.type};
   if(chosen.name!==item.name&&asset.name!==item.name){setError("Choose the original named "+item.name+". Start a new batch for a different receipt.");return;}
   const invalid=uploadValidationError(chosen.size,uploadMimeType(chosen.name,chosen.mimeType),RECORD_FILE_TYPES);
   if(invalid){setError(invalid);return;}
   await updateItem(item.requestId,{file:{uri:chosen.uri,name:chosen.name,mimeType:chosen.mimeType,size:chosen.size}});
   setFiles(previous=>({...previous,[item.requestId]:chosen}));setReviewed(false);setError(null);
  }catch{setError("Could not select the original. Try again.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function saveDraft(){
  if(!item||lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{await updateItem(item.requestId,{fields});setDirty(false);}
  catch{setError("Could not keep these edits on your device. They are still on this screen.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function read(){
  if(!item||!file||lock.current||!ai||!sameHome||item.status!=="review")return;
  lock.current=true;setBusy(true);setError(null);setReviewed(false);
  try{
   await updateItem(item.requestId,{readAttempted:true,readState:"reading",fields});setDirty(false);
   const form=new FormData();form.append("kind","receipt");form.append("file",{uri:file.uri,name:file.name,type:uploadMimeType(file.name,file.mimeType)} as unknown as Blob);
   const response=await apiFormPost<{data:Record<string,unknown>}>("/api/mobile/v1/ai/scan",form,{timeoutMs:55000});
   const result=receiptSuggestions(response.data);
   if(!result){await updateItem(item.requestId,{readState:"failed",message:"We couldn’t identify a receipt. Try a clearer copy, or save the original with a title."});setError("We couldn’t identify a receipt. Try a clearer copy, or save the original with a title.");return;}
   const {reviewNotes,...suggested}=result;
   const next=mergeReceiptSuggestions(fields,{...suggested,category:"Receipt" as const},item.name);
   await updateItem(item.requestId,{readState:"complete",fields:next,message:reviewNotes.join(" ").slice(0,500)});setFields(next);
  }catch(e){
   const message=statementReadFailure(e instanceof ApiError?e.status:undefined).replace(/Statement/g,"Receipt").replace(/statement/g,"receipt");
   try{await updateItem(item.requestId,{readState:"failed",message});}catch{/* The last reading reference stays recoverable. */}
   setError(message);
  }
  finally{lock.current=false;setBusy(false);}
 }
 // Auto-read only a newly selected batch, never a failed/interrupted read or a dirty draft.
 useEffect(()=>{
  if(!item||!file||!readConsent||!ai||!sameHome||busy||dirty||item.status!=="review"||item.readAttempted)return;
  const timer=setTimeout(()=>void read(),0);return()=>clearTimeout(timer);
  // read uses the current render; the state dependencies below cancel before dispatch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[item,file,readConsent,ai,sameHome,busy,dirty]);
 async function submit(confirmed=false){
  if(!item||lock.current||!sameHome||(item.status==="review"&&!available))return;
  if(item.status==="review"&&((!reviewed&&!confirmed)||!file||!fields.title.trim()))return;
  lock.current=true;setBusy(true);setError(null);
  const key=item.requestId;
  try{
   let values=fields,originalExpected:string|null=null;
   if(item.status!=="review"){
    try{
     const saved=await apiPatch<{id:string}>(endpoint+"?requestId="+key,undefined,{timeoutMs:45000});
     await updateItem(key,{status:"saved",documentId:saved.id,message:undefined,file:undefined});setSelected(null);setDirty(false);return;
    }catch(e){
     if(!(e instanceof ApiError&&[404,428].includes(e.status)))throw e;
     if(e.status===428){
      const recovery=await apiGet<{fields:ReceiptFields;expectedVersion:string|null}>(endpoint+"?requestId="+key,{timeoutMs:15000});
      values=recovery.fields;originalExpected=recovery.expectedVersion;
     }else {
      await updateItem(key,{status:"review",message:"No saved attempt was found. Review the original again before retrying."});
      setFields(item.fields);setReviewed(false);setError("No saved attempt was found. Check the original and confirm its details before retrying.");return;
     }
     await updateItem(key,{status:"needs_file",fields:values});
     if(!file){setError("Choose the same original file, then check and finish this save.");return;}
    }
   }else{
    await updateItem(key,{status:"submitting",fields,message:undefined});setDirty(false);
   }
   if(!file)return;
   const form=new FormData();Object.entries(values).forEach(([k,v])=>{if(v!==undefined)form.append(k,v);});
   form.append("requestId",key);form.append("expectedHomeId",batch!.homeId);
   if(originalExpected)form.append("expectedVersion",originalExpected);
   form.append("file",{uri:file.uri,name:file.name,type:uploadMimeType(file.name,file.mimeType)} as unknown as Blob);
   const response=await apiFormPost<{id:string}>(endpoint,form,{timeoutMs:45000});
   await updateItem(key,{status:"saved",documentId:response.id,message:undefined,file:undefined});setFiles(previous=>{const next={...previous};delete next[key];return next;});setSelected(null);setDirty(false);
  }catch(e){
   try{
    const detail=e instanceof ApiError&&e.details&&typeof e.details==="object"?e.details as {duplicateId?:unknown;recoveryRequestId?:unknown}:{};
    if(validBatchId(detail.duplicateId)){await updateItem(key,{status:"duplicate",documentId:detail.duplicateId,message:undefined,file:undefined});setSelected(null);setDirty(false);}
    else if(validBatchId(detail.recoveryRequestId)){
     await updateItem(key,{status:"blocked",message:"This original has an earlier unfinished save. Open it to finish before retrying this item."});
     setError("An earlier save needs attention.");
     Alert.alert("Earlier save found","Finish the original attempt, then return and check this item.",[{text:"Stay here",style:"cancel"},{text:"Open save",onPress:()=>router.push({pathname:"/vault-save-resume",params:{requestId:detail.recoveryRequestId as string}})}]);
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
  try{await updateItem(item.requestId,{status:"skipped",fields});setSelected(null);setDirty(false);}
  catch{setError("Could not skip this item. Try again.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function restoreSkipped(){
  if(!item||item.status!=="skipped"||lock.current||!sameHome)return;
  lock.current=true;setBusy(true);setError(null);
  try{await updateItem(item.requestId,{status:"review"});setFields(item.fields);setReviewed(false);setDirty(false);}
  catch{setError("Could not restore this receipt. Your other saved records are unchanged.");}
  finally{lock.current=false;setBusy(false);}
 }
 function discardBatch(){
  if(!userId||!current.current||busy)return;
  Alert.alert("Remove this batch from this device?","Saved records stay in Vault. Unsubmitted drafts will be discarded. This does not cancel submitted uploads; check Vault before adding those originals again.",[
   {text:"Keep batch",style:"cancel"},{text:"Remove batch",style:"destructive",onPress:()=>{
    if(!userId||!current.current||lock.current)return;
    lock.current=true;setBusy(true);
    void receiptBatches.clear(userId,current.current.revision).then(()=>{setDirty(false);setExit(true);}).catch(()=>setError("Could not clear this batch. Reopen it and try again.")).finally(()=>{lock.current=false;setBusy(false);});
   }},
  ]);
 }
 async function finish(){
  if(!userId||!current.current||lock.current||batchCounts(current.current).pending)return;
  lock.current=true;setBusy(true);
  try{await receiptBatches.clear(userId,current.current.revision);setDirty(false);setExit(true);}
  catch{setError("Could not clear the completed batch. Saved records remain in Vault.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function showReceipts(){
  if(lock.current)return;
  if(dirty&&item){
   lock.current=true;setBusy(true);
   try{await updateItem(item.requestId,{fields});setDirty(false);}catch{setError("Could not keep these edits. Please stay here and try again.");return;}
   finally{lock.current=false;setBusy(false);}
  }
  setSelected(null);setError(null);
 }
 function confirmRead(){Alert.alert("Read receipt?","Send this original to Rezlee’s document-reading service? Your entered details stay; only missing details are filled.",[{text:"Cancel",style:"cancel"},{text:"Read receipt",onPress:()=>void read()}]);}
 function edit(key:keyof ReceiptFields,value:string){setFields(v=>({...v,[key]:value}));setDirty(true);setReviewed(false);}
 if(!userId)return <SafeAreaView><Text>Sign in to manage receipt uploads.</Text><Button label="Sign in" onPress={()=>router.replace("/(auth)/login")}/></SafeAreaView>;
 const counts=batch?batchCounts(batch):null;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title={item?"Review receipt":"Add receipts"} fallback="/(tabs)/vault"/>
  <View style={{flex:1}} >
  <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   {loading?<ActivityIndicator accessibilityLabel="Loading receipt batch"/>:<>
    {error?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text>:null}
    {!available?<Text style={[typography.body,{color:colors.mutedForeground}]}>Batch saving is not available right now. Existing records are unchanged.</Text>:null}
    {!batch?<><JourneyHeading title="Keep your receipts together." detail="Choose up to five receipts. Review the details, then save each original privately in Vault."/>{home?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Saving to {home.name}</Text>:null}<Text style={[typography.caption,{color:colors.mutedForeground}]}>{ai?"Files are sent to the document-reading service. PDFs up to 4 MB; photos are prepared on your device.":"Automatic reading is unavailable. You can still save each original with a title."}</Text><Button label="Choose receipts" disabled={busy||!available||!home} onPress={()=>void pickBatch()}/>{error?<QuietAction label="Check again" onPress={()=>{setLoading(true);setReload(v=>v+1);}}/>:null}<QuietAction label="Add one record instead" onPress={()=>router.push("/vault-record")}/></>:<>
     {!item?<><Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.foreground}]}>{counts!.saved} saved · {counts!.duplicates} already saved · {counts!.pending} unfinished{counts!.skipped?" · "+counts!.skipped+" skipped":""}</Text>
     <Text style={[typography.caption,{color:colors.mutedForeground}]}>For {batch.homeName}. Your drafts and selected files are kept on this device. If a file is no longer available, choose it again. Failed reading only retries when you ask.</Text>
     {!sameHome?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>This batch belongs to a different home, or your home could not be verified. Return to the matching home before saving.</Text>:null}
     {batch.items.map((row,i)=><BriefRow key={row.requestId} title={(i+1)+". "+row.name} detail={receiptReadLabel(row)} onPress={()=>{if(!busy)chooseItem(row);}}/>)}</>:<View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:spacing.sm}}><QuietAction label="All receipts" disabled={busy} onPress={()=>void showReceipts()}/><Text style={[typography.caption,{color:colors.mutedForeground}]}>{batch.items.findIndex(row=>row.requestId===item.requestId)+1} of {batch.items.length}</Text></View>}
     {item&&!sameHome?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>Return to {batch.homeName} before saving.</Text>:null}
     {item?<View style={{gap:spacing.md}}>
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>{item.name}</Text>
      {item.message&&item.message!==error?<Text style={[typography.body,{color:colors.mutedForeground}]}>{item.message}</Text>:null}
      {item.documentId?<QuietAction label="Open saved receipt" onPress={()=>router.push({pathname:"/vault-record",params:{id:item.documentId!}})}/>:item.status==="skipped"?<><Text style={[typography.body,{color:colors.mutedForeground}]}>Not submitted to Vault. Your draft is kept in this batch.</Text><Button label="Review this receipt" disabled={busy||!sameHome} onPress={()=>void restoreSkipped()}/></>:<>
       {!file?<Button label="Choose original" variant="secondary" disabled={busy||!sameHome} onPress={()=>void selectOriginal()}/>:<QuietAction label="Original & reading" disabled={busy} onPress={()=>setOptions(true)}/>}
       {item.status==="review"?<>
        {busy&&item.readState==="reading"?<View style={{gap:spacing.sm,paddingVertical:spacing.lg}}><ActivityIndicator accessibilityLabel="Reading receipt"/><Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.mutedForeground,textAlign:"center"}]}>Reading your receipt…</Text></View>:null}
        {ai&&file&&item.readState!=="complete"?<Button label={item.readAttempted?"Retry reading":"Read receipt"} variant="secondary" disabled={busy||!sameHome} onPress={confirmRead}/>:null}
        <TextField label="Receipt title" maxLength={200} value={fields.title} editable={!busy} onChangeText={v=>edit("title",v)}/>
        <DateField label="Purchase date" optional value={fields.issued_on} onChange={v=>{if(!busy)edit("issued_on",v);}}/>
        <TextField label="Printed details and notes" style={{minHeight:120,textAlignVertical:"top",paddingTop:12}} maxLength={5000} multiline value={fields.notes} editable={!busy} onChangeText={v=>edit("notes",v)}/>
        {dirty?<QuietAction label="Keep draft" disabled={busy} onPress={()=>void saveDraft()}/>:null}
        <Text style={[typography.caption,{color:colors.mutedForeground}]}>Check the details before saving. Your original will be kept with this receipt.</Text>
        <Button label={busy?"Working…":"Save this receipt"} disabled={busy||!sameHome||!available||!file||!fields.title.trim()} onPress={()=>void submit(true)}/>
        <QuietAction label="Skip this receipt" disabled={busy} onPress={()=>Alert.alert("Skip this receipt?","This file will not be saved. Your other receipts are kept.",[{text:"Keep reviewing",style:"cancel"},{text:"Skip",onPress:()=>void skip()}])}/>
       </>:<><Text style={[typography.body,{color:colors.mutedForeground}]}>Your submitted details are locked. Check the previous attempt before creating another copy.</Text><Button label={busy?"Checking…":"Check and finish save"} disabled={busy||!sameHome} onPress={()=>void submit()}/></>}
      </>}
     </View>:null}
     {!item&&counts!.pending>0?<QuietAction label="Remove unfinished batch from this device" disabled={busy} onPress={discardBatch}/>:null}
     {!item&&counts!.pending===0?<Button label="Done · return to Vault" disabled={busy} onPress={()=>void finish()}/>:null}
    </>}
   </>}
  </FormScrollView></View>
  <CollectionAddSheet visible={options} onClose={()=>setOptions(false)} title="Original & reading" choices={[
   {key:"view",title:"View original",detail:item?.name??"Selected receipt",icon:"file-text",onPress:()=>{if(file)void Linking.openURL(file.uri).catch(()=>setError("Preview unavailable. Choose the original again if it is no longer on this device."));}},
   {key:"choose",title:"Choose original again",detail:"Use this if the file is no longer available.",icon:"upload",onPress:()=>void selectOriginal()},
   ...(ai&&file&&sameHome&&item?.status==="review"?[{key:"read",title:"Read again",detail:"Fill missing details while keeping your edits.",icon:"refresh-cw" as const,onPress:confirmRead}]:[]),
  ]}/>
 </SafeAreaView>;
}

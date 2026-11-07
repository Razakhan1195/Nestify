import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel,JourneySteps} from "@/components/JourneyUI";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {useAuth} from "@/auth/AuthProvider";
import {vaultPending} from "@/lib/vault-pending";
import * as ImagePicker from "expo-image-picker";
import { documentSuggestions, type CaptureKind } from "@/lib/capture-review";
import { Surface } from "@/components/ui/Surface";
import { newVaultSaveRequestId } from "@/lib/vault-save-intent";
import { safeBack } from "@/lib/navigation";
import { useCallback,useEffect,useRef,useState } from "react";
import { useLocalSearchParams,useRouter,useFocusEffect,useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { Button } from "@/components/Button";
import { apiGet,apiFormPost,apiDelete,ApiError } from "@/lib/api";
import { RECORD_PICKER_TYPES, RECORD_FILE_TYPES,uploadMimeType,uploadValidationError } from "@/lib/upload-validation";
import { spacing, typography, radii } from "@/theme/tokens";
const categories=["Receipt","Warranty","Insurance","Manual","Lease","Contract","Tax","Other"];
type RecordAttachment=Pick<DocumentPicker.DocumentPickerAsset,"uri"|"name"|"mimeType"|"size">;
type RecordFields={title:string;category:string;issued_on:string;expires_on:string;notes:string};
export default function VaultRecordScreen(){
  const { colors } = useTheme();

 const params=useLocalSearchParams<{id?:string;kind?:string;itemId?:string;issueId?:string}>(),router=useRouter(),navigation=useNavigation();
 const quoteMode=params.kind==="quote";
 const {session}=useAuth();
 const userId=session?.user.id;
 const [recoveryReady,setRecoveryReady]=useState(false);
 const [saveHome,setSaveHome]=useState<{id:string;name:string}|null>(null);
 useEffect(()=>{let active=true;void apiGet<{saveRecovery:boolean;homeId?:string;homeName?:string}>("/api/mobile/v1/vault/records?capabilities=1",{timeoutMs:10000}).then(r=>{if(active){setRecoveryReady(r.saveRecovery===true);if(r.homeId)setSaveHome({id:r.homeId,name:r.homeName??"Your home"});}}).catch(()=>{});return()=>{active=false;};},[]);
 const id=typeof params.id==="string"?params.id:undefined;
 const [fields,setFields]=useState<RecordFields>({title:"",category:params.kind==="warranty"?"Warranty":params.kind==="receipt"?"Receipt":"Other",issued_on:"",expires_on:"",notes:""});
 const [showOriginalTools,setShowOriginalTools]=useState(false);
 const [showDetails,setShowDetails]=useState(Boolean(id)),[showExtra,setShowExtra]=useState(Boolean(id));
 const [savedRecordId,setSavedRecordId]=useState<string|null>(null);
 const [file,setFile]=useState<RecordAttachment|null>(null);
 const [original,setOriginal]=useState<{name:string|null;hasFile:boolean}>({name:null,hasFile:false});
 const [dirty,setDirty]=useState(false),[loading,setLoading]=useState(Boolean(id)),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const [deleting,setDeleting]=useState(false);
 const [duplicateId,setDuplicateId]=useState<string|null>(null);
 const [pendingSave,setPendingSave]=useState(false),[saveConflict,setSaveConflict]=useState(false);
 const saveRequestId=useRef<string|null>(null),saveLock=useRef(false),recordVersion=useRef<string|undefined>(undefined);
 const [preparing,setPreparing]=useState(false);
 const captureLock=useRef(false);
 const [readSucceeded,setReadSucceeded]=useState(false);
 const [reading,setReading]=useState(false),[readAttempted,setReadAttempted]=useState(false);
 const [receiptReady,setReceiptReady]=useState(false),[reviewed,setReviewed]=useState(false);
 const [readingAvailabilityChecked,setReadingAvailabilityChecked]=useState(false);
 const [reviewNotes,setReviewNotes]=useState<string[]>([]);
 const newReceipt=!id&&fields.category==="Receipt";
 const newCapture=!id;
 const captureKind:CaptureKind=fields.category==="Warranty"?"warranty":fields.category==="Receipt"?"receipt":"document";
 const locked=busy||pendingSave||reading||preparing;
 useEffect(()=>{let active=true;if(!id&&!quoteMode)void apiGet<{receiptExtraction:boolean}>("/api/mobile/v1/ai/scan",{timeoutMs:10000}).then(r=>{if(active)setReceiptReady(r.receiptExtraction===true);}).catch(()=>{}).finally(()=>{if(active)setReadingAvailabilityChecked(true);});return()=>{active=false;};},[id,quoteMode]);
 const [error,setError]=useState<string|null>(null);
 usePreventRemove((dirty||busy||pendingSave||reading||preparing)&&!saved,({data})=>{
  if(busy||reading||preparing){Alert.alert(reading?"Reading document":deleting?"Deleting record":"Saving record","Please wait for this to finish.");return;}
  if(pendingSave){Alert.alert("Leave this save?","A save may already have finished. Check Vault before adding the record again. When save recovery is available, Vault keeps a link to this attempt.",[{text:"Stay here",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)}]);return;}
  Alert.alert("Discard changes?","Your changes have not been saved.",[{text:"Keep editing",style:"cancel"},{text:"Discard",style:"destructive",onPress:()=>navigation.dispatch(data.action)}]);
 });
 const load=useCallback(async()=>{
  if(!id)return;
  try{
   const {record}=await apiGet<{record:RecordFields&{document_type:string|null;file_name:string|null;hasFile:boolean;updated_at?:string}}>("/api/mobile/v1/vault/records?id="+id);
   setFields({title:record.title,category:categories.includes(record.category)?record.category:categories.includes(record.document_type??"")?record.document_type!:"Other",issued_on:record.issued_on??"",expires_on:record.expires_on??"",notes:record.notes??""});
   recordVersion.current=record.updated_at;
   setOriginal({name:record.file_name,hasFile:record.hasFile});setFailed(false);setError(null);
  }catch(e){setFailed(true);setError(e instanceof ApiError?e.message:"Could not load record.");}finally{setLoading(false);}
 },[id]);
 useFocusEffect(useCallback(()=>{if(!dirty)void load();},[load,dirty]));
 useEffect(()=>{if(saved&&!savedRecordId)safeBack(router,"/(tabs)/vault");},[saved,savedRecordId,router]);
 function change(key:keyof RecordFields,value:string){if(locked)return;setReviewed(false);setFields(v=>({...v,[key]:value}));setDirty(true);}
 async function choose(){
  if(locked||saveLock.current||captureLock.current)return;
  captureLock.current=true;
  try{
   const result=await DocumentPicker.getDocumentAsync({type:RECORD_PICKER_TYPES,copyToCacheDirectory:true});
   if(result.canceled)return;setPreparing(true);const asset=result.assets[0];
   const prepared=await prepareAttachment({uri:asset.uri,name:asset.name,type:uploadMimeType(asset.name,asset.mimeType),size:asset.size});
   const selected={...prepared,mimeType:prepared.type};
   const invalid=uploadValidationError(selected.size,uploadMimeType(selected.name,selected.mimeType),RECORD_FILE_TYPES);
   if(invalid){setError(invalid);return;}
   selectOriginal(selected);
  }catch(e){setError(e instanceof Error?e.message:"Could not choose a file. Please try again.");}
  finally{captureLock.current=false;setPreparing(false);}
 }
 function selectOriginal(selected:RecordAttachment){
  const apply=()=>{
   setFile(selected);setDirty(true);setError(null);setReviewed(false);setReadAttempted(false);setReadSucceeded(false);setReviewNotes([]);
   if(!fields.title.trim())setFields(v=>({...v,title:selected.name.replace(/\.[^.]+$/,"").slice(0,200)}));
   setShowDetails(true);
   if(newCapture&&receiptReady&&!file&&!dirty)void readDocument(selected);
  };
  if(newCapture&&file)Alert.alert("Replace original?", "Your reviewed details will stay. Use Read again if you want suggestions from the new file.",[{text:"Cancel",style:"cancel"},{text:"Use file",onPress:apply}]);
  else apply();
 }
 async function camera(){
  if(locked||saveLock.current||captureLock.current)return;
  captureLock.current=true;
  try{
   if(!(await ImagePicker.requestCameraPermissionsAsync()).granted){Alert.alert("Camera access needed","Allow camera access in Settings, or attach a saved file.",[{text:"Cancel",style:"cancel"},{text:"Settings",onPress:()=>void Linking.openSettings()}]);return;}
   const result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:0.85});
   if(result.canceled)return;
   setPreparing(true);
   const asset=result.assets[0];
   const prepared=await prepareAttachment({uri:asset.uri,name:asset.fileName??"receipt.jpg",type:uploadMimeType(asset.fileName??"receipt.jpg",asset.mimeType),size:asset.fileSize,width:asset.width,height:asset.height});
   selectOriginal({...prepared,mimeType:prepared.type});
  }catch(e){setError(e instanceof Error?e.message:"Could not prepare the photo. Retake it or choose a file.");}
  finally{captureLock.current=false;setPreparing(false);}
 }
 async function readDocument(selected:RecordAttachment|null=file){
  if(!selected||!newCapture||!receiptReady||busy||pendingSave||reading||saveLock.current)return;
  saveLock.current=true;setReading(true);setReadAttempted(true);setError(null);setReviewed(false);
  try{
   const form=new FormData();form.append("kind",captureKind);
   form.append("file",{uri:selected.uri,name:selected.name,type:uploadMimeType(selected.name,selected.mimeType)} as unknown as Blob);
   const result=await apiFormPost<{data:Record<string,unknown>}>("/api/mobile/v1/ai/scan",form,{timeoutMs:55000});
   const proposed=documentSuggestions(captureKind,result.data);
   if(!proposed){setError("We couldn’t read useful details from this file. Try a clearer original, or save it with just a title.");return;}
   const {reviewNotes:notes,...values}=proposed;setFields(values);setShowDetails(true);setReviewNotes(notes);setDirty(true);setReadSucceeded(true);setShowOriginalTools(false);
  }catch(e){setError(e instanceof ApiError?e.message+" You can still enter the details yourself.":"Reading could not be confirmed. Enter the details yourself; we won’t retry AI automatically.");}
  finally{saveLock.current=false;setReading(false);}
 }
 function confirmRead(){
  Alert.alert("Read this document?", "This sends the original to Rezlee’s AI service. Suggestions replace the title, dates and notes. Review before saving.",[{text:"Cancel",style:"cancel"},{text:"Read document",onPress:()=>void readDocument()}]);
 }
 async function openFile(){
  try{const r=await apiGet<{url:string}>("/api/mobile/v1/vault/records?id="+id+"&file=1");await Linking.openURL(r.url);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not open attachment.");}
 }
 async function remove(){
  if(!id||locked)return;setBusy(true);setDeleting(true);setError(null);
  try{
   await apiDelete("/api/mobile/v1/vault/records?id="+encodeURIComponent(id));
   setSaved(true);Alert.alert("Record deleted","The record and its saved attachment have been removed.");
  }catch(e){setError(e instanceof ApiError?e.message:"Could not confirm deletion. Please try again.");}
  finally{setBusy(false);setDeleting(false);}
 }
 function confirmDelete(){
  if(locked)return;
  Alert.alert("Delete this record?","This permanently removes the record, its attachment and any quote review attached to it. Any linked bill keeps its saved charges but loses this original. Unsaved changes will also be discarded.",[
   {text:"Keep record",style:"cancel"},{text:"Delete record",style:"destructive",onPress:()=>void remove()}
  ]);
 }
 function reviewLatest(){
  Alert.alert("Review the saved record?","Your unsaved changes will be discarded. You can edit again after reviewing the latest record.",[
   {text:"Keep changes",style:"cancel"},{text:"Review record",onPress:()=>{
    if(!id){safeBack(router,"/(tabs)/vault");return;}
    saveRequestId.current=null;setPendingSave(false);setSaveConflict(false);setDirty(false);setFile(null);setLoading(true);
   }}
  ]);
 }
 async function save(){
  if(saveLock.current||busy||reading||preparing||(newCapture&&file&&!reviewed))return;
  saveLock.current=true;setBusy(true);setPendingSave(true);setDirty(true);setError(null);
  saveRequestId.current??=newVaultSaveRequestId();
  try{
   if(recoveryReady&&userId)await vaultPending.remember(userId,saveRequestId.current);
   const form=new FormData();Object.entries(fields).forEach(([k,v])=>form.append(k,v));if(id)form.append("id",id);
   form.append("requestId",saveRequestId.current);
   if(saveHome)form.append("expectedHomeId",saveHome.id);
   if(recordVersion.current)form.append("expectedVersion",recordVersion.current);
   if(file)form.append("file",{uri:file.uri,name:file.name,type:uploadMimeType(file.name,file.mimeType)} as unknown as Blob);
   const result=await apiFormPost<{id:string}>("/api/mobile/v1/vault/records",form,{timeoutMs:45000});
   if(recoveryReady&&userId){try{await vaultPending.forget(userId,saveRequestId.current);}catch{/* Confirmed server save: keep the recovery reference without reporting a failed save. */}}
   setPendingSave(false);if(!id)setSavedRecordId(result.id);setSaved(true);
  }catch(e){
   if(e instanceof ApiError&&e.status===409&&e.details&&typeof e.details==="object"){
    const detail=e.details as {duplicateId?:unknown;recoveryRequestId?:unknown};
    const valid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
    try{
     if(valid(detail.duplicateId)){
      if(recoveryReady&&userId&&saveRequestId.current)await vaultPending.forget(userId,saveRequestId.current);
      setDuplicateId(detail.duplicateId);setPendingSave(false);
     }else if(valid(detail.recoveryRequestId)&&recoveryReady&&userId&&saveRequestId.current){
      await vaultPending.replace(userId,saveRequestId.current,detail.recoveryRequestId);
     }
    }catch{setError("Could not update the recovery reference. Check Vault before adding another copy.");setSaveConflict(true);return;}
   }
   if(e instanceof ApiError&&[400,413].includes(e.status)){
    try{if(recoveryReady&&userId&&saveRequestId.current)await vaultPending.forget(userId,saveRequestId.current);setPendingSave(false);}catch{/* Keep recovery reference when device storage fails. */}
   }
   if(e instanceof ApiError&&[404,409,410].includes(e.status))setSaveConflict(true);
   setError(e instanceof ApiError?e.message:"We couldn't confirm the save. Your details are kept here. Tap Retry save to check and finish it.");
  }finally{saveLock.current=false;setBusy(false);}
 }
 const attachmentSection=(newCapture&&file&&readSucceeded&&!showOriginalTools?<Surface tone="subtle" style={{gap:spacing.sm}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>{file.name}</Text><Button label="View or change original" variant="secondary" disabled={locked} onPress={()=>setShowOriginalTools(true)}/></Surface>:<View style={{gap:12,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:22,padding:20}}>
      <Text style={[typography.section,{color:colors.foreground}]}>{newCapture ? (quoteMode ? "Keep the original quote" : !receiptReady ? "Keep your original" : newReceipt ? "Scan a receipt" : "Let Rezlee read it") : "Attachment"}</Text>
      {newCapture?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{quoteMode?"Attach a quote, or paste its text below. Save the original first, then review its scope, terms and missing details.":!readingAvailabilityChecked?"Checking automatic reading. You can still capture the original.":receiptReady?"Photograph or upload a receipt, warranty or household document. The file is sent to Rezlee’s AI service to suggest details; you review before saving.":"Save an original with just a title. Automatic reading is unavailable right now."}</Text>:null}
      {preparing?<ActivityIndicator accessibilityLabel="Preparing your photo"/>:null}
      {newCapture&&file&&uploadMimeType(file.name,file.mimeType).startsWith("image/")?<Image source={{uri:file.uri}} alt="Selected document photo" accessibilityLabel="Selected document photo" resizeMode="contain" style={{height:180,width:"100%",backgroundColor:colors.surfaceRaised,borderRadius:radii.lg}}/>:null}
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>{file?.name??original.name??"PDF, JPG, PNG or WebP · up to 4 MB"}</Text>
      {original.hasFile?<Button label={fields.category==="Receipt"?"View original receipt":"View original document"} variant="secondary" onPress={()=>void openFile()}/>:null}
      <Button label={file||original.hasFile?"Choose replacement file":"Choose a file"} variant="secondary" disabled={locked} onPress={()=>void choose()}/>
      {file?<Pressable accessibilityRole="button" disabled={locked} onPress={()=>{setFile(null);setReviewed(false);setReadAttempted(false);setReadSucceeded(false);setReviewNotes([]);setDirty(true);}} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.mutedForeground}}>Remove selected file</Text></Pressable>:null}
      {newCapture&&file?<Pressable accessibilityRole="button" disabled={locked} onPress={()=>void Linking.openURL(file.uri).catch(()=>setError("This device couldn’t preview the selected file. Check the original in Photos or Files before confirming."))} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Open selected original</Text></Pressable>:null}
      {newCapture?<Button label={preparing?"Preparing photo…":file?"Retake photo":newReceipt?"Scan receipt":"Take a photo"} disabled={locked} onPress={()=>void camera()}/>:null}
      {newCapture&&file&&receiptReady?<Button label={reading?"Reading document…":readSucceeded?"Read again":readAttempted?"Retry reading":"Read document"} variant="secondary" disabled={locked} onPress={confirmRead}/>:null}
     </View>);
 if(savedRecordId) return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title="Saved in Vault" fallback="/(tabs)/vault"/>
  <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   <Surface tone="subtle" style={{gap:spacing.md}}>
    <JourneyHeading eyebrow="Saved in Vault" title={fields.title}/>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{file?"Your original and reviewed details are together in Vault.":"Your record is saved in Vault."} Ask Rezlee can use these saved details in your home questions.</Text>
    {fields.expires_on?<Text style={[typography.body,{color:colors.foreground}]}>Saved expiry: {fields.expires_on}. Find it in Vault’s dated records.</Text>:null}
    {fields.notes?<Text style={[typography.body,{color:colors.mutedForeground}]} numberOfLines={6}>{fields.notes}</Text>:null}
   </Surface>
   {quoteMode?<Button label="Review this quote" onPress={()=>router.replace({pathname:"/quotes",params:{id:savedRecordId,...(params.itemId?{itemId:params.itemId}:{}),...(params.issueId?{issueId:params.issueId}:{})}})}/>:null}
   <Button label="View saved record" variant={quoteMode?"secondary":"primary"} onPress={()=>router.replace({pathname:"/vault-record",params:{id:savedRecordId}})}/>
   <Button label="Back to Vault" variant="secondary" onPress={()=>router.replace("/(tabs)/vault")}/>
  </ScrollView>
 </SafeAreaView>;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title={id?"Record details":quoteMode?"Add a quote":params.kind==="receipt"?"Scan receipt":fields.category==="Warranty"?"Add warranty":"Add record"} fallback="/(tabs)/vault"/>
  <View style={{flex:1}} >
   <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
    {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
    {loading?<ActivityIndicator/>:failed?<Button label="Try again" onPress={()=>{setLoading(true);void load();}}/>:<>
     <JourneyHeading title={id?fields.title||"Your saved record":quoteMode?"Keep the quote. Clarify the details.":fields.category==="Warranty"?"Coverage you can come back to.":"Keep it once. Find it when it matters."} detail={quoteMode?"Save the original and proposed terms, ready to review before agreeing.":fields.category==="Warranty"?"Keep coverage dates and proof of purchase together.":"Save a receipt, policy or manual with the details you want to remember."}/>
     {newCapture?<JourneySteps labels={["Original","Review","Keep"]} current={showDetails?1:0}/>:null}
     {newCapture&&saveHome?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Saving to {saveHome.name}</Text>:null}
     {newCapture?attachmentSection:null}
     {reading?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>Reading the original. No details have been saved yet.</Text>:null}
     {!showDetails?<Button label="Add details without a file" variant="secondary" disabled={locked} onPress={()=>setShowDetails(true)}/>:null}
     {showDetails&&!reading?<>
     {reviewNotes.length?<View style={{gap:6}}><Text style={[typography.section,{color:colors.foreground}]}>Check against your original</Text>{reviewNotes.map((note,i)=><Text key={i} style={[typography.body,{color:colors.mutedForeground}]}>{note}</Text>)}</View>:null}
     {readSucceeded?<Text style={[typography.section,{color:colors.foreground}]}>Review what we found</Text>:null}
     <JourneyPanel>
     <TextField label="Title" value={fields.title} editable={!locked} maxLength={200} onChangeText={v=>change("title",v)}/>
     {!showExtra?<Button label={fields.category+" · Change type or add details"} variant="secondary" disabled={locked} onPress={()=>setShowExtra(true)}/>:null}
     {showExtra?<View style={{gap:spacing.sm}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>Record type</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
      {categories.map(c=><Pressable key={c} disabled={locked} accessibilityRole="button" accessibilityState={{selected:fields.category===c}} onPress={()=>change("category",c)} style={{paddingHorizontal:14,minHeight:44,justifyContent:"center",borderRadius:radii.full,backgroundColor:fields.category===c?colors.accent:colors.surfaceRaised,borderWidth:1,borderColor:fields.category===c?colors.primary:colors.border}}><Text style={{color:colors.foreground}}>{c}</Text></Pressable>)}
     </View></View>:null}
     {showExtra||fields.issued_on?<DateField label={fields.category==="Warranty"?"Coverage starts (optional)":"Issue date (optional)"} value={fields.issued_on} onChange={v=>{if(!locked)change("issued_on",v);}} optional/>:null}
     {showExtra||fields.expires_on?<DateField label={fields.category==="Warranty"?"Coverage expires (optional)":"Expiry date (optional)"} value={fields.expires_on} onChange={v=>{if(!locked)change("expires_on",v);}} optional/>:null}
     {quoteMode||showExtra||fields.notes?<TextField label={quoteMode?"Paste quote text (optional)":"Details from the original / your notes"} multiline value={fields.notes} editable={!locked} maxLength={5000} onChangeText={v=>change("notes",v)} style={{minHeight:110,paddingTop:12,textAlignVertical:"top"}}/>:null}
     </JourneyPanel>
     {!newCapture?attachmentSection:null}
     {pendingSave&&recoveryReady?<Button label="Open save recovery" variant="secondary" disabled={busy} onPress={()=>router.push("/vault-save-resume")}/>:null}
     {pendingSave&&!busy&&!saveConflict?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Retry the same save before making changes. Your saved attachment stays in place until its replacement is ready.</Text>:null}
     {newCapture&&file?<Pressable accessibilityRole="checkbox" accessibilityLabel="I checked these details against the original" accessibilityState={{checked:reviewed,disabled:locked}} disabled={locked} onPress={()=>setReviewed(v=>!v)} style={{minHeight:48,justifyContent:"center"}}><Text style={[typography.body,{color:colors.foreground}]}>{reviewed?"✓ ":"□ "}I checked these details against the original.</Text></Pressable>:null}
     {duplicateId?<Button label="Open saved receipt" variant="secondary" disabled={busy} onPress={()=>router.push({pathname:"/vault-record",params:{id:duplicateId}})}/>:null}
     {saveConflict?<Button label={id?"Review latest record":"Return to Vault"} disabled={busy} onPress={id?reviewLatest:()=>safeBack(router,"/(tabs)/vault")}/>:<Button label={busy&&!deleting?"Saving…":pendingSave?"Retry save":quoteMode?"Save quote":"Save record"} disabled={busy||reading||preparing||!fields.title.trim()||Boolean(newCapture&&file&&!reviewed)} onPress={()=>void save()}/>}
     </>:null}
     {id?<Button label="Review as a quote" variant="secondary" disabled={locked||dirty} onPress={()=>router.push({pathname:"/quotes",params:{id}})}/>:null}
     {id?<Pressable accessibilityRole="button" accessibilityState={{disabled:locked,busy:deleting}} disabled={locked} onPress={confirmDelete} style={{minHeight:44,justifyContent:"center",alignItems:"center"}}><Text style={{color:colors.criticalForeground}}>{deleting?"Deleting…":"Delete record"}</Text></Pressable>:null}
    </>}
   </FormScrollView>
  </View>
 </SafeAreaView>;
}

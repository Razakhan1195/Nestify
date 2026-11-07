import { useTheme } from "@/theme/useTheme";
import {useEffect,useRef,useState} from "react";
import {useRouter,useLocalSearchParams} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import {ActivityIndicator,Alert,Text,View,ScrollView} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {useAuth} from "@/auth/AuthProvider";
import {vaultPending} from "@/lib/vault-pending";
import {apiGet,apiPatch,apiFormPost,ApiError} from "@/lib/api";
import {RECORD_FILE_TYPES,uploadMimeType,uploadValidationError} from "@/lib/upload-validation";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {QuietAction} from "@/components/Brief";
import { spacing, typography } from "@/theme/tokens";
type Recovery={fields:{id?:string;title:string;category:string;issued_on:string;expires_on:string;notes:string};fileName:string|null;expectedVersion:string|null;status:string;documentId:string};
const endpoint="/api/mobile/v1/vault/records";
export default function VaultSaveResume(){
 const {session}=useAuth();
 return <VaultSaveResumeForAccount key={session?.user.id??"signed-out"}/>;
}
function VaultSaveResumeForAccount(){
  const { colors } = useTheme();

 const {session}=useAuth(),router=useRouter(),userId=session?.user.id;
 const params=useLocalSearchParams<{requestId?:string}>();
 const explicit=typeof params.requestId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(params.requestId)?params.requestId:null;
 const [request,setRequest]=useState<string|null>(null),[record,setRecord]=useState<Recovery|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[needsFile,setNeedsFile]=useState(false);
 const [error,setError]=useState<string|null>(null),[destination,setDestination]=useState<string|null>(null);
 const lock=useRef(false);
 usePreventRemove(busy,()=>Alert.alert("Checking your save","Please wait for this step to finish."));
 useEffect(()=>{if(destination&&!busy)router.replace(destination as never);},[destination,busy,router]);
 useEffect(()=>{let active=true;if(!userId)return;
  void (explicit?Promise.resolve(explicit):vaultPending.read(userId)).then(async key=>{
   if(!active)return;setRequest(key);
   if(key){const r=await apiGet<Recovery>(endpoint+"?requestId="+key,{timeoutMs:15000});if(active)setRecord(r);}
  }).catch(e=>{if(active)setError(e instanceof ApiError?e.message:"Could not read the unfinished save. Try again from Vault.");})
  .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[userId,explicit]);
 async function finish(id:string){
  if(!userId||!request)return;
  await vaultPending.forget(userId,request);
  setDestination("/vault-record?id="+encodeURIComponent(id));
 }
 async function resume(){
  if(!request||lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{const r=await apiPatch<{ok:true;id:string}>(endpoint+"?requestId="+request,undefined,{timeoutMs:45000});await finish(r.id);}
  catch(e){if(e instanceof ApiError&&e.status===428)setNeedsFile(true);setError(e instanceof ApiError?e.message:"Could not confirm the save. Check again.");}
  finally{lock.current=false;setBusy(false);}
 }
 async function retryWithFile(){
  if(!request||!record||lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{
   const picked=await DocumentPicker.getDocumentAsync({type:RECORD_FILE_TYPES,copyToCacheDirectory:true});
   if(picked.canceled)return;
   const file=picked.assets[0],mime=uploadMimeType(file.name,file.mimeType);
   const invalid=uploadValidationError(file.size,mime,RECORD_FILE_TYPES);if(invalid){setError(invalid);return;}
   const form=new FormData();
   Object.entries(record.fields).forEach(([k,v])=>{if(v!==undefined)form.append(k,v);});
   form.append("requestId",request);if(record.expectedVersion)form.append("expectedVersion",record.expectedVersion);
   form.append("file",{uri:file.uri,name:file.name,type:mime} as unknown as Blob);
   const result=await apiFormPost<{ok:true;id:string}>(endpoint,form,{timeoutMs:45000});await finish(result.id);
  }catch(e){setError(e instanceof ApiError?e.message:"Could not confirm this save. Check again before starting another.");}
  finally{lock.current=false;setBusy(false);}
 }
 function leave(){
  Alert.alert("Review Vault instead?","Check whether the record is already saved before adding it again. This clears only this device’s recovery reference; it does not delete saved records or cancel an upload.",[
   {text:"Keep reference",style:"cancel"},{text:"Review Vault",onPress:()=>{if(!userId||!request||lock.current)return;lock.current=true;setBusy(true);void vaultPending.forget(userId,request).then(()=>setDestination("/(tabs)/vault")).catch(()=>setError("Could not clear the reference. Try again.")).finally(()=>{lock.current=false;setBusy(false);});}},
  ]);
 }
 if(!userId)return <SafeAreaView style={{flex:1,backgroundColor:colors.background,padding:spacing.xl}}><Text style={[typography.body,{color:colors.foreground}]}>Sign in to check your saved record.</Text><Button label="Sign in" onPress={()=>router.replace("/(auth)/login")}/></SafeAreaView>;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title="Finish record save" fallback="/(tabs)/vault"/>
  <ScrollView contentContainerStyle={{padding:spacing.xl,gap:spacing.lg}}>
   {loading?<ActivityIndicator accessibilityLabel="Loading unfinished save"/>:<>
    <Text style={[typography.section,{color:colors.foreground}]}>{record?.fields.title??(request?"Your unfinished save":"No unfinished save on this device")}</Text>
    {request?<Text style={[typography.body,{color:colors.mutedForeground}]}>Check the server’s saved attempt before creating another copy. You can leave this screen and return from Vault.</Text>:null}
    {record?<View style={{gap:8}}><Text style={[typography.body,{color:colors.foreground}]}>{record.fields.category}{record.fields.issued_on?" · "+record.fields.issued_on:""}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{record.fileName??"No attachment"}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>These details stay unchanged while we finish this attempt. Edit the record after saving.</Text></View>:null}
    {request?<Button label={busy?"Checking…":"Check and finish save"} disabled={busy} onPress={()=>void resume()}/>:null}
    {needsFile&&record?<><Text style={[typography.body,{color:colors.mutedForeground}]}>The original did not finish uploading. Choose the same file with the same filename. A different file cannot replace this attempt.</Text><Button label="Choose same original" variant="secondary" disabled={busy} onPress={()=>void retryWithFile()}/></>:null}
    {request?<QuietAction label="Review Vault instead" disabled={busy} onPress={leave}/>:<QuietAction label="Return to Vault" onPress={()=>router.replace("/(tabs)/vault")}/>}
   </>}
   {error?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text>:null}
  </ScrollView>
 </SafeAreaView>;
}

import { AmbientBackdrop } from "./AmbientBackdrop";
import { FormScrollView } from "@/components/FormScrollView";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { useFocusEffect,useLocalSearchParams } from "expo-router";
import { useCallback,useEffect,useRef,useState,type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import {SafeAreaView} from "react-native-safe-area-context";
import {ScreenNavigation} from "./ScreenNavigation";
import {QuietAction} from "./Brief";
import {colors,layout,radii,spacing,typography} from "@/theme/tokens";
import {ApiError} from "@/lib/api";
import {fetchSharedExpenses,type SharedPayload,type SharedPerson} from "@/lib/shared-expenses";

export function SharedFrame({title,children,disabled=false,embedded=false,inline=false,fallback="/shared"}:{title:string;children:ReactNode;disabled?:boolean;embedded?:boolean;inline?:boolean;fallback?:string}){
 const {groupId}=useLocalSearchParams<{groupId?:string}>();
 const scopedFallback=fallback==="/shared"&&typeof groupId==="string"?"/shared?groupId="+encodeURIComponent(groupId):fallback;
 if(inline)return <View style={{gap:24}}>{children}</View>;
 return <SafeAreaView edges={embedded?["left","right"]:["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <AmbientBackdrop/>
  {!embedded?<ScreenNavigation title={title} fallback={scopedFallback} disabled={disabled}/>:null}
  <View  style={{flex:1}}>
   <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:layout.screenHorizontal,paddingBottom:40,gap:24}}>{children}</FormScrollView>
  </View>
 </SafeAreaView>;
}
export function SharedNotice({message,onRetry,busy=false}:{message:string;onRetry?:()=>void;busy?:boolean}){
 return <View accessibilityLiveRegion="polite" style={{backgroundColor:colors.warningBg,borderRadius:radii.lg,padding:16,gap:8}}>
 <Text style={[typography.body,{color:colors.warningForeground}]}>{message}</Text>
 {onRetry?<QuietAction label={busy?"Checking…":"Try again"} disabled={busy} onPress={onRetry}/>:null}</View>;
}
export function SharedLoading(){return <ActivityIndicator color={colors.primary} accessibilityLabel="Loading shared expenses"/>;}
export function useSharedLedger(id?:string){
 const {groupId:rawGroupId}=useLocalSearchParams<{groupId?:string}>();
 const groupId=typeof rawGroupId==="string"?rawGroupId:undefined;
 const invalidGroup=rawGroupId!==undefined&&(typeof rawGroupId!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(rawGroupId));
 const scopeKey=(groupId??"household")+":"+(id??"");
 const {session}=useAuth(),userId=session?.user.id;
 const [data,setData]=useState<SharedPayload|null>(null),[dataUser,setDataUser]=useState<string|null>(null),[dataScope,setDataScope]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(true);
 const version=useRef(0),account=useRef(userId);
 useEffect(()=>{account.current=userId;},[userId]);
 const load=useCallback(async()=>{
  const run=++version.current;setBusy(true);
  try{
   if(invalidGroup)throw new ApiError("Choose an available expense group.",400);
   if(!userId)throw new ApiError("Sign in to view shared expenses.",401);
   const result=await fetchSharedExpenses({id,groupId,expectedUserId:userId});
   if(groupId&&result.groupId!==groupId)throw new ApiError("This group response could not be checked. Refresh Groups.",503);
   if(run!==version.current||account.current!==userId)return null;
   setData({...result,viewerId:userId});setDataUser(userId);setDataScope(scopeKey);setError(null);return result;
  }catch(e){if(run===version.current&&account.current===userId){if(e instanceof ApiError&&[401,403,404,409].includes(e.status))setData(null);setError(e instanceof ApiError?e.message:"Could not load shared expenses. Check your connection.");}return null;}
  finally{if(run===version.current)setBusy(false);}
 },[id,groupId,userId,invalidGroup,scopeKey]);
 useFocusEffect(useCallback(()=>{void load();return()=>{version.current++;};},[load]));
 const current=!invalidGroup&&dataScope===scopeKey&&dataUser===userId&&data?.groupId===groupId?data:null;
 return {data:current,setData,error,busy,load,groupId};
}

/** Reusable, dismissible editing sheet. Closing preserves the form's current choices. */
export function SharedSheet({title,visible,onClose,children,disabled=false}:{title:string;visible:boolean;onClose:()=>void;children:ReactNode;disabled?:boolean}){
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>{if(!disabled)onClose();}}>
  <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1,backgroundColor:"rgba(0,0,0,0.3)",justifyContent:"flex-end"}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Close without leaving expense" disabled={disabled} onPress={onClose} style={{flex:1}}/>
   <SafeAreaView edges={["bottom"]} style={{maxHeight:"85%",backgroundColor:colors.background,borderTopLeftRadius:24,borderTopRightRadius:24}}>
    <ScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:16}}>
     <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text accessibilityRole="header" style={[typography.title,{flex:1,color:colors.foreground}]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={disabled} onPress={onClose} style={{minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}}><Feather name="x" size={22} color={colors.foreground}/></Pressable></View>
     {children}
    </ScrollView>
   </SafeAreaView>
  </KeyboardAvoidingView>
 </Modal>;
}

export function PersonPicker({label,people,value,onChange,disabled=false}:{label:string;people:SharedPerson[];value:string;onChange:(id:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const selected=people.find(p=>p.id===value);
 return <View style={{gap:6}}>
  <Text style={[typography.meta,{fontWeight:"600",color:colors.mutedForeground}]}>{label}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label+": "+(selected?.name??"Choose a person")} disabled={disabled} onPress={()=>setOpen(true)} style={{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:radii.lg,padding:14,flexDirection:"row",gap:12,alignItems:"center",backgroundColor:colors.surfaceRaised}}>
   <Text style={[typography.body,{flex:1,color:colors.foreground}]}>{selected?selected.name+(selected.self?" (you)":""):"Choose a person"}</Text><Feather name="chevron-down" size={18} color={colors.mutedForeground}/>
  </Pressable>
  <Modal visible={open} transparent animationType="slide" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,backgroundColor:"rgba(0,0,0,0.3)",justifyContent:"flex-end"}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close people" onPress={()=>setOpen(false)} style={{flex:1}}/>
    <SafeAreaView edges={["bottom"]} style={{maxHeight:"75%",backgroundColor:colors.background,borderTopLeftRadius:24,borderTopRightRadius:24}}>
     <ScrollView accessibilityViewIsModal contentContainerStyle={{padding:20}}>
      <View style={{flexDirection:"row",alignItems:"center"}}><Text accessibilityRole="header" style={[typography.title,{color:colors.foreground,flex:1}]}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close people" onPress={()=>setOpen(false)} style={{padding:12}}><Feather name="x" size={22} color={colors.foreground}/></Pressable></View>
      {people.map(p=><Pressable key={p.id} accessibilityRole="radio" accessibilityState={{checked:p.id===value}} onPress={()=>{onChange(p.id);setOpen(false);}} style={{minHeight:56,paddingVertical:14,borderBottomWidth:1,borderColor:colors.border,flexDirection:"row",gap:12,alignItems:"center"}}>
       <View style={{flex:1,gap:3}}><Text style={[typography.body,{color:colors.foreground}]}>{p.name}{p.self?" (you)":""}</Text>{p.state==="former"?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Former participant</Text>:p.state==="local"?<Text style={[typography.meta,{color:colors.mutedForeground}]}>No app access</Text>:p.state==="invited"?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Invitation pending</Text>:null}</View>
       {p.id===value?<Feather name="check" size={20} color={colors.primary}/>:null}
      </Pressable>)}
     </ScrollView>
    </SafeAreaView>
   </View>
  </Modal>
 </View>;
}
export const sharedStyles={label:{...typography.meta,color:colors.mutedForeground},body:{...typography.body,color:colors.foreground},heading:{...typography.title,color:colors.foreground},row:{paddingVertical:spacing.lg,borderBottomWidth:1,borderBottomColor:colors.border}} as const;

import {useCallback,useState} from "react";
import {ActivityIndicator,ScrollView,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect} from "expo-router";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {QuietAction} from "@/components/Brief";
import {apiGet,apiPost,ApiError} from "@/lib/api";
import {openPublicLink} from "@/lib/public-links";
import {AI_SHARING_CONTROL,AI_SHARING_DESCRIPTION,AI_SHARING_TITLE,AI_SHARING_VERSION} from "@/lib/ai-sharing-policy";
import {colors,layout,spacing,typography} from "@/theme/tokens";
type Choice={allowed:boolean;version:string};
export default function AiPrivacy(){
 const {session}=useAuth(),userId=session?.user.id;
 const [choice,setChoice]=useState<Choice|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[reload,setReload]=useState(0);
 useFocusEffect(useCallback(()=>{let active=true;setChoice(null);setError(null);void apiGet<Choice>("/api/mobile/v1/account/ai-consent",{expectedUserId:userId,timeoutMs:15000}).then(c=>{if(active)setChoice(c);}).catch(()=>{if(active)setError("Could not check your AI privacy choice. Try again.");});return()=>{active=false;};},[userId,reload]));
 async function change(allowed:boolean){if(busy||!userId)return;setBusy(true);setError(null);try{setChoice(await apiPost<Choice>("/api/mobile/v1/account/ai-consent",{allowed,version:AI_SHARING_VERSION},{expectedUserId:userId,timeoutMs:15000}));}catch(e){setError(e instanceof ApiError?e.message:"Could not save your choice. Try again.");}finally{setBusy(false);}}
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.canvas}}>
  <ScreenNavigation title="AI privacy" fallback="/account-settings" disabled={busy}/>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:layout.screenHorizontal,paddingBottom:40,gap:spacing.xl}}>
   <View style={{gap:12}}><Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>{AI_SHARING_TITLE}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{AI_SHARING_DESCRIPTION}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>{AI_SHARING_CONTROL}</Text></View>
   <View style={{padding:20,gap:12,borderRadius:20,backgroundColor:colors.surfaceRaised}}>
    {!choice&&!error?<ActivityIndicator color={colors.primary}/>:null}
    {choice?<><Text accessibilityLiveRegion="polite" style={[typography.section,{color:colors.foreground}]}>{choice.allowed?"AI assistance is allowed":"AI assistance is off"}</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>This choice applies to your Rezlee account across devices. Turning it off also pauses Gmail AI imports. Processing already in progress may finish.</Text><Button label={choice.allowed?"Turn off AI assistance":"Allow AI assistance"} variant={choice.allowed?"secondary":"primary"} loading={busy} onPress={()=>void change(!choice.allowed)}/></>:null}
    {error?<><Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text><Button label="Check again" variant="secondary" onPress={()=>setReload(v=>v+1)}/></>:null}
   </View>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>Changing this choice does not delete saved answers or records. If you turn AI back on, resume Gmail separately when you want it to continue. AI can make mistakes; check important details against your originals.</Text>
   <QuietAction label="Read the privacy policy" onPress={()=>void openPublicLink("privacy")}/>
  </ScrollView>
 </SafeAreaView>;
}

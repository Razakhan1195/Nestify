import { useTheme } from "@/theme/useTheme";
import {useIsFocused} from "expo-router/react-navigation";
import {useEffect,useRef,useState} from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import {SafeAreaView} from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import {useAuth} from "@/auth/AuthProvider";
import {Button} from "./Button";
import {apiPost} from "@/lib/api";
import {acknowledgeProWelcome} from "@/lib/membership";
import {useMembershipState} from "@/lib/use-membership";
import {ProWelcomeContent} from "./ProWelcome";
import {nextWelcomeStep,canAcknowledgeWelcome,welcomeAllowsNextTask,type WelcomeStep} from "@/lib/welcome-flow";
import { spacing, typography } from "@/theme/tokens";
export function FounderMessage(){
  const { colors } = useTheme();
return <View style={{gap:spacing.lg}}>
 <Text style={[typography.label,{color:colors.primary}]}>A note from our founder</Text>
 <Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>Built in Canada.{"\n"}Shaped by you.</Text>
 <Text style={[typography.body,{color:colors.foreground}]}>Home comes with a lot to keep track of. We’re building Rezlee to take some of that weight off your shoulders—with useful technology that helps you spend less time on life admin.</Text>
 <Text style={[typography.body,{color:colors.foreground}]}>We’re a small Canadian team, and this is our first public release. Some things may need another pass, especially connections to outside providers.</Text>
 <Text style={[typography.body,{color:colors.foreground}]}>We wanted to build alongside the people using Rezlee. If something feels confusing, doesn’t work, or could be better, tell us. Your feedback will help shape what we improve next.</Text>
 <Text style={[typography.body,{color:colors.foreground}]}>Thank you for being here at the beginning.</Text>
 <Text style={[typography.section,{color:colors.primary}]}>Raza, founder of Rezlee</Text>
 </View>;}
export function FounderWelcome({onReady}:{onReady?:(userId:string)=>void}){
 const {session}=useAuth();
 const focused=useIsFocused();
 return focused&&session?.user.id?<AccountWelcome key={session.user.id} userId={session.user.id} onReady={onReady}/>:null;
}
function AccountWelcome({userId,onReady}:{userId:string;onReady?:(userId:string)=>void}){
  const { colors } = useTheme();

 const focused=useIsFocused();
 const membershipState=useMembershipState(),data=membershipState.data,m=data?.membership;
 const [local,setLocal]=useState<{pro:boolean;founder:boolean}|null>(null);
 const [postponed,setPostponed]=useState(false);
 const [shown,setShown]=useState(false);
 const shownRef=useRef(false),stepRef=useRef<WelcomeStep|null>(null);
 useEffect(()=>{let active=true;
  Promise.all([SecureStore.getItemAsync("rezlee-pro-welcome-v2-"+userId),SecureStore.getItemAsync("rezlee-founder-v2-"+userId)])
   .then(([pro,founder])=>{if(active)setLocal({pro:!!pro,founder:!!founder});})
   .catch(()=>{if(active)setLocal({pro:false,founder:false});});
  return()=>{active=false;};
 },[userId]);
 const step=m&&local?nextWelcomeStep(m,local):null;
 useEffect(()=>{stepRef.current=step;},[step]);
 const visible=Boolean(focused&&data?.enabled&&step&&!postponed);
 const settled=membershipState.settled&&(!m||local!==null);
 useEffect(()=>{if(focused&&welcomeAllowsNextTask(settled,step,postponed,Platform.OS==="ios"&&shown))onReady?.(userId);},[focused,settled,step,postponed,shown,onReady,userId]);
 function postpone(){shownRef.current=false;setPostponed(true);}
 function complete(expected:WelcomeStep){
  if(!canAcknowledgeWelcome(shownRef.current,focused,stepRef.current,expected)||!local)return;
  // Lock immediately: a second tap must not acknowledge the next page.
  stepRef.current=null;
  setLocal({...local,[expected]:true});
  const request=expected==="pro"?acknowledgeProWelcome(userId):apiPost("/api/mobile/v1/membership",{action:"seen"},{expectedUserId:userId,timeoutMs:10000});
  // Persist only successful acknowledgements; failed saves retry next session.
  void request.then(()=>SecureStore.setItemAsync("rezlee-"+(expected==="pro"?"pro-welcome":"founder")+"-v2-"+userId,"seen")).catch(()=>{});
 }
 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen"
  onShow={()=>{shownRef.current=true;setShown(true);}}
  onDismiss={()=>{shownRef.current=false;setShown(false);}}
  onRequestClose={postpone}>
  <SafeAreaView style={{flex:1,backgroundColor:colors.canvas}}>
   <ScrollView key={step} contentContainerStyle={{padding:24,gap:24,maxWidth:520,width:"100%",alignSelf:"center"}}>
    {step==="pro"&&m?<ProWelcomeContent membership={m}/>:<FounderMessage/>}
    <Button disabled={!shown} label={step==="pro"?"Continue":"Make yourself at home"} onPress={()=>{if(step)complete(step);}}/>
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}

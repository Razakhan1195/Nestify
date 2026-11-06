import { RezleeLoading } from "@/components/RezleeLoading";
import { Feather } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { ProviderBrand } from "@/components/ProviderBrand";
import { Button } from "@/components/Button";
import { finishQuickGuide } from "@/lib/quick-guide";
import { colors, editorialType, typography } from "@/theme/tokens";

const pages = [
 { title: "Bring your bills together.", detail: "Connect a supported provider or upload a statement. Review the details, then save.", label: "ADD A BILL", note: "Connections are optional. Your bills live in Bills." },
 { title: "Share it. Settle it.", detail: "Create a group, add your people and choose who paid. Check each share before saving.", label: "SPLIT AN EXPENSE", note: "Recording a repayment updates balances; it doesn’t move money." },
 { title: "Keep it. Find it.", detail: "Add a receipt or warranty, check the details and save it to Vault.", label: "SAVE A RECORD", note: "Keep an original when you have one, or save just the useful details." },
];
function GuideVisual({ step, compact }: { step:number; compact:boolean }) {
 const {fontScale}=useWindowDimensions();
 const text = { ...typography.meta, color: colors.foreground };
 return <View style={{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:24,padding:compact?16:22,gap:14}}>
 <Text style={[typography.label,{color:colors.primary}]}>{pages[step].label} · EXAMPLE</Text>
 {step===0 ? <>
  <View style={{flexDirection:fontScale>1.3?"column":"row",alignItems:"center",justifyContent:"space-between",gap:12}}><ProviderBrand provider="Enbridge" category="gas" compact identity/><Feather name="arrow-right" size={20} color={colors.primary}/><Text style={text}>Review bill</Text></View>
  <View style={{backgroundColor:colors.surfaceSubtle,borderRadius:14,padding:14,gap:8}}><Text style={text}>Connect provider  ·  or upload statement</Text><Text style={[typography.section,{color:colors.primary}]}>Gas bill · $74.20</Text><Text style={text}>Check amount → Save to Bills</Text></View>
 </> : step===1 ? <>
  <View style={{flexDirection:"row",alignItems:"center",gap:10}}><Feather name="users" size={24} color={colors.primary}/><Text style={[typography.section,{color:colors.foreground}]}>Our place</Text></View>
  <Text style={text}>Groceries · Alex paid $90.00</Text>
  <View style={{backgroundColor:colors.surfaceSubtle,borderRadius:14,padding:14,gap:8}}>{["Alex","Sam","Jordan"].map(name=><View key={name} style={{flexDirection:"row",justifyContent:"space-between"}}><Text style={text}>{name}</Text><Text style={[text,{fontWeight:"600"}]}>$30.00</Text></View>)}</View>
 </> : <>
  <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Feather name="file-text" size={28} color={colors.primary}/><View style={{flex:1,gap:4}}><Text style={[typography.section,{color:colors.foreground}]}>Washing machine receipt</Text><Text style={text}>Upload → Review → Save</Text></View></View>
  <View style={{backgroundColor:colors.surfaceSubtle,borderRadius:14,padding:14,gap:8}}><Text style={text}>Vault / Records</Text><Text style={[typography.body,{color:colors.primary,fontWeight:"600"}]}>Receipt saved · Original attached</Text><Text style={text}>Search by title whenever you need it.</Text></View>
 </>}
 </View>;
}
export default function QuickGuide() {
 const {session,isLoading}=useAuth(), router=useRouter();
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false), scroll=useRef<ScrollView>(null);
 const {height,fontScale}=useWindowDimensions(), compact=height<740&&fontScale<=1.2;
 if(isLoading)return <RezleeLoading/>;if(!session)return <Redirect href="/(auth)/welcome"/>;
 const userId=session.user.id,page=pages[step];
 async function done(){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await finishQuickGuide(userId);router.replace("/(tabs)/home");}catch{setError("Couldn’t save this preference. You can still continue to Home.");}finally{lock.current=false;setBusy(false);}}
 function changeStep(next:number){setStep(next);scroll.current?.scrollTo({y:0,animated:false});}
 return <SafeAreaView key={fontScale} style={{flex:1,backgroundColor:colors.background}}>
 <AmbientBackdrop/>
 <View style={{paddingHorizontal:24,flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
 <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={busy} onPress={()=>step>0?changeStep(step-1):router.canGoBack()?router.back():void done()} style={{minWidth:44,minHeight:44,justifyContent:"center"}}><Feather name="arrow-left" size={22} color={colors.primary}/></Pressable>
 <View accessible accessibilityLabel={`Guide step ${step+1} of 3`} style={{flexDirection:"row",gap:6}}>{pages.map((_,i)=><View key={i} style={{width:i===step?20:6,height:6,borderRadius:3,backgroundColor:i===step?colors.primary:colors.border}}/>)}</View>
 <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void done()} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>{fontScale>1.3?"Skip":"Skip guide"}</Text></Pressable>
 </View>
 <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{paddingHorizontal:24,paddingVertical:compact?12:24,gap:compact?14:22,maxWidth:520,width:"100%",alignSelf:"center"}}>
 <Text accessibilityRole="header" style={[editorialType,{fontSize:fontScale>1.3?24:compact?30:36,lineHeight:fontScale>1.3?30:compact?36:42,color:colors.foreground}]}>{page.title}</Text>
 <Text style={[typography.body,{color:colors.mutedForeground}]}>{page.detail}</Text>
 <GuideVisual step={step} compact={compact}/>
 <Text style={[typography.meta,{color:colors.mutedForeground}]}>{page.note}</Text>
 {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
 </ScrollView>
 <View style={{paddingHorizontal:24,paddingTop:12,paddingBottom:12,maxWidth:520,width:"100%",alignSelf:"center",gap:8}}>
 <Button label={error?"Continue to Home":step===2?"Get started":"Next"} loading={busy} onPress={()=>error?router.replace("/(tabs)/home"):step===2?void done():changeStep(step+1)}/>
 </View>
 </SafeAreaView>;
}

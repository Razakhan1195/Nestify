import { useEffect,useState } from "react";
import { useLocalSearchParams,useRouter } from "expo-router";
import { ActivityIndicator,Text,View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { finishGmailConnection } from "@/lib/gmail-connection";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Button } from "@/components/Button";
import { colors,spacing,typography } from "@/theme/tokens";
export default function GmailReturn(){
 const params=useLocalSearchParams<{status:string;id:string;proof:string}>(),router=useRouter(),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;const q=new URLSearchParams({status:String(params.status??""),id:String(params.id??""),proof:String(params.proof??"")});
 void finishGmailConnection("rezlee://gmail-return?"+q).then(()=>{if(active)router.replace("/gmail-memory");}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not finish connection.");});return()=>{active=false;};},[params.id,params.proof,params.status,router]);
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background,padding:spacing.xl}}><ScreenNavigation title="Connect Gmail" fallback="/gmail-memory"/>
 <View style={{gap:spacing.lg}}>{error?<><Text style={[typography.body,{color:colors.foreground}]}>{error}</Text><Button label="Return to email settings" onPress={()=>router.replace("/gmail-memory")}/></>:<><ActivityIndicator color={colors.primary}/><Text style={typography.body}>Finishing your secure connection…</Text></>}</View></SafeAreaView>;
}

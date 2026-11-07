import { useTheme } from "@/theme/useTheme";
import { RezleeLoading } from "@/components/RezleeLoading";
import {FormScrollView} from "@/components/FormScrollView";
import {useRef,useState} from "react";
import {Redirect,useRouter} from "expo-router";
import {Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {apiPost,ApiError} from "@/lib/api";
import { typography } from "@/theme/tokens";
export default function ClaimMembership(){const {session,isLoading}=useAuth();if(isLoading)return <RezleeLoading/>;if(!session)return <Redirect href="/(auth)/login"/>;return <Claim key={session.user.id} userId={session.user.id}/>;}
function Claim({userId}:{userId:string}){
  const { colors } = useTheme();

 const router=useRouter(),lock=useRef(false);
 const [email,setEmail]=useState(""),[code,setCode]=useState(""),[id,setId]=useState<string|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(confirm:boolean){
 if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
 try{
 const r=await apiPost<{id?:string;claimed?:boolean;message?:string}>("/api/mobile/v1/membership/waitlist",confirm?{action:"confirm",id,code}:{action:"request",email},{expectedUserId:userId,timeoutMs:20000});
 if(r.claimed){router.replace("/membership");return;}
 if(r.id){setId(r.id);setCode("");}setMessage(r.message??"Check your inbox.");
 }catch(e){setMessage(e instanceof ApiError?e.message:"Could not verify your reservation. Try again.");}
 finally{lock.current=false;setBusy(false);}
 }
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}><ScreenNavigation title="Founding membership" fallback="/membership"/><FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,paddingBottom:40,gap:24}}>
 <Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>Your early support{"\n"}still counts.</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>Used a different email for the waitlist? Verify that inbox to link your reserved lifetime Pro membership. This also works if you signed in with Apple Hide My Email.</Text>
 <TextField label="Waitlist email" value={email} onChangeText={setEmail} editable={!busy&&!id} keyboardType="email-address" autoCapitalize="none"/>
 {!id?<Button label="Send verification code" loading={busy} disabled={!email.includes("@")} onPress={()=>void submit(false)}/>:<View style={{gap:16}}><TextField label="Six-digit code" value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" editable={!busy}/><Button label="Verify my membership" loading={busy} disabled={!/^\d{6}$/.test(code)} onPress={()=>void submit(true)}/><Button label="Use a different email or request a new code" variant="secondary" disabled={busy} onPress={()=>{setId(null);setCode("");}}/></View>}
 {message?<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.foreground}]}>{message}</Text>:null}<Text style={[typography.meta,{color:colors.mutedForeground}]}>The code expires in 10 minutes. Never send it to support. Verifying this inbox won’t change your sign-in email or marketing preferences.</Text>
 </FormScrollView></SafeAreaView>;
}

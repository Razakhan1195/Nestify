import { useTheme } from "@/theme/useTheme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { loadMembership } from "@/lib/membership";
import { giftReceiptState, type GiftReceipt } from "@/lib/gift-presentation";
import { useAuth } from "@/auth/AuthProvider";
import { SignupFrame } from "@/components/SignupFrame";
import { Button } from "@/components/Button";
import { SetupAccount } from "@/components/SetupAccount";
import { useAccountSwitch } from "@/auth/useAccountSwitch";
import { apiPost } from "@/lib/api";
import { clearGiftInvitation, readGiftInvitation, saveGiftInvitation, validGiftCode } from "@/lib/gift-invitation";
import { typography } from "@/theme/tokens";
type Receipt=GiftReceipt;
export default function GiftScreen(){
 const {session}=useAuth();const params=useLocalSearchParams<{code?:string}>();
 return <GiftContent key={(session?.user.id??"signed-out")+":"+(params.code??"saved")} incomingCode={params.code}/>;
}
function GiftContent({incomingCode}:{incomingCode?:string}){
  const { colors } = useTheme();

 const {session}=useAuth();const userId=session?.user.id;const router=useRouter();const account=useAccountSwitch();
 const [clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{const subscription=AppState.addEventListener("change",state=>{if(state==="active")setClock(Date.now());});return()=>subscription.remove();},[]);
 const [code,setCode]=useState<string|null>(null),[receipt,setReceipt]=useState<Receipt|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0);
 const giftState=giftReceiptState(receipt,clock);
 useEffect(()=>{if(!receipt)return;const wait=Date.parse(receipt.expires_at)-Date.now();if(wait<=0||!Number.isFinite(wait))return;const timer=setTimeout(()=>setClock(Date.now()),Math.min(wait+10,2147483647));return()=>clearTimeout(timer);},[receipt,clock]);
 useEffect(()=>{let active=true;void(async()=>{try{
  if(incomingCode){if(!validGiftCode(incomingCode))throw Error("Check your invitation link.");await saveGiftInvitation(incomingCode);}
  const saved=await readGiftInvitation();if(!saved)throw Error("Open the invitation your realtor shared.");if(!active)return;setCode(saved);
  if(userId){const r=await apiPost<{receipt:Receipt}>("/api/mobile/v1/gifts/claim",{code:saved},{timeoutMs:15000,expectedUserId:userId});if(active){setReceipt(r.receipt);setClock(Date.now());}await loadMembership(userId,true).catch(()=>{if(active)setError("Your gift was confirmed. Membership details couldn’t refresh yet; open Your membership to check again.");});}
 }catch(e){if(active)setError(e instanceof Error?e.message:"Couldn’t confirm your gift. Retry with the same invitation.");}finally{if(active)setBusy(false);}})();return()=>{active=false;};},[incomingCode,userId,attempt]);
 async function leave(destination:"/"|"/membership"="/"){try{await clearGiftInvitation();router.replace(destination);}catch{setError("Couldn’t clear the saved invitation. Please try again.");}}
 return <SignupFrame stage="confirm" busy={busy} onBack={()=>void leave()} title={giftState==="expired"?"Your gift year has ended.":giftState==="unavailable"?"Let’s check your membership.":receipt?"A year of more help.":"A thoughtful welcome home."} detail={receipt?`A gift from ${receipt.realtorName}.`:"Your realtor’s gift includes 365 days of Rezlee Pro. No card. No automatic renewal."}>
 {receipt?<View style={{backgroundColor:colors.surfaceSubtle,padding:24,borderRadius:24,gap:14}}><Text style={[typography.section,{color:colors.primary}]}>{giftState==="active"?"Your gift is active":giftState==="expired"?"Gift completed":"Gift unavailable"}</Text><Text style={[typography.body,{color:colors.foreground}]}>{giftState==="unavailable"?"We couldn’t verify this gift’s dates. Open Your membership to check your current access.":`${giftState==="active"?"Rezlee Pro through ":"This gift ended on "}${new Date(receipt.expires_at).toLocaleDateString("en-CA",{year:"numeric",month:"long",day:"numeric"})}.`}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>Your realtor cannot see your bills, records or household activity. {giftState==="active"?"When your gift ends, your account returns to Free unless you choose another membership.":"Your saved records remain available. Check Your membership for your current access."}</Text></View>:null}
 {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
 {!session?<><Text style={[typography.body,{color:colors.mutedForeground}]}>Use the email address your realtor invited. After verification, we’ll link your gift automatically.</Text><Button label="Create my account" disabled={!code} onPress={()=>router.push("/(auth)/signup")}/><Button label="I already have an account" variant="secondary" disabled={!code} onPress={()=>router.push("/(auth)/login")}/></>:receipt?<Button label={giftState==="active"?"Explore my Rezlee":"View my membership"} onPress={()=>void leave(giftState==="active"?"/":"/membership")}/>:<><Button label={busy?"Linking your gift…":"Try again"} loading={busy} disabled={busy} onPress={()=>{setBusy(true);setError("");setAttempt(n=>n+1);}}/><SetupAccount email={session.user.email} busy={account.busy} error={account.error} disabled={busy} onSwitch={()=>void account.switchAccount()}/></>}
 {!receipt ? <Button label="Continue without this gift" variant="secondary" disabled={busy} onPress={()=>void leave()}/> : null}
 </SignupFrame>;
}

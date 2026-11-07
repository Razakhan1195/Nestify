import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {useEffect,useRef,useState} from "react";
import {useLocalSearchParams,useRouter} from "expo-router";
import {Text,View} from "react-native";
import {useAuth} from "@/auth/AuthProvider";
import {useAccountSwitch} from "@/auth/useAccountSwitch";
import {SetupAccount} from "@/components/SetupAccount";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {QuietAction} from "@/components/Brief";
import {Surface} from "@/components/ui/Surface";
import {SharedFrame,SharedLoading,SharedNotice,getSharedStyles} from "@/components/SharedExpenseUI";
import {acceptExpenseGroup,fetchGroupInvitation,type GroupInvitation} from "@/lib/expense-groups";
import {clearIncomingGroupInvite,groupInviteCode,readIncomingGroupInvite,saveIncomingGroupInvite} from "@/lib/expense-group-invites";
import {ApiError} from "@/lib/api";

export default function JoinGroup(){
 const {session,isLoading}=useAuth();
 const {code}=useLocalSearchParams<{code?:string}>();
 if(isLoading)return <SharedFrame title="Join expense group"><SharedLoading/></SharedFrame>;
 return <AccountJoin key={session?.user.id??"signed-out"} userId={session?.user.id} email={session?.user.email} incoming={typeof code==="string"?code:undefined}/>;
}
function AccountJoin({userId,email,incoming}:{userId?:string;email?:string;incoming?:string}){
 const { colors, premium } = useTheme();
 const s = useThemeMemo(() => getSharedStyles(colors), [colors, premium]);

 const router=useRouter(),account=useAccountSwitch(),alive=useRef(true),lock=useRef(false);
 const [input,setInput]=useState(incoming??""),[selected,setSelected]=useState<string|null>(null),[previewResult,setPreviewResult]=useState<{key:string;value:GroupInvitation|null;error:string|null}|null>(null);
 const [initializing,setInitializing]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const previewKey=selected&&userId?userId+":"+selected+":"+attempt:null;
 const preview=previewResult?.key===previewKey?previewResult?.value:null;
 const invitationError=previewResult?.key===previewKey?previewResult?.error:null;
 const loading=initializing||Boolean(previewKey&&previewResult?.key!==previewKey);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;void(async()=>{
  try{
   const value=incoming?groupInviteCode(incoming):await readIncomingGroupInvite();
   if(incoming&&!value)throw Error("Check the invitation link or code.");
   if(value)await saveIncomingGroupInvite(value);
   if(active){if(value)setInput(value);setSelected(value);setError(null);}
  }catch{if(active)setError("Your invitation couldn’t be checked. Paste the link or code to try again.");}
  finally{if(active)setInitializing(false);}
 })();return()=>{active=false;};},[incoming]);
 useEffect(()=>{if(!selected||!userId||!previewKey)return;let active=true;
 void fetchGroupInvitation(selected,userId)
  .then(value=>{if(active)setPreviewResult({key:previewKey,value,error:null});})
  .catch(e=>{if(active)setPreviewResult({key:previewKey,value:null,error:e instanceof ApiError?e.message:"Could not check the invitation. Try again."});});
 return()=>{active=false;};},[selected,userId,previewKey]);
 async function review(){
  const code=groupInviteCode(input);if(!code){setError("Paste the invitation link or the full invitation code.");return;}
  try{await saveIncomingGroupInvite(code);if(!alive.current)return;setError(null);setSelected(code);setAttempt(v=>v+1);if(!userId)router.push("/(auth)/login");}
  catch{if(alive.current)setError("Your invitation couldn’t be saved. Try again before signing in.");}
 }
 async function join(){
  if(!selected||!userId||!preview||lock.current)return;lock.current=true;setSaving(true);setError(null);
  try{const result=preview.alreadyJoined?{groupId:preview.groupId}:await acceptExpenseGroup(selected,userId);await clearIncomingGroupInvite().catch(()=>{});if(alive.current&&!account.switching.current)router.replace({pathname:"/shared",params:{groupId:result.groupId}});}
  catch(e){if(alive.current)setError(e instanceof ApiError?e.message:"Could not confirm that you joined. Try the same invitation again.");}
  finally{lock.current=false;if(alive.current)setSaving(false);}
 }
 return <SharedFrame title="Join expense group" fallback="/shared/groups" disabled={saving}>
  <Text accessibilityRole="header" style={s.heading}>Share the costs. Keep the rest private.</Text>
  <Text style={s.body}>Joining gives access to this group’s existing expenses, repayments, people and balances. It does not give access to Care, private bills or Vault.</Text>
  <TextField label="Invitation link or code" value={input} autoCapitalize="none" autoCorrect={false} onChangeText={value=>{setInput(value);setPreviewResult(null);setSelected(null);setError(null);}} editable={!saving} maxLength={500} placeholder="Paste your invitation"/>
  {!preview?<Button label={userId?"Review invitation":"Sign in to review invitation"} disabled={!input.trim()||saving||account.busy} onPress={()=>void review()}/>:null}
  {loading?<SharedLoading/>:null}
  {error||invitationError?<SharedNotice message={error??invitationError!} onRetry={()=>void review()} busy={loading}/>:null}
  {preview?<Surface tone="subtle" style={{gap:16}}><Text accessibilityRole="header" style={s.heading}>{preview.name}</Text><Text style={s.label}>{preview.peopleCount} {preview.peopleCount===1?"person":"people"} · Expenses only</Text><Text style={s.body}>{preview.alreadyJoined?"You’ve already joined. Your existing expenses and balance are kept.":preview.archived?"This group is archived. Ask its owner to restore it before joining.":"Your account will be connected to the participant named in this invitation, including their existing shared expense history and balance."}</Text><Button label={preview.alreadyJoined?"Open group":"Join expense group"} loading={saving} disabled={account.busy||(!preview.alreadyJoined&&preview.archived)} onPress={()=>void join()}/></Surface>:null}
  {userId?<View><SetupAccount email={email} busy={account.busy||saving} error={account.error} onSwitch={()=>{if(!saving)void account.switchAccount();}}/></View>:<Text style={s.label}>Use the verified email account this invitation was addressed to.</Text>}
  <QuietAction label="Dismiss invitation" onPress={()=>{if(!saving)void clearIncomingGroupInvite().then(()=>router.replace(userId?"/shared/groups":"/")).catch(()=>setError("Could not dismiss the invitation. Try again."));}}/>
 </SharedFrame>;
}

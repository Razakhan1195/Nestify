import { useTheme } from "@/theme/useTheme";
import {FormScrollView} from "@/components/FormScrollView";
import { useAuth } from "@/auth/AuthProvider";
import { ConnectionIntroduction } from "@/components/ConnectionIntroduction";
import { QuietAction } from "@/components/Brief";
import { gmailPauseMessage,type ImportAllowance } from "@/lib/gmail-progress";
import { useCallback,useRef,useState } from "react";
import { useFocusEffect,useRouter } from "expo-router";
import { ActivityIndicator,Alert,AppState,Linking,Pressable,Text,View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiGet,apiPost,ApiError } from "@/lib/api";
import { connectGmail } from "@/lib/gmail-connection";
import { openPublicLink } from "@/lib/public-links";
import { safeBack } from "@/lib/navigation";
import { spacing, typography, layout } from "@/theme/tokens";
const endpoint="/api/mobile/v1/gmail-memory";
const categories=[["utility_bill","Bills"],["service_invoice","Service invoices"],["receipt","Home purchases"],["warranty","Warranties"]] as const;
type Work={phase:string;processed:number;proposed:number;ignored:number;failed:number;count:number;capReached:boolean;after:number;before:number;mode:string};
type Data={progress?:{state:string;label:string};importAllowance?:ImportAllowance|null;enabled:boolean;homeId:string;homeName:string;scheduleReady:boolean;pendingCount:number;suggestions:{id:string;title:string;category:string;detail?:string}[];link:null|{id:string;email:string;status:string;ongoing:boolean;categories:string[];excluded_senders:string[];work:Work;error_code:string|null;updated_at:string}};
export default function GmailMemoryScreen(){
 const {session}=useAuth();
 return <GmailMemory key={session?.user.id??"signed-out"}/>;
}
function GmailMemory(){
  const { colors } = useTheme();

 const router=useRouter(),[data,setData]=useState<Data|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const [checkedAt,setCheckedAt]=useState(()=>Date.now());
 const [details,setDetails]=useState(false),[settings,setSettings]=useState(false),[selected,setSelected]=useState<string[]>(categories.map(c=>c[0])),[excluded,setExcluded]=useState("");
 const active=useRef(false),dataRef=useRef<Data|null>(null),lock=useRef(false),capacityCheck=useRef(0);
 const message=(e:unknown)=>e instanceof ApiError||e instanceof Error?e.message:"Could not connect. Try again.";
 const load=useCallback(async()=>{
  const next=await apiGet<Data>(endpoint,{timeoutMs:15000});if(!active.current)return;
  setData(next);setCheckedAt(Date.now());dataRef.current=next;setError(null);
 },[]);
 useFocusEffect(useCallback(()=>{
  active.current=true;void load().catch(e=>{if(active.current)setError(message(e));});
  const timer=setInterval(()=>{
   const link=dataRef.current?.link;if(!active.current||AppState.currentState!=="active")return;
   const reading=link?.status==="active"&&link.work.phase!=="complete";
   const capacity=link?.status==="paused"&&link.error_code==="capacity"&&Date.now()-capacityCheck.current>=60000;
   if(reading||capacity){if(capacity)capacityCheck.current=Date.now();void load().catch(e=>{if(active.current)setError(message(e));});}
  },5000);
  return()=>{active.current=false;clearInterval(timer);};
 },[load]));
 const action=async(body:Record<string,unknown>)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);setNotice(null);
  try{const result=await apiPost<{revoked?:boolean}>(endpoint,body,{timeoutMs:20000});
   if(!active.current)return;
   if(body.action==="disconnect")setNotice(result.revoked?"Gmail disconnected. Your saved records are still in Rezlee.":"Importing stopped and stored credentials were removed. Google’s revocation could not be confirmed; remove Rezlee access in your Google account too.");
   await load();
  }catch(e){if(active.current)setError(message(e));}finally{lock.current=false;if(active.current)setBusy(false);}
 };
 const connect=async()=>{
  if(!data||!data.enabled||lock.current)return;lock.current=true;setBusy(true);setError(null);setNotice(null);
  try{const connectionCategories=data.link?.status==="reconnect"?data.link.categories:selected;const done=await connectGmail(data.homeId,connectionCategories);if(!active.current)return;if(!done)setNotice("Connection cancelled. You can keep using Rezlee without Gmail.");await load();}
  catch(e){if(active.current)setError(message(e));}finally{lock.current=false;if(active.current)setBusy(false);}
 };
 const confirm=(title:string,body:string,work:()=>void)=>Alert.alert(title,body,[{text:"Cancel",style:"cancel"},{text:"Continue",onPress:work}]);
 const link=data?.link,w=link?.work;
 const checkbox=(id:string,label:string)=><Pressable key={id} accessibilityRole="checkbox" aria-checked={selected.includes(id)} accessibilityState={{checked:selected.includes(id)}} disabled={busy} onPress={()=>setSelected(old=>old.includes(id)?old.filter(c=>c!==id):[...old,id])} style={{flexDirection:"row",alignItems:"center",gap:spacing.md,minHeight:48,paddingVertical:spacing.sm}}>
 <Feather name={selected.includes(id)?"check-square":"square"} size={22} color={colors.primary}/><Text style={[typography.body,{color:colors.foreground}]}>{label}</Text></Pressable>;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
 <ScreenNavigation title="Import from email" fallback="/(tabs)/vault"/>
 <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:layout.screenHorizontal,gap:spacing.xl,paddingBottom:spacing["4xl"]}}>
 {error?<Surface tone="subtle" style={{gap:spacing.md}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><Button label="Try again" variant="secondary" disabled={busy} onPress={()=>void load().catch(e=>setError(message(e)))}/></Surface>:null}
 {notice?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>{notice}</Text>:null}
 {!data&&!error?<ActivityIndicator color={colors.primary}/>:null}
 {data&&!link||link?.status==="disconnected"?<>
 <View style={{flexDirection:"row",alignItems:"center",gap:spacing.sm}}><Feather name="mail" size={21} color={colors.primary}/><Text style={[typography.meta,{color:colors.primary}]}>Gmail · Optional connection</Text></View>
 <ConnectionIntroduction
  title="Find the paperwork worth keeping"
  description={`Find bills, receipts and warranties for ${data?.homeName||"your home"}. You decide what belongs in Bills or Vault.`}
  steps={[
   {title:"Choose your Gmail account",detail:"Choose the inbox with your home paperwork. This permission is separate from your Rezlee sign-in."},
   {title:"Review what Rezlee finds",detail:"We search the last 30 days, up to 500 matching emails. Once connected, you can leave while we look."},
  ]}
  access="Google grants read-only access to your mailbox. Rezlee searches the home categories you choose. It cannot send or delete your email."
  accessNote="You choose what to save. You can disconnect Gmail in connection settings; previously saved records stay."
 />
 <View style={{gap:spacing.sm}}>
 <Text style={[typography.meta,{color:colors.mutedForeground}]}>Looking for: {categories.filter(([id])=>selected.includes(id)).map(([,label])=>label.toLowerCase()).join(", ")||"Choose at least one category"}.</Text>
 <QuietAction label={settings?"Hide category choices":"Choose what Rezlee looks for"} onPress={()=>setSettings(v=>!v)}/>
 {settings?<View>{categories.map(([id,label])=>checkbox(id,label))}</View>:null}
 </View>
 {!data?.enabled?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Gmail connection isn’t available right now. You can upload your documents below.</Text>:null}
 <View style={{gap:spacing.sm}}>
 <Text style={[typography.caption,{color:colors.mutedForeground}]}>Selected email text and supported attachments are processed by Rezlee and its AI providers to suggest records. No-training and zero-retention routing are required for Gmail extraction. You review what to save.</Text>
 <Pressable accessibilityRole="link" accessibilityLabel="Rezlee privacy policy, opens website" onPress={()=>void openPublicLink("privacy")} style={{minHeight:44,justifyContent:"center"}}><Text style={[typography.meta,{color:colors.primary,textDecorationLine:"underline"}]}>Read the privacy policy</Text></Pressable>
 </View>
 <Button label={busy?"Connecting…":"Continue with Google"} disabled={busy||!data?.enabled||!selected.length} onPress={()=>void connect()}/>
 <QuietAction label="Not now" onPress={()=>safeBack(router,"/(tabs)/vault")}/>
 </>:link&&w?<>
 <Surface tone="subtle" style={{gap:spacing.md}}><View style={{flexDirection:"row",gap:spacing.md,alignItems:"center"}}><Feather name="mail" size={24} color={colors.primary}/><View style={{flex:1}}><Text style={[typography.body,{fontWeight:"600",color:colors.foreground}]}>{link.email}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{data?.homeName} · {link.status==="active"?"Connected":link.status==="reconnect"?"Reconnect needed":"Paused"}</Text></View></View>
 <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{w.phase==="complete"?"Search complete":link.status==="paused"?"Your progress is saved":link.status==="reconnect"?"Reconnect to continue":"Looking for home records"}</Text>
 <Text style={[typography.caption,{color:colors.mutedForeground}]}>{w.processed} {w.processed===1?"email":"emails"} checked{w.failed?" · "+w.failed+" couldn’t be read":""}. {w.phase!=="complete"&&link.status==="active"?"You can leave this screen while we continue.":"Saved records stay in Bills and Vault."}</Text>
 {link.status==="active"&&w.phase!=="complete"?<>{data?.progress?.state==="waiting"||data?.progress?.state==="queued"?<Feather name="clock" size={20} color={colors.mutedForeground}/>:<ActivityIndicator color={colors.primary}/>}<Text style={[typography.caption,{color:colors.mutedForeground}]}>{data?.progress?.label??"Checking saved progress. Your ready records are below."}</Text></>:null}
 {link.error_code?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>{gmailPauseMessage(link.error_code,data?.importAllowance,checkedAt)}</Text>:null}
 {link.error_code==="capacity"&&data?.importAllowance?.dailyLimit?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Email reads: {data.importAllowance.dailyUsed} of {data.importAllowance.dailyLimit} in 24 hours · {data.importAllowance.monthlyUsed} of {data.importAllowance.monthlyLimit} in 30 days. This allowance is separate from Ask Rezlee.</Text>:null}
 {link.status==="reconnect"?<><Text style={[typography.meta,{color:colors.mutedForeground}]}>Google will ask you to approve access again. Choose {link.email} to continue this search. Your saved records and search categories stay; your Rezlee sign-in won’t change.</Text><Button label="Reconnect Gmail" disabled={busy||!data?.enabled} onPress={()=>void connect()}/></>:link.status==="paused"&&w.phase!=="complete"?<Button label={link.error_code==="reader_unavailable"?"Reading temporarily unavailable":"Resume search"} disabled={busy||link.error_code==="reader_unavailable"||(link.error_code==="capacity"&&data?.importAllowance?.allowed===false&&!!data.importAllowance.retryAt&&Date.parse(data.importAllowance.retryAt)>checkedAt)} onPress={()=>void action({action:"resume"})}/>:w.phase!=="complete"?<Button label="Pause search" variant="secondary" disabled={busy} onPress={()=>void action({action:"pause"})}/>:null}
 </Surface>
 {(data?.suggestions??[]).length?<View style={{gap:spacing.sm}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Ready to save · {data?.pendingCount}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>Check the details, then choose what to keep. Nothing is saved without you.</Text>{data?.suggestions.map(item=><Pressable key={item.id} accessibilityRole="button" onPress={()=>router.push({pathname:"/email-memory",params:{id:item.id}})} style={({pressed})=>({minHeight:80,padding:spacing.lg,marginTop:spacing.sm,backgroundColor:colors.surfaceRaised,borderRadius:16,flexDirection:"row",alignItems:"center",gap:spacing.md,opacity:pressed?0.7:1})}><Feather name={item.category==="receipt"?"shopping-bag":item.category==="warranty"?"shield":item.category==="service_invoice"?"tool":"file-text"} size={22} color={colors.primary}/><View style={{flex:1,gap:4}}><Text style={[typography.body,{color:colors.foreground}]}>{item.title}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{item.detail||categories.find(c=>c[0]===item.category)?.[1]||"Home record"}</Text></View><Feather name="chevron-right" size={20} color={colors.primary}/></Pressable>)}{(data?.pendingCount??0)>25?<Text style={[typography.caption,{color:colors.mutedForeground}]}>More records appear as you review these.</Text>:null}</View>:w.phase==="complete"?<Text style={[typography.body,{color:colors.mutedForeground}]}>{w.proposed?"No suggestions waiting for review. Your saved records are in Vault and Bills.":"No supported home records found in this search. You can upload a bill or receipt instead."}</Text>:null}
 {w.phase==="complete"?<View style={{gap:spacing.md}}><Button label="Check for new home emails" variant="secondary" disabled={busy||link.status==="reconnect"} onPress={()=>void action({action:"new"})}/><Button label="Find older home records" variant="secondary" disabled={busy||link.status==="reconnect"} onPress={()=>confirm("Search the previous 90 days?","Search the previous 90 days for the same home categories, up to 500 candidates. Only continue if those records belong to this home.",()=>void action({action:"older"}))}/></View>:null}
 {data?.scheduleReady&&w.proposed>0?<Surface tone="subtle" style={{gap:spacing.md}}><Text style={[typography.section,{color:colors.foreground}]}>Keep your home updated?</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>Look for new matching emails daily. New records still need your review.</Text><Button label={link.ongoing?"Turn off automatic updates":"Keep Rezlee updated"} variant="secondary" disabled={busy} onPress={()=>void action({action:"preferences",categories:link.categories,excludedSenders:link.excluded_senders,ongoing:!link.ongoing})}/></Surface>:null}
 <Button label="Connection settings" variant="secondary" onPress={()=>{setSettings(v=>!v);setSelected(link.categories);setExcluded(link.excluded_senders.join("\n"));}}/>
 {settings?<Surface tone="subtle" style={{gap:spacing.md}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>Search period: {new Date(w.after*1000).toLocaleDateString("en-CA")} – {new Date(w.before*1000).toLocaleDateString("en-CA")}{w.capReached?" · Search limit reached. Older records are available as another search.":""}</Text>{categories.map(([id,label])=>checkbox(id,label))}<TextField label="Ignore these senders (one email per line)" value={excluded} onChangeText={setExcluded} multiline/><Button label="Save preferences" disabled={busy||!selected.length} onPress={()=>void action({action:"preferences",categories:selected,excludedSenders:excluded.split(/[\n,]/).map(v=>v.trim()).filter(Boolean),ongoing:link.ongoing})}/><Button label="Remove suggestions" variant="secondary" disabled={busy||(data?.pendingCount??0)===0} onPress={()=>confirm("Remove unreviewed suggestions?","This pauses the search and removes suggestions you haven’t saved. Saved Bills and Vault records stay.",()=>void action({action:"forgetSuggestions"}))}/><Button label="Disconnect Gmail" variant="secondary" disabled={busy} onPress={()=>confirm("Disconnect Gmail?","Stops future reading and removes stored Gmail credentials. Saved records remain in Bills and Vault, where you can delete them.",()=>void action({action:"disconnect"}))}/></Surface>:null}
 </>:null}
 <Button label="Access and privacy" variant="secondary" onPress={()=>setDetails(v=>!v)}/>
 {details?<View style={{gap:spacing.md}}><Text style={[typography.caption,{color:colors.mutedForeground}]}>Google’s read-only permission covers your mailbox. Rezlee narrows searches to home-related categories, excludes spam and promotions, and processes selected email text and one supported PDF or image attachment per email. Selected content goes to our AI processor with no-training and zero-retention routing required. Records may contain short source excerpts. Originals are saved privately only when you confirm. We keep reviewed home records, not an inbox copy. Removing records clears their details; saved records are deleted separately in Bills or Vault.</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>An invoice does not confirm that work was completed or paid. Receipts and warranties first become reviewed Vault records. Nothing is added automatically.</Text><Button label="Read the privacy policy" variant="secondary" onPress={()=>void openPublicLink("privacy")}/><Button label="Google account permissions" variant="secondary" onPress={()=>void Linking.openURL("https://myaccount.google.com/permissions").catch(()=>setError("Couldn’t open Google permissions. Please try again."))}/></View>:null}
 <Button label="Upload a document instead" variant="secondary" onPress={()=>router.push("/vault-record")}/>
 </FormScrollView></SafeAreaView>;
}

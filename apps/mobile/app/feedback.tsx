import { safeBack } from "@/lib/navigation";
import { FormScrollView } from "@/components/FormScrollView";
import { useCallback,useRef,useState } from "react";
import { useFocusEffect,useNavigation,useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiGet,apiPost,ApiError } from "@/lib/api";
import { newVaultSaveRequestId } from "@/lib/vault-save-intent";
import { colors,layout,spacing,typography } from "@/theme/tokens";
type Item={id:string;kind:string;message:string;status:string;created_at:string};
const labels:Record<string,string>={new:"Received",reviewing:"Under review",planned:"Planned",resolved:"Resolved",closed:"Closed"};
export default function Feedback(){
 const router=useRouter(),navigation=useNavigation();
 const [kind,setKind]=useState("idea"),[text,setText]=useState(""),[items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[sent,setSent]=useState(false),[uncertain,setUncertain]=useState(false);
 const request=useRef<string|null>(null),lock=useRef(false),active=useRef(false);
 usePreventRemove(Boolean(text)&&!sent,({data})=>{if(busy){Alert.alert("Sending feedback","Please wait a moment.");return;}Alert.alert("Leave your message?","Text that has not been sent will be lost.",[{text:"Keep writing",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)}]);});
 const load=useCallback(async()=>{const r=await apiGet<{items:Item[]}>("/api/mobile/v1/feedback",{timeoutMs:10000});if(!active.current)return;setItems(r.items);setError(null);if(request.current&&r.items.some(i=>i.id===request.current)){setSent(true);setText("");setUncertain(false);request.current=null;}},[]);
 useFocusEffect(useCallback(()=>{active.current=true;void load().catch(()=>{if(active.current)setError("Couldn’t load your earlier feedback. Try again.");}).finally(()=>{if(active.current)setLoading(false);});return()=>{active.current=false;};},[load]));
 async function send(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);request.current??=newVaultSaveRequestId();try{await apiPost("/api/mobile/v1/feedback",{id:request.current,kind,message:text},{timeoutMs:15000});setText("");setSent(true);setUncertain(false);request.current=null;await load().catch(()=>setError("Feedback received. Your earlier messages couldn’t be refreshed."));}catch(e){setUncertain(!(e instanceof ApiError&&[400,429].includes(e.status)));setError(e instanceof Error?e.message:"Couldn’t confirm the send. Retry the same message.");}finally{lock.current=false;setBusy(false);}}
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}><ScreenNavigation title="Help shape Rezlee" fallback="/account"/><View style={{flex:1}} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:layout.screenHorizontal,gap:spacing.lg,paddingBottom:40}}>
 <Text style={[typography.body,{color:colors.mutedForeground}]}>What would make managing your home easier? Tell us what’s missing or what didn’t work.</Text>
 {sent?<Surface tone="subtle" style={{gap:spacing.md}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Feedback received</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>We’ll review your message. You can check its status below.</Text><Button variant="secondary" label="Send another message" onPress={()=>setSent(false)}/></Surface>:<>
 <View style={{gap:spacing.sm}}>{[["idea","Suggest an improvement"],["problem","Report a problem"],["other","Something else"]].map(([value,label])=><Button key={value} label={(kind===value?"✓ ":"")+label} variant="secondary" disabled={busy||uncertain} onPress={()=>setKind(value)}/>)}</View>
 <TextField label={kind==="problem"?"What happened, and what did you expect?":"What would you like Rezlee to help with?"} multiline maxLength={3000} value={text} editable={!busy&&!uncertain} onChangeText={setText} style={{minHeight:130,textAlignVertical:"top"}}/>
 <Text style={[typography.caption,{color:colors.mutedForeground}]}>Please leave out passwords, account numbers and private bill details. Feedback doesn’t guarantee a feature or delivery date.</Text>
 <Button label={busy?"Sending…":uncertain?"Retry same message":"Send feedback"} disabled={busy||text.trim().length<10} onPress={()=>void send()}/>
 </>}
 {error?<Surface tone="subtle" style={{gap:spacing.sm}}><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><Button variant="secondary" label="Check saved feedback" disabled={busy} onPress={()=>void load().catch(()=>setError("Couldn’t check saved feedback. Try again."))}/></Surface>:null}
 <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Your feedback</Text>
 {loading?<ActivityIndicator color={colors.primary}/>:!items.length&&!error?<Text style={[typography.body,{color:colors.mutedForeground}]}>Your messages and their review status will appear here.</Text>:null}
 {items.map(item=><Surface key={item.id} style={{gap:spacing.sm}}><Text style={[typography.meta,{color:colors.primary}]}>{labels[item.status]??"Received"} · {new Date(item.created_at).toLocaleDateString("en-CA")}</Text><Text style={[typography.body,{color:colors.foreground}]}>{item.message}</Text><Text selectable style={[typography.caption,{color:colors.mutedForeground}]}>Reference {item.id.slice(0,8)}</Text></Surface>)}
 <Button variant="secondary" label="Back to Profile" onPress={()=>safeBack(router,"/account")}/>
 </FormScrollView></View></SafeAreaView>;
}

import { useCallback,useState } from "react";
import { Redirect,useFocusEffect,useRouter } from "expo-router";
import { ActivityIndicator,AppState,Linking,ScrollView,Switch,Text,View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { BriefHeading,QuietAction,ReadNotice } from "@/components/Brief";
import { fetchNotificationPreferences,saveNotificationPreferences,type NotificationPreferences } from "@/lib/notification-data";
import { registerPushNotifications } from "@/lib/push-notifications";
import { colors,layout,spacing,typography } from "@/theme/tokens";
const categories=[
 {key:"shared_expenses" as const,title:"Shared expenses",detail:"Recorded payments, corrections and reminders from your household."},
 {key:"connections" as const,title:"Connection updates",detail:"Verification requests, imports ready and connections that need your help."},
 {key:"bills" as const,title:"Bill reminders",detail:"Your saved reminder date, or three days before and on the due date. Paid, scheduled and archived bills are excluded."},
 {key:"care" as const,title:"Care reminders",detail:"A reminder on the day a saved task is due. Assigned tasks go to the assigned member."},
 {key:"recalls" as const,title:"Product recalls",detail:"Potential matches for saved items when recall monitoring is enabled."},
];
export default function NotificationSettings() {
 const {session,isLoading}=useAuth(),router=useRouter();
 const [canManageRecalls,setCanManageRecalls]=useState(false);
 const [prefs,setPrefs]=useState<NotificationPreferences|null>(null),[permission,setPermission]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{try{const [p,device]=await Promise.all([fetchNotificationPreferences(),Notifications.getPermissionsAsync()]);setPrefs(p.preferences);setCanManageRecalls(p.canManageRecalls);setPermission(device.status==="granted");setError(null);}catch{setError("Could not load notification settings.");}},[]);
 useFocusEffect(useCallback(()=>{void load();const s=AppState.addEventListener("change",v=>{if(v==="active")void load();});return()=>s.remove();},[load]));
 async function save(patch:Partial<NotificationPreferences>){if(busy||!prefs)return;setBusy(true);setError(null);try{const result=await saveNotificationPreferences(patch);setPrefs(result.preferences);}catch{setError("Could not save that change. Your previous settings are still in place.");}finally{setBusy(false);}}
 async function enable(){setBusy(true);setError(null);try{const token=await registerPushNotifications({requestPermission:true});setPermission(Boolean(token));if(!token){setError("Allow notifications in your phone settings to receive updates here.");return;}const result=await saveNotificationPreferences({push_enabled:true,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});setPrefs(result.preferences);}catch{setError("Could not enable notifications. Please try again.");}finally{setBusy(false);}}
 if(!isLoading&&!session)return <Redirect href="/(auth)/login"/>;
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title="Notification settings" fallback="/notifications"/>
  <ScrollView contentContainerStyle={{padding:layout.screenHorizontal,paddingBottom:48,gap:spacing.lg}}>
   <BriefHeading title="Choose what reaches you." detail="One set of preferences for Rezlee. Your notification centre stays available even with phone notifications off."/>
   {error?<ReadNotice message={error} onRetry={()=>void load()} busy={busy}/>:null}
   {!prefs&&!error?<ActivityIndicator color={colors.primary}/>:null}
   {prefs?<>
    <View style={{padding:18,borderRadius:16,backgroundColor:colors.surfaceSubtle,gap:12}}>
     <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text style={[typography.section,{flex:1,color:colors.foreground}]}>Push notifications</Text><Switch accessibilityLabel="All Rezlee push notifications" value={prefs.push_enabled&&permission} disabled={busy} onValueChange={v=>void(v?enable():save({push_enabled:false}))}/></View>
     <Text style={[typography.meta,{color:colors.mutedForeground}]}>{permission?"Choose which updates can appear on your phone.":"Notifications are currently unavailable on this device."}</Text>
     {!permission?<QuietAction label="Enable on this device" disabled={busy} onPress={()=>void enable()}/>:null}
     <QuietAction label="Open phone settings" onPress={()=>void Linking.openSettings()}/>
    </View>
    {categories.filter(c=>c.key!=="shared_expenses"||prefs.shared_expenses!==undefined).map(c=><View key={c.key} style={{paddingVertical:14,borderBottomWidth:1,borderBottomColor:colors.border,gap:8}}>
     <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Text style={[typography.body,{fontWeight:"600",color:colors.foreground,flex:1}]}>{c.title}</Text><Switch accessibilityLabel={c.title} value={prefs[c.key]??true} disabled={busy} onValueChange={v=>void save({[c.key]:v})}/></View>
     <Text style={[typography.meta,{color:colors.mutedForeground}]}>{c.detail}</Text>
    </View>)}
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>Bill and care reminders are grouped into at most one push each day per category. They use your saved time zone ({prefs.timezone}) between 9 a.m. and 8 p.m. Verification requests can arrive immediately. Turning pushes off doesn’t stop an import.</Text>
    {canManageRecalls?<QuietAction label="Manage recall monitoring" onPress={()=>router.push("/recall-settings")}/>:null}
    <QuietAction label="Open notification centre" onPress={()=>router.push("/notifications")}/>
   </>:null}
  </ScrollView>
 </SafeAreaView>;
}

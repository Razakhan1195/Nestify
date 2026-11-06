import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { Surface } from "@/components/ui/Surface";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { registerPushNotifications } from "@/lib/push-notifications";
import { colors, spacing, typography } from "@/theme/tokens";
type Preferences={enabled:boolean;push_enabled:boolean;schedulerActive:boolean;last_checked_at:string|null;last_error:string|null};
export function RecallPreferences() {
 const router=useRouter();
 const [prefs,setPrefs]=useState<Preferences|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [testMessage,setTestMessage]=useState<string|null>(null);
 const [permissionDenied,setPermissionDenied]=useState(false);
 const load=useCallback(async()=>{
  try {setPrefs(await apiGet<Preferences>("/api/mobile/v1/recalls/preferences"));setError(null);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not load recall preferences.");}
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function change(enabled:boolean,push_enabled:boolean) {
  if(!prefs||busy)return;
  setBusy(true);setError(null);setPermissionDenied(false);
  try {
   if(push_enabled&&!prefs.push_enabled) {
    const token=await registerPushNotifications({requestPermission:true});
    if(!token){setPermissionDenied(true);setError("Notifications could not be enabled on this device. Check device permissions and try again.");return;}
   }
   await apiPost("/api/mobile/v1/recalls/preferences",{enabled,push_enabled});
   setPrefs({...prefs,enabled,push_enabled});
  } catch(e){setError(e instanceof ApiError?e.message:"Could not save preferences.");}
  finally{setBusy(false);}
 }
 async function testNotification() {
  setBusy(true);setError(null);setTestMessage(null);
  try {
   const token=await registerPushNotifications({requestPermission:true});
   if(!token){setPermissionDenied(true);setError("Enable notifications on this device first.");return;}
   const result=await apiPost<{message:string}>("/api/mobile/v1/recalls/test-notification");
   setTestMessage(result.message);
  }catch(e){setError(e instanceof ApiError?e.message:"Could not send the requested test.");}
  finally{setBusy(false);}
 }
 return <Surface style={{gap:spacing.md}}>
  <Text style={[typography.section,{color:colors.foreground}]}>Recall preferences</Text>
  {prefs?<>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:spacing.md}}>
    <Text style={[typography.body,{color:colors.foreground,flex:1}]}>Check saved items daily</Text>
    <Switch accessibilityLabel="Check saved items daily" value={prefs.enabled} disabled={busy} onValueChange={v=>void change(v,v&&prefs.push_enabled)} />
   </View>
   <Pressable accessibilityRole="button" onPress={()=>router.push("/notification-settings")} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Manage alerts in Rezlee notification settings</Text></Pressable>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>
    {!prefs.schedulerActive?"Background checks are not active in this test environment. Your preferences are saved for activation; use Check again for current results.":prefs.enabled?"Daily checks are enabled. New potential matches are grouped into one notification when Rezlee recall notifications are on.":"Background checks are off. You can still check manually."}
   </Text>
   {prefs.enabled&&prefs.push_enabled?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Alerts go to your most recently registered device. Previously checked matches will not be sent again when you turn alerts on.</Text>:null}
   {prefs.enabled?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void testNotification()} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Send test notification to this device</Text></Pressable>:null}
   {testMessage?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{testMessage}</Text>:null}
   {prefs.last_checked_at?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Last background check: {new Date(prefs.last_checked_at).toLocaleString()}</Text>:null}
   {prefs.last_error?<Text style={{color:colors.warningForeground}}>{prefs.last_error}</Text>:null}
  </>:<Pressable accessibilityRole="button" onPress={()=>void load()} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Load recall preferences</Text></Pressable>}
  {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
  {permissionDenied?<Pressable accessibilityRole="button" onPress={()=>void Linking.openSettings()} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Open notification settings</Text></Pressable>:null}
 </Surface>;
}

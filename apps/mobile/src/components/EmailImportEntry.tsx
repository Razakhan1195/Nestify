import { useCallback,useState } from "react";
import { useFocusEffect,useRouter } from "expo-router";
import { Pressable,Text,View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { apiGet } from "@/lib/api";
import { Surface } from "@/components/ui/Surface";
import { colors,spacing,typography } from "@/theme/tokens";
export function useEmailImport(){
 const {session}=useAuth(),userId=session?.user.id;
 const [access,setAccess]=useState<{owner:string;path:"/gmail-memory"|"/email-memory"|null}|null>(null);
 useFocusEffect(useCallback(()=>{let active=true;
  if(!userId){setAccess(null);return()=>{active=false;};}
  void apiGet<{enabled:boolean;gmail?:boolean}>("/api/mobile/v1/email-memory?capabilities=1",{timeoutMs:10000})
   .then(r=>{if(active)setAccess({owner:userId,path:r.enabled?(r.gmail?"/gmail-memory":"/email-memory"):null});})
   .catch(()=>{/* Keep an already-known entry usable during a temporary outage. */});
  return()=>{active=false;};
 },[userId]));
 return userId && access?.owner===userId ? access.path : null;
}
export function EmailImportEntry({destination}:{destination:"/gmail-memory"|"/email-memory"|null}){
 const router=useRouter();if(!destination)return null;
 return <Pressable accessibilityRole="button" onPress={()=>router.push(destination)} style={({pressed})=>({opacity:pressed?0.7:1})}>
  <Surface tone="subtle" style={{flexDirection:"row",alignItems:"center",gap:spacing.md}}>
   <Feather name="mail" size={23} color={colors.primary}/>
   <View style={{flex:1,gap:spacing.xs}}><Text style={[typography.body,{fontWeight:"600",color:colors.foreground}]}>Import from email</Text>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>{destination==="/gmail-memory"?"Review bills, receipts and warranties before saving.":"Save useful details from a home email."}</Text></View>
   <Feather name="chevron-right" size={19} color={colors.primary}/>
  </Surface>
 </Pressable>;
}

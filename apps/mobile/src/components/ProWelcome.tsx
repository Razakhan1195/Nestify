import { useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { CleaningArtwork } from "./CleaningUI";
import type { Membership } from "@/lib/membership-types";
import { proWelcomeCopy } from "@/lib/membership-welcome";
import { colors, editorialType, typography } from "@/theme/tokens";

export function ProWelcomeContent({membership}:{membership:Membership}) {
 const copy=proWelcomeCopy(membership);
 return <>        <CleaningArtwork height={170} />
        <View style={{ gap: 9 }}>
          <Text style={[typography.label, { color: colors.primary }]}>{copy.label}</Text>
          <Text accessibilityRole="header" style={[editorialType, { fontSize: 34, lineHeight: 40, color: colors.foreground }]}>Welcome to Rezlee Pro.</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>{copy.detail}</Text>
        </View>
        <View style={{ gap: 18 }}>
          {([
            ["file-text", "Make sense of your bills", "Unlimited bill scans, with imports from supported providers and Gmail."],
            ["message-circle", "Get help before you spend", "Compare quotes, check compatibility and weigh repair against replacement. 50 AI requests each month."],
            ["home", "Bring your household along", "Pro benefits extend to your household. Shared routines and recurring tasks are free for everyone."],
          ] as const).map(([icon, title, detail]) => <View key={title} style={{ flexDirection: "row", gap: 12 }}>
            <View accessible={false} style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSubtle }}><Feather name={icon} size={18} color={colors.primary} /></View>
            <View style={{ flex: 1, gap: 4 }}><Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>{title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{detail}</Text></View>
          </View>)}
        </View>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Built in Canada by a small team. Your feedback helps us make life at home simpler. Provider availability and service limits apply.</Text>
</>;
}
export function ProWelcome({membership,visible,onClose,onPostpone}:{membership:Membership;visible:boolean;onClose:()=>void;onPostpone:()=>void}) {
 return visible?<PresentedProWelcome membership={membership} onClose={onClose} onPostpone={onPostpone}/>:null;
}
function PresentedProWelcome({membership,onClose,onPostpone}:{membership:Membership;onClose:()=>void;onPostpone:()=>void}) {
 const shown=useRef(false),[ready,setReady]=useState(false);
 return <Modal visible={true} animationType="slide" presentationStyle="fullScreen"
  onShow={()=>{shown.current=true;setReady(true);}}
  onDismiss={()=>{shown.current=false;setReady(false);}}
  onRequestClose={onPostpone}>
  <SafeAreaView style={{flex:1,backgroundColor:colors.canvas}}>
   <ScrollView contentContainerStyle={{padding:24,gap:20,maxWidth:520,width:"100%",alignSelf:"center"}}>
    <ProWelcomeContent membership={membership}/>
    <Button label="Make yourself at home" disabled={!ready} onPress={()=>{if(shown.current){shown.current=false;onClose();}}}/>
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}

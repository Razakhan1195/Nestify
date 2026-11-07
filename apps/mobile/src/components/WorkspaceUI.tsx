import { useTheme } from "@/theme/useTheme";
import { profileName } from "@/lib/profile-identity";
import { useMembership } from "@/lib/use-membership";
import { NotificationBell } from "@/components/AppNotifications";
import { ProfileBadge } from "@/components/ProfileUI";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { editorialType, homeTile, layout, spacing, typography } from "@/theme/tokens";

export function ActionControl({ label, icon, onPress }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void }) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 7 })}>
    {icon ? <Feather name={icon} size={17} color={colors.primary} /> : null}
    <Text style={[typography.meta, { color: colors.primary, fontWeight: "600", flexShrink: 1 }]}>{label}</Text>
  </Pressable>;
}
/** One compact navigation bar across tabs. Screen titles belong to scrolling content. */
export function TabHeader({ title, showAssistant = true }: { title: string; showAssistant?: boolean }) {
  const { colors } = useTheme();

 const router=useRouter(),{session}=useAuth();
 const membership=useMembership(title==="Home");
 const pro=membership?.enabled&&membership.membership?.plan==="pro";
 const {width,fontScale}=useWindowDimensions();
 const compact=width<375||fontScale>1.2;
 return <SafeAreaView edges={["top"]} style={{backgroundColor:"transparent"}}>
  <View accessibilityLabel={`${title} navigation`} style={{paddingHorizontal:layout.screenHorizontal,paddingVertical:spacing.xs,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:spacing.sm}}>
   <View style={{flexDirection:"row",alignItems:"center",gap:6,flexShrink:0}}><Pressable accessibilityRole="button" accessibilityLabel="Your profile and settings" onPress={()=>router.push("/account")} style={({pressed})=>({width:44,height:44,borderRadius:22,alignItems:"center",justifyContent:"center",opacity:pressed?0.65:1})}><ProfileBadge metadata={session?.user.user_metadata} size={44} circular/></Pressable>{pro?<Pressable accessibilityRole="button" accessibilityLabel="Rezlee Pro membership" onPress={()=>router.push("/membership")} style={({pressed})=>({minHeight:44,justifyContent:"center",opacity:pressed?.65:1})}><View style={{paddingHorizontal:9,paddingVertical:4,borderRadius:8,backgroundColor:colors.surfaceSubtle}}><Text style={[typography.caption,{color:colors.primary,fontWeight:"600"}]}>Pro</Text></View></Pressable>:null}</View>
   <View style={{flexDirection:"row",alignItems:"center",gap:8,flexShrink:1}}>{title==="Home"?<Pressable accessibilityRole="button" accessibilityLabel="Rewards and invite a friend" onPress={()=>router.push("/rewards")} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="gift" size={21} color={colors.primary}/></Pressable>:null}<NotificationBell/>
   {showAssistant?<Pressable accessibilityRole="button" accessibilityLabel="Ask Rezlee" onPress={()=>router.push("/assistant")} style={({pressed})=>({minHeight:44,paddingVertical:8,paddingHorizontal:12,borderRadius:24,backgroundColor:colors.surfaceRaised,flexShrink:1,flexDirection:"row",alignItems:"center",gap:8,opacity:pressed?0.6:1})}><Feather accessible={false} name="message-circle" size={19} color={colors.primary}/>{!compact?<Text style={[typography.body,{color:colors.primary,fontWeight:"600",flexShrink:1}]}>Ask Rezlee</Text>:null}</Pressable>:null}</View>
  </View>
 </SafeAreaView>;
}

export function HomeGreeting({household}:{household?:string;canInvite?:boolean}) {
  const { colors } = useTheme();

 const router=useRouter(),{session}=useAuth();
 const name=profileName(session?.user.user_metadata);
 return <View style={{gap:spacing.xs}}>
  <Text accessibilityRole="header" style={[editorialType,{fontSize:34,lineHeight:41,color:colors.foreground}]}>{name?`Hello, ${name}.`:"Your place, in view."}</Text>
  <View style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8}}>
   {household?<Pressable accessibilityRole="button" accessibilityLabel={`Manage household: ${household}`} onPress={()=>router.push("/household")} style={({pressed})=>({minHeight:44,maxWidth:"100%",flexShrink:1,flexDirection:"row",alignItems:"center",gap:6,opacity:pressed?0.6:1})}><Feather accessible={false} name="home" size={15} color={colors.mutedForeground}/><Text style={[typography.meta,{color:colors.mutedForeground,flexShrink:1}]}>{household}</Text><Feather accessible={false} name="chevron-right" size={15} color={colors.mutedForeground}/></Pressable>:null}

  </View>
 </View>;
}

export function HomeQuickActions({ onBill, onRecord, onReminder, onSplit }: { onBill: () => void; onRecord: () => void; onReminder: () => void; onSplit: () => void }) {
  const { colors } = useTheme();

  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const items = [
    { label: "Add bill", icon: "file-text" as const, action: onBill },
    { label: "Save record", icon: "archive" as const, action: onRecord },
    { label: "Reminder", icon: "calendar" as const, action: onReminder },
    { label: "Split expense", icon: "users" as const, action: onSplit },
  ];
  return <View style={{ flexDirection: stacked ? "column" : "row", gap: width < 360 ? 8 : 10, paddingVertical: 4 }}>
    {items.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={item.action} style={({ pressed }) => ({ flex: stacked ? undefined : 1, minWidth: 0, minHeight: 44, flexDirection: stacked ? "row" : "column", alignItems: "center", gap: stacked ? 14 : 8, opacity: pressed ? 0.65 : 1 })}>
      <View accessible={false} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSubtle }}><Feather name={item.icon} size={22} color={colors.primary} /></View>
      <Text style={[typography.meta, { color: colors.foreground, fontWeight: "600", textAlign: stacked ? "left" : "center", flexShrink: 1 }]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const { colors } = useTheme();

  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
    <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground, flex: 1 }]}>{title}</Text>
    {action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: "center", maxWidth: "45%" }}><Text style={[typography.meta, { fontWeight: "600", color: colors.primary }]}>{action}</Text></Pressable> : null}
  </View>;
}
export function DestinationTile({ title, detail, action, icon, onPress, children, style }: { title: string; detail: string; action: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; children?: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}. ${action}`} onPress={onPress} style={({ pressed }) => ({ borderRadius: 18, padding: 20, backgroundColor: pressed ? colors.accent : colors.surfaceSubtle, gap: 10, ...style })}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      {children ?? <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}><Feather name={icon} size={23} color={colors.primary} /></View>}
      <View style={{ flex: 1, gap: 5 }}><Text style={[typography.section, { color: colors.foreground }]}>{title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{detail}</Text></View>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24 }}><Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>{action}</Text><Feather name="arrow-up-right" size={18} color={colors.primary} /></View>
  </Pressable>;
}
export function AddHomeMenu() {
  const { colors } = useTheme();

  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <>
    <ActionControl label="Add" icon="plus" onPress={() => setOpen(true)} />
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close add menu" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={["bottom"]} style={{ maxHeight: "85%", backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <ScrollView accessibilityViewIsModal contentContainerStyle={{ padding: 24, gap: 8 }}>
            <SectionHeading title="Add to your home" action="Close" onPress={() => setOpen(false)} />
            {[{ title: "Bill", detail: "Scan or enter a bill", icon: "file-text", route: "/bill/add" }, { title: "Record", detail: "Receipt, policy or document", icon: "archive", route: "/vault-record" }, { title: "Home item", detail: "Appliance or belonging, with scan options", icon: "box", route: "/inventory-item" }, { title: "Warranty", detail: "Coverage dates and proof of purchase", icon: "shield", route: "/vault-record?kind=warranty" }, { title: "Care task", detail: "Something to do or remember", icon: "check-square", route: "/care/add" }].map(item => <Pressable key={item.title} accessibilityRole="button" onPress={() => { setOpen(false); router.push(item.route as never); }} style={{ minHeight: 66, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Feather name={item.icon as keyof typeof Feather.glyphMap} size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{item.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.detail}</Text></View><Feather name="chevron-right" size={18} color={colors.primary} />
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}


export function HomeSection({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "bills" | "attention" }) {
  const { colors } = useTheme();

 return <View style={{backgroundColor:tone==="attention"?colors.warningBg:tone==="bills"?colors.billSurface:colors.surfaceRaised,borderRadius:homeTile.radius,padding:homeTile.padding,gap:4,borderWidth:1,borderColor:tone==="bills"?colors.billBorder:colors.border}}>{children}</View>;
}



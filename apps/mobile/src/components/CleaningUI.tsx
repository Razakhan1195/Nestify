import { useTheme } from "@/theme/useTheme";
import { CollectionIntro } from "./CollectionIntro";
import { Feather } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";
import type { HouseholdMember } from "@/lib/household-data";
import { typography } from "@/theme/tokens";

export function CareChoice({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({pressed}) => ({ minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface, opacity: disabled ? .45 : pressed ? .75 : 1 })}><Text style={[typography.meta, { color: selected ? colors.primaryForeground : colors.foreground, fontWeight: "600" }]}>{label}</Text></Pressable>;
}
export function CleaningPeople({ members, selected, onSelect, anyone = false }: { members: HouseholdMember[]; selected: string[]; onSelect: (id: string) => void; anyone?: boolean }) {
  const { colors } = useTheme();

  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
    {anyone ? <CareChoice label="Anyone" selected={!selected.length} onPress={() => onSelect("")} /> : null}
    {members.map(member => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`${member.display_name}${member.status === "local" ? ", managed by you" : ""}`} accessibilityState={{selected: selected.includes(member.id)}} onPress={() => onSelect(member.id)} style={({pressed})=>({minHeight:48,flexDirection:"row",alignItems:"center",gap:8,borderRadius:24,padding:7,paddingRight:13,borderWidth:1,borderColor:selected.includes(member.id)?colors.primary:colors.border,backgroundColor:selected.includes(member.id)?colors.surfaceSubtle:colors.surface,maxWidth:"100%",opacity:pressed?.7:1})}>
      <View style={{width:30,height:30,borderRadius:15,backgroundColor:selected.includes(member.id)?colors.primary:colors.muted,alignItems:"center",justifyContent:"center"}}><Text style={{fontSize:13,fontWeight:"600",color:selected.includes(member.id)?colors.primaryForeground:colors.primary}}>{member.display_name.trim().slice(0,1).toUpperCase()}</Text></View>
      <Text style={[typography.meta,{color:colors.foreground,flexShrink:1,fontWeight:"600"}]}>{member.display_name}</Text>
      {selected.includes(member.id)?<Feather name="check" size={14} color={colors.primary}/>:null}
    </Pressable>)}
  </View>;
}
// Metro requires a static require to bundle native image assets.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharedHome = require("../../assets/care/shared-home.jpg");
export function CleaningArtwork({height=170}:{height?:number}) {
 return <Image accessible={false} source={sharedHome} alt="" resizeMode="contain" style={{width:"100%",height}}/>;
}
export function CleaningFeature({onPress,active=false,canCreate=true,compact=false}:{onPress:()=>void;active?:boolean;canCreate?:boolean;compact?:boolean}){
 return <CollectionIntro section="care" spacious={!active && !compact} compact={active || compact} eyebrow="CLEANING TOGETHER · INCLUDED FREE"
  title={active?"Your shared routines":!canCreate?"Cleaning together":undefined}
  detail={active?(canCreate?"Manage jobs, people and repeats.":"See the jobs, people and repeats in your household."):!canCreate?"See your household’s routines and the jobs everyone shares.":undefined}
  actionLabel={canCreate?(active?"Manage shared routines":"Choose a routine"):"View household routines"} onPress={onPress}/>;
}

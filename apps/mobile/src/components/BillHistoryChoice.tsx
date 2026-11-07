import { useTheme } from "@/theme/useTheme";
import {Pressable,Text,View} from "react-native";
import { spacing, typography, radii } from "@/theme/tokens";
export function BillHistoryChoice({value,onChange}:{value:number;onChange:(months:number)=>void}) {
  const { colors } = useTheme();

 return <View style={{gap:spacing.sm}}>
  <Text style={[typography.section,{color:colors.foreground}]}>How much history?</Text>
  <Text style={[typography.meta,{color:colors.mutedForeground}]}>Start with 12 months for a clearer picture, or choose less.</Text>
  <View accessibilityRole="radiogroup" style={{flexDirection:"row",flexWrap:"wrap",gap:spacing.sm}}>
   {[1,3,6,12].map(months=><Pressable key={months} accessibilityRole="radio" accessibilityState={{checked:value===months}} aria-checked={value===months} accessibilityLabel={months+" "+(months===1?"month":"months")} onPress={()=>onChange(months)} style={{minWidth:76,minHeight:46,paddingHorizontal:spacing.md,alignItems:"center",justifyContent:"center",borderRadius:radii.lg,backgroundColor:value===months?colors.primary:colors.card,borderWidth:1,borderColor:value===months?colors.primary:colors.border}}>
    <Text style={[typography.meta,{color:value===months?colors.primaryForeground:colors.foreground}]}>{months} {months===1?"month":"months"}</Text>
   </Pressable>)}
  </View>
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>We’ll save the original bills available within that date range. Quarterly billing or a newer account may mean fewer bills. We won’t change paperless billing or payment settings.</Text>
 </View>;
}

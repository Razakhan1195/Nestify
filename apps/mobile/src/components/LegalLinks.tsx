import {Pressable,Text,View} from "react-native";
import {openPublicLink} from "@/lib/public-links";
import {colors,spacing,typography} from "@/theme/tokens";
export function LegalLinks({disabled=false}:{disabled?:boolean}) {
 return <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:spacing.md}}>{([["privacy","Privacy"],["terms","Terms"],["contact","Help"]] as const).map(([key,label])=><Pressable key={key} accessibilityRole="link" accessibilityLabel={`${label}, opens website`} disabled={disabled} onPress={()=>void openPublicLink(key)} style={{minHeight:44,paddingHorizontal:spacing.sm,justifyContent:"center",opacity:disabled?0.5:1}}><Text style={[typography.meta,{color:colors.primary,textDecorationLine:"underline"}]}>{label}</Text></Pressable>)}</View>;
}

import { ActivityIndicator, Text, View } from "react-native";
import { colors, layout, typography } from "@/theme/tokens";
export function DetailLoading({ label }: { label: string }) {
  return <View style={{padding:layout.screenHorizontal,gap:24}}>
    <View accessible accessibilityLabel={label} accessibilityState={{busy:true}} style={{flexDirection:"row",gap:10,alignItems:"center"}}><ActivityIndicator accessible={false} color={colors.primary}/><Text style={[typography.body,{color:colors.mutedForeground}]}>{label}</Text></View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{gap:12}}>
      <View style={{height:28,width:"80%",borderRadius:8,backgroundColor:colors.surfaceSubtle}}/>
      <View style={{height:24,width:"55%",borderRadius:8,backgroundColor:colors.surfaceSubtle}}/>
      <View style={{borderRadius:20,padding:20,gap:22,backgroundColor:colors.surfaceRaised}}>{[0,1,2,3].map(i=><View key={i} style={{height:16,width:i%2?"65%":"90%",borderRadius:6,backgroundColor:colors.surfaceSubtle}}/>)}</View>
    </View>
  </View>;
}

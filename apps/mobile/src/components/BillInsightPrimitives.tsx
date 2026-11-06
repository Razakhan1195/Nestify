import {Text,View,useWindowDimensions} from "react-native";
import {colors,radii,spacing,typography} from "@/theme/tokens";

/** Shared summary cards used by both utility and provider bill intelligence. */
export function InsightStat({label,value,detail}:{label:string;value:string;detail?:string}) {
 const {fontScale}=useWindowDimensions();
 return <View style={{flex:1,minWidth:fontScale>1.3?"100%":"44%",gap:3,borderRadius:radii.xl,backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.border,padding:spacing.md}}>
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>{label}</Text>
  <Text style={{fontSize:20,fontWeight:"800",color:colors.foreground}}>{value}</Text>
  {detail?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{detail}</Text>:null}
 </View>;
}

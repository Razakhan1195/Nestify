import { Feather } from "@expo/vector-icons";
import { Pressable,Text,View } from "react-native";
import { colors,radii,typography,premium } from "@/theme/tokens";
export function ActionCard({title,detail,icon="arrow-right",onPress,disabled=false}:{title:string;detail?:string;icon?:React.ComponentProps<typeof Feather>["name"];onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title+(detail?". "+detail:"")} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:76,padding:18,borderRadius:radii["2xl"],borderWidth:1,borderColor:colors.border,backgroundColor:pressed?colors.accent:colors.surfaceRaised,flexDirection:"row",gap:12,alignItems:"center",opacity:disabled?.5:1})}>
 <View style={{width:42,height:42,borderRadius:13,backgroundColor:premium.apricotSurface,alignItems:"center",justifyContent:"center"}}><Feather accessible={false} name={icon} size={21} color={colors.primary}/></View>
 <View style={{flex:1,gap:4}}><Text style={[typography.section,{color:colors.foreground}]}>{title}</Text>{detail?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{detail}</Text>:null}</View><Feather accessible={false} name="chevron-right" size={20} color={colors.primary}/>
 </Pressable>;
}

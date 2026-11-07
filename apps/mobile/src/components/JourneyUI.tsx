import { useTheme } from "@/theme/useTheme";
import type {ReactNode} from "react";
import {Feather} from "@expo/vector-icons";
import {Pressable,Text,View} from "react-native";
import { editorialType, typography } from "@/theme/tokens";

export function JourneyHeading({eyebrow,title,detail}:{eyebrow?:string;title:string;detail?:string}){
  const { colors } = useTheme();

 return <View style={{gap:10}}>{eyebrow?<Text style={[typography.label,{color:colors.primary}]}>{eyebrow}</Text>:null}<Text accessibilityRole="header" style={[editorialType,{fontSize:32,lineHeight:39,color:colors.foreground}]}>{title}</Text>{detail?<Text style={[typography.body,{color:colors.mutedForeground}]}>{detail}</Text>:null}</View>;
}
export function JourneyPanel({children,tone="paper"}:{children:ReactNode;tone?:"paper"|"soft"}){
  const { colors, premium } = useTheme();

 return <View style={{padding:20,borderRadius:22,gap:16,backgroundColor:tone==="soft"?colors.surfaceSubtle:colors.surface,borderWidth:1,borderColor:tone==="soft"?colors.surfaceSubtle:premium.line}}>{children}</View>;
}
export function JourneyEntry({icon,title,detail,onPress,disabled=false}:{icon:keyof typeof Feather.glyphMap;title:string;detail:string;onPress:()=>void;disabled?:boolean}){
  const { colors, premium } = useTheme();

 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:80,padding:18,borderRadius:20,backgroundColor:colors.surface,borderWidth:1,borderColor:premium.line,flexDirection:"row",alignItems:"center",gap:14,opacity:disabled?0.5:pressed?0.7:1})}>
 <View style={{width:42,height:42,borderRadius:14,backgroundColor:premium.apricotSurface,alignItems:"center",justifyContent:"center"}}><Feather accessible={false} name={icon} size={20} color={colors.primary}/></View>
 <View style={{flex:1,gap:5}}><Text style={[typography.section,{color:colors.foreground}]}>{title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{detail}</Text></View><Feather accessible={false} name="arrow-up-right" size={18} color={colors.primary}/>
 </Pressable>;
}
/** Steps describe evidence already present; they never imply a verified outcome. */
export function JourneySteps({labels,current}:{labels:readonly string[];current:number}){
  const { colors } = useTheme();

 return <View accessibilityLabel={"Step "+(current+1)+" of "+labels.length+": "+labels[current]} style={{flexDirection:"row",gap:8}}>{labels.map((label,i)=><View key={label} style={{flex:1,gap:7}}><View style={{height:3,borderRadius:2,backgroundColor:i<=current?colors.primary:colors.border}}/><Text style={[typography.caption,{color:i===current?colors.foreground:colors.mutedForeground,fontWeight:i===current?"600":"400"}]}>{label}</Text></View>)}</View>;
}
export function JourneyDisclosure({label,detail,open,onToggle,children,disabled=false}:{label:string;detail?:string;open:boolean;onToggle:()=>void;children:ReactNode;disabled?:boolean}){
  const { colors, premium } = useTheme();

 return <View style={{borderWidth:1,borderColor:premium.line,borderRadius:18,backgroundColor:colors.surface,overflow:"hidden"}}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={onToggle} style={{minHeight:56,padding:16,flexDirection:"row",alignItems:"center",gap:12}}><View style={{flex:1,gap:5}}><Text style={[typography.body,{color:colors.foreground,fontWeight:"600"}]}>{label}</Text>{detail?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{detail}</Text>:null}</View><Feather accessible={false} name={open?"minus":"plus"} size={18} color={colors.primary}/></Pressable>{open?<View style={{paddingHorizontal:16,paddingBottom:18,gap:16}}>{children}</View>:null}</View>;
}


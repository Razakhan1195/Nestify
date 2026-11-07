import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {Feather} from "@expo/vector-icons";
import {Pressable,Text,View,useWindowDimensions} from "react-native";
import { typography } from "@/theme/tokens";

export type CareSetupKind="reminder"|"cleaning"|"maintenance";
const makeContent = (colors: Colors) => ({
 reminder:{title:"Remember the little things",detail:"Give a task a date. We’ll keep it in view.",action:"Add a task or reminder",tone:colors.reminderSurface,sheet:"A little reminder",lines:["Replace the filter","Choose a date"]},
 cleaning:{title:"Cleaning together",detail:"Pick the jobs, share them out and take turns.",action:"Build our routine",tone:colors.cleaningSurface,sheet:"Your weekly rhythm",lines:["Kitchen","Bathroom","Floors"]},
 maintenance:{title:"Seasonal upkeep",detail:"Review a practical plan, then choose your tasks.",action:"Build a maintenance plan",tone:colors.maintenanceSurface,sheet:"Around the seasons",lines:["Spring check","Autumn check"]},
} as const);
function PlanArtwork({kind}:{kind:CareSetupKind}){
  const { colors, premium } = useTheme();
  const content = useThemeMemo(() => makeContent(colors), [colors, premium]);

 const c=content[kind];
 return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{width:116,height:122,justifyContent:"center",alignItems:"center"}}>
  <View style={{position:"absolute",width:94,height:108,borderRadius:9,backgroundColor:colors.artBacking,transform:[{rotate:"-9deg"}]}}/>
  <View style={{width:104,minHeight:102,padding:10,borderRadius:9,backgroundColor:colors.artPaper,transform:[{rotate:"4deg"}],gap:9,borderWidth:1,borderColor:colors.artBorder}}>
   <View style={{height:5,width:32,borderRadius:3,backgroundColor:colors.primary}}/>
   <Text allowFontScaling={false} style={{fontSize:8,fontWeight:"600",color:colors.foreground}}>{c.sheet}</Text>
   {c.lines.map((line,i)=><View key={line} style={{flexDirection:"row",alignItems:"center",gap:5}}><View style={{width:9,height:9,borderRadius:kind==="cleaning"?5:2,borderWidth:1,borderColor:colors.primary,backgroundColor:i===0?c.tone:"transparent"}}/><Text allowFontScaling={false} style={{fontSize:7,color:colors.mutedForeground}}>{line}</Text></View>)}
  </View>
 </View>;
}
export function CareSetupTiles({adoption,onStart}:{adoption?:Record<CareSetupKind,boolean|null>;onStart:(kind:CareSetupKind)=>void}){
  const { colors, premium } = useTheme();
  const content = useThemeMemo(() => makeContent(colors), [colors, premium]);

 const {width,fontScale}=useWindowDimensions(),stack=width<360||fontScale>1.3;
 const remaining=(Object.keys(content) as CareSetupKind[]).filter(kind=>adoption?.[kind]===false);
 if(!remaining.length)return null;
 return <View style={{gap:14,marginTop:12}}>
  {remaining.map(kind=>{const c=content[kind];return <Pressable key={kind} accessibilityRole="button" accessibilityLabel={c.action+". "+c.detail} onPress={()=>onStart(kind)} style={({pressed})=>({backgroundColor:c.tone,borderRadius:20,padding:18,gap:10,flexDirection:stack?"column":"row",alignItems:stack?"flex-start":"center",opacity:pressed?0.8:1})}>
   <View style={{flex:stack?undefined:1,gap:8}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{c.title}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{c.detail}</Text><View style={{flexDirection:"row",alignItems:"center",gap:8,minHeight:38,paddingVertical:8,paddingHorizontal:12,borderRadius:12,alignSelf:"flex-start",backgroundColor:colors.artAction,borderWidth:1,borderColor:colors.artActionBorder}}><Text style={[typography.meta,{color:colors.primary,fontWeight:"600",flexShrink:1}]}>{c.action}</Text><Feather name="arrow-right" size={17} color={colors.primary}/></View></View>
   <PlanArtwork kind={kind}/>
  </Pressable>;})}
 </View>;
}


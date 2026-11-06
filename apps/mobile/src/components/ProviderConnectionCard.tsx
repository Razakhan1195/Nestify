import {Feather} from "@expo/vector-icons";
import {Pressable,Text,View} from "react-native";
import {ConnectionBrand} from "./ConnectionBrand";
import {ProviderBrand} from "./ProviderBrand";
import {Surface} from "./ui/Surface";
import {colors,spacing,typography} from "@/theme/tokens";

export function ProviderConnectionCard({kind,onPress}:{kind:"green"|"deck";onPress:()=>void}) {
 const utility=kind==="green";
 const title=utility?"Connect an Ontario utility":"Connect a bill provider";
 const names=utility?["Enbridge","Elexicon","Hydro One"]:["Bell","Rogers","TELUS"];
 return <Pressable accessibilityRole="button" accessibilityLabel={title+". "+(utility?"Review Green Button data sharing, powered by EZGB.":"See provider availability and how Deck sign-in works.")} onPress={onPress} style={({pressed})=>({opacity:pressed?0.75:1})}>
  <Surface tone="raised" style={{gap:spacing.md}}>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12}}>
    <ConnectionBrand kind={kind}/>
    <View accessible={false} style={{width:48,height:56,borderWidth:1,borderColor:colors.borderStrong,borderRadius:10,backgroundColor:colors.surfaceSubtle,padding:10,gap:6}}>
     <Feather name={utility?"zap":"file-text"} size={18} color={colors.primary}/>
     <View style={{height:2,width:24,backgroundColor:colors.borderStrong}}/><View style={{height:2,width:16,backgroundColor:colors.borderStrong}}/>
    </View>
   </View>
   <View style={{gap:6}}>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>{utility?"Ontario · Electricity & natural gas":"Canada · Internet, mobile & home services"}</Text>
    <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{title}</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{utility?"Bring available bills and energy usage together through Green Button, powered by EZGB.":"Bring available statements into Rezlee through Deck to understand charges, credits and changes."}</Text>
   </View>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{names.map(name=><ProviderBrand key={name} provider={name} category={utility?"electricity":"internet"} compact/>)}</View>
   <View style={{flexDirection:"row",alignItems:"flex-start",gap:8,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}>
    <Feather name="lock" size={16} color={colors.primary}/>
    <Text style={[typography.caption,{flex:1,color:colors.mutedForeground}]}>{utility?"You approve sharing through your utility’s authorization process. You can revoke consent.":"Choose a provider and review how sign-in works before sharing any credentials. Availability varies."}</Text>
   </View>
   <View style={{minHeight:32,flexDirection:"row",alignItems:"center",gap:8}}>
    <Text style={[typography.meta,{flex:1,color:colors.primary,fontWeight:"600"}]}>{utility?"See how sharing works":"See available providers"}</Text>
    <Feather name="arrow-right" size={18} color={colors.primary}/>
   </View>
  </Surface>
 </Pressable>;
}

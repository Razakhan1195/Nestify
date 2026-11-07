import { useTheme } from "@/theme/useTheme";
import {useCallback,useState} from "react";
import {useFocusEffect,useRouter} from "expo-router";
import {Feather} from "@expo/vector-icons";
import {Pressable,Text,View} from "react-native";
import {useAuth} from "@/auth/AuthProvider";
import {apiGet} from "@/lib/api";
import { typography } from "@/theme/tokens";

type Summary={checkedAt:string;itemCount:number;missingBrandCount:number;matches:{key:string;itemName:string;status:string}[]};
export function RecallWatchSummary({itemCount,onlyActionable=false}:{itemCount:number;onlyActionable?:boolean}){
  const { colors } = useTheme();

 const router=useRouter(),{session}=useAuth(),scope=session?.user.id;
 const [state,setState]=useState<{scope:string|undefined;data:Summary|null;failed:boolean}|null>(null);
 useFocusEffect(useCallback(()=>{
  let active=true;
  if(itemCount>0&&scope)void apiGet<Summary>("/api/mobile/v1/recalls").then(data=>{if(active)setState({scope,data,failed:false});}).catch(()=>{if(active)setState(previous=>({scope,data:previous?.scope===scope?previous.data:null,failed:true}));});
  return()=>{active=false;};
 },[itemCount,scope]));
 const current=state?.scope===scope?state:null;
 const open=current?.data?.matches.filter(match=>match.status==="open")??[];
 if(onlyActionable&&(!itemCount||!open.length))return null;
 const title=!itemCount?"Recall Watch":open.length?`${open.length} potential recall ${open.length===1?"match":"matches"}`:"Recall Watch";
 const detail=!itemCount?"Save a home item with its brand and model to check for potential recalls."
  :current?.failed?"The latest check couldn’t be completed. Open Recall Watch to retry."
  :!current?.data?"Checking saved item details…"
  :open.length?`${open.slice(0,2).map(match=>match.itemName).join(", ")}. Verify the model against the recall notice.`
  :"No potential matches in the latest check. This is not a guarantee that every item is covered.";
 return <View style={{padding:18,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:open.length?colors.warningBg:colors.surfaceRaised,gap:8}}>
  <View style={{flexDirection:"row",alignItems:"center",gap:10}}><Feather name="shield" size={20} color={colors.primary}/><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,flex:1}]}>{title}</Text></View>
  <Text style={[typography.meta,{color:colors.mutedForeground}]}>{detail}</Text>
  {current?.data&&itemCount>0?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Source checked {new Date(current.data.checkedAt).toLocaleDateString("en-CA")}{current.failed?" · Earlier result":""}</Text>:null}
  {current?.data?.missingBrandCount&&!onlyActionable?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{current.data.missingBrandCount} saved items need a brand for a more useful check.</Text>:null}
  <Pressable accessibilityRole="button" onPress={()=>router.push(itemCount?"/recalls":"/inventory-item")} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:10}}><Text style={[typography.meta,{fontWeight:"600",color:colors.primary,flex:1}]}>{itemCount?"Open Recall Watch":"Add a home item"}</Text><Feather name="chevron-right" size={18} color={colors.primary}/></Pressable>
  {!itemCount?<Pressable accessibilityRole="button" onPress={()=>router.push("/recalls")} style={{minHeight:44,justifyContent:"center"}}><Text style={[typography.meta,{color:colors.primary}]}>About Recall Watch</Text></Pressable>:null}
 </View>;
}

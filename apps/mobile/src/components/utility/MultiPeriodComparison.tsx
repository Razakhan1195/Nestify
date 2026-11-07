import { useTheme } from "@/theme/useTheme";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { apiGet, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/home-data";
import { spacing, typography } from "@/theme/tokens";

type Comparison = {
  considered:number; days:number; gapDays:number; confidence:string;
  range:{start:string;end:string}|null; savings:number|null; reasons:string[];
  included:Array<{id:string;start:string;end:string;matched:boolean}>;
  excluded:Array<{id:string;start:string;end:string;reason:string}>;
  plans:Array<{plan:"tou"|"ulo"|"tiered";cost:number}>;
};
const labels={tou:"Time-of-Use",ulo:"Ultra-Low Overnight",tiered:"Tiered (estimate)"};
export function MultiPeriodComparison({providerId}:{providerId:string}) {
  const { colors } = useTheme();

  const router=useRouter();
  const [data,setData]=useState<Comparison|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(false);
  const [retry,setRetry]=useState(0);
  useFocusEffect(useCallback(()=>{
    let active=true;
    setLoading(true);setError(null);setData(null);
    void apiGet<Comparison>(`/api/mobile/v1/utilities/${encodeURIComponent(providerId)}/comparison?request=${retry}`,{timeoutMs:30000})
      .then(value=>{if(active)setData(value);})
      .catch(e=>{if(active)setError(e instanceof ApiError?e.message:"Could not compare your saved statements.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[providerId,retry]));
  return <View style={{gap:spacing.md}}>
    <Text style={[typography.section,{color:colors.foreground}]}>Historical plan comparison</Text>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>Uses prices in effect during those saved periods. Open Compare electricity plans above for current-rate scenarios.</Text>
    {loading?<ActivityIndicator color={colors.primary}/>:null}
    {error?<View><Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={()=>setRetry(v=>v+1)} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Try comparison again</Text></Pressable></View>:null}
    {data?<View style={{gap:spacing.md}}>
      <Text style={[typography.body,{color:colors.foreground}]}>{data.included.length? `${data.included.length} of ${data.considered} statements included · ${data.days} days`:"Not enough complete saved data to compare yet."}</Text>
      {data.range?<Text style={[typography.caption,{color:colors.mutedForeground}]}>{data.range.start} – {data.range.end}</Text>:null}
      {data.plans.map((row,index)=><View key={row.plan} style={{flexDirection:"row",justifyContent:"space-between",gap:spacing.md,paddingVertical:spacing.sm,borderBottomWidth:1,borderColor:colors.border}}>
        <View style={{flex:1}}><Text style={[typography.body,{color:colors.foreground}]}>{labels[row.plan]}</Text>
        {index===0?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Lowest estimate across included periods</Text>:null}</View>
        <Text style={[typography.body,{color:colors.foreground}]}>{formatCurrency(row.cost)}</Text>
      </View>)}
      {data.savings!==null?<Text style={[typography.body,{color:colors.foreground}]}>{data.savings>0?`The lowest estimated plan totals about ${formatCurrency(data.savings)} less than the recorded plans over these periods.`:"The recorded plans were already as inexpensive as the lowest fixed-plan estimate over these periods."}</Text>:null}
      {data.reasons.map(reason=><Text key={reason} style={[typography.caption,{color:colors.mutedForeground}]}>{reason}</Text>)}
      {data.considered>0?<Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>{expanded?"Hide period details":"Review included and excluded periods"}</Text></Pressable>:null}
      {expanded?[...data.included.map(row=>({...row,detail:row.matched?"Included · electricity charge reconciled":"Included · charge reconciliation unavailable or outside tolerance"})),...data.excluded.map(row=>({...row,detail:"Excluded · "+row.reason}))].map(row=><Pressable key={row.id} accessibilityRole="button" onPress={()=>router.push(`/bill/${row.id}` as never)} style={{minHeight:54,gap:4,paddingVertical:spacing.sm,borderTopWidth:1,borderColor:colors.border}}><Text style={[typography.body,{color:colors.primary}]}>{row.start} – {row.end}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{row.detail}</Text></Pressable>):null}
    </View>:null}
  </View>;
}

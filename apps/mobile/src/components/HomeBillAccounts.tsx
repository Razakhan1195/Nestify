import {useState} from "react";
import {useRouter} from "expo-router";
import {Text,View} from "react-native";
import {BriefRow,QuietAction} from "@/components/Brief";
import type {BillsPayload} from "@/lib/bills-data";
import {formatDueDate} from "@/lib/bills-data";
import {homeBillAccounts} from "@/lib/home-bill-accounts";
import {localDay} from "@/lib/home-start";
import {colors,typography} from "@/theme/tokens";

export function HomeBillAccounts({bills}:{bills:Exclude<BillsPayload,{needsOnboarding:true}>}){
 const router=useRouter(),[expanded,setExpanded]=useState(false);
 const accounts=homeBillAccounts(bills.bills,bills.historyCoverage?.complete===true,localDay());
 if(!accounts.length)return null;
 return <View style={{gap:8}}>
  <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{bills.utilityInsights.length?"Uploaded bill insights":"Your bill insights"}</Text>
  <Text style={[typography.meta,{color:colors.mutedForeground}]}>Each account has its own history. One statement is enough to start understanding your bill.</Text>
  {(expanded?accounts:accounts.slice(0,3)).map(account=><BriefRow key={account.key}
   title={account.provider+" · "+account.category}
   detail={[account.nickname+" · "+account.count+" saved "+(account.count===1?"statement":"statements"),account.finding,account.latestEnd?("Latest period ended "+formatDueDate(account.latestEnd)+(account.stale?" · Add a recent statement to update this view":"")):null,account.ready&&account.gaps?"Some periods are missing; this is not a complete spending total.":null].filter(Boolean).join("\n")}
   value={account.action}
   onPress={()=>account.destination==="bill"?router.push(("/bill/"+account.billId) as never):router.push({pathname:account.destination==="review"?"/bill/review":"/bill/history-insights",params:{billId:account.billId}})}/>)}
  {accounts.length>3?<QuietAction label={expanded?"Show fewer accounts":"Show all "+accounts.length+" accounts"} onPress={()=>setExpanded(v=>!v)}/>:null}
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>Based on uploaded or manually entered statements. Kept separate from connected-provider history.</Text>
 </View>;
}

import { TelecomBillInsights } from "./TelecomBillInsights";
import { SavedBillInsights } from "./SavedBillInsights";
import {analyzeManualHistory,manualHistoryAccounts,historyIssueCopy} from "@/lib/manual-history-insights";
import {useState} from "react";
import {useRouter} from "expo-router";
import {Text,View} from "react-native";
import {InsightAccountPicker} from "./InsightAccountPicker";
import {BillAccountInsight} from "./BillAccountBrief";
import {BriefRow,QuietAction} from "./Brief";
import {billAccountOverview} from "@/lib/bill-account-overview";
import {selectedInsightAccount} from "@/lib/collection-navigation";
import type {BillsPayload} from "@/lib/bills-data";
import {localDay} from "@/lib/home-start";
import {explainStatement} from "@/lib/statement-evidence";
import {colors,typography} from "@/theme/tokens";

export function BillInsights({bills,fresh}:{bills:Exclude<BillsPayload,{needsOnboarding:true}>;fresh:boolean}){
 const router=useRouter(),accounts=billAccountOverview(bills,localDay(),fresh);
 const [selected,setSelected]=useState<string|null>(()=>accounts[0]?.key??null);
 const account=selectedInsightAccount(accounts,selected);
 const connection=account?.latest?.source!=="manual"?bills.providerActivity.find(item=>item.providerId===account?.providerId):undefined;
 const history=account?.latest?.source==="manual"?manualHistoryAccounts(bills.bills).find(h=>h.bills.some(b=>b.id===account.latest?.id)):undefined;
 const analysis=history?analyzeManualHistory(history,{today:localDay(),complete:fresh&&bills.historyCoverage?.complete===true}):null;
 const blocked=analysis?.issues.find(issue=>issue!=="history");
 const evidence=account?.latest?.reviewedEvidence;
 const explanation=account?.latest&&evidence&&account.currency==="CAD"?explainStatement({amount:account.latest.amount,category:account.category,periodStart:account.latest.billingPeriodStart,periodEnd:account.latest.billingPeriodEnd},evidence):null;
 return <View style={{gap:18}}>
  {accounts.length>1||!account&&accounts.length?<InsightAccountPicker accounts={accounts} selected={selected??accounts[0].key} onSelect={setSelected}/>:null}
  {!account?<View style={{gap:12}}>
   <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{accounts.length?"Choose another account":"No bill analysis yet"}</Text>
   <Text style={[typography.body,{color:colors.mutedForeground}]}>{accounts.length?"The selected account is no longer available. Choose an account above to see its own information.":"Your connection has no saved bill to analyse yet. You can upload a statement or check the connection."}</Text>
   {!accounts.length?<><QuietAction label="Upload a statement" onPress={()=>router.push("/bill/batch")}/><QuietAction label="Check connections" onPress={()=>router.push("/provider")}/></>:null}
  </View>:account.latest?.source==="deck"?<>
   <TelecomBillInsights key={account.key} bills={bills.bills} billId={account.latest.id} today={localDay()} complete={fresh&&bills.historyCoverage?.complete===true} showIdentity={accounts.length<=1} onOpen={id=>router.push(`/bill/${id}`)}/>
   {connection?<BriefRow title={connection.state==="syncing"?"Update in progress":"Connection needs attention"} detail={connection.message+" Saved statements remain available."} onPress={()=>router.push(connection.mobileHref as never)}/>:null}
  </>:history?<SavedBillInsights key={history.key} account={history} complete={fresh&&bills.historyCoverage?.complete===true} today={localDay()} showIdentity={accounts.length<=1} onOpen={id=>router.push(`/bill/${id}`)} onDetails={(id,read)=>router.push({pathname:"/bill/statement-details",params:{billId:id,...(read?{intent:"read"}:{})}})} onAdd={()=>router.push("/bill/batch")} onTrack={id=>router.push({pathname:"/bill/outcome",params:{billId:id}})}/>:<>
   <View style={{paddingHorizontal:18,paddingVertical:4,borderRadius:18,backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.border}}>
    <BillAccountInsight account={account}/>
   </View>
   {connection?<BriefRow title={connection.state==="syncing"?"Update in progress":"Connection needs attention"} detail={connection.message+" Saved statements remain available."} onPress={()=>router.push(connection.mobileHref as never)}/>:null}
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>{account.sourceLabel} · {account.count} saved {account.count===1?"record":"records"}{account.stale?" · Older history":""}</Text>
   {!fresh||bills.historyCoverage?.complete!==true?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Full saved history could not be confirmed. Comparisons are withheld; saved details remain available.</Text>:null}
   {blocked&&(blocked==="ongoing"||account.count>1&&!account.chart.length)?<Text style={[typography.body,{color:colors.mutedForeground}]}>{historyIssueCopy[blocked]}</Text>:null}
   {explanation&&account.count===1?<View style={{gap:10}}>
    <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>What this statement tells you</Text>
    {explanation.facts.slice(0,2).map(fact=><Text key={fact} style={[typography.body,{color:colors.foreground}]}>{fact}</Text>)}
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{explanation.next}</Text>
   </View>:null}
   {account.latest?.source==="manual"&&account.count===1&&!["draft","incomplete"].includes(account.latest.status??"")?<View style={{gap:8}}>
    {!explanation&&blocked!=="ongoing"?<Text style={[typography.body,{color:colors.mutedForeground}]}>One statement explains this period’s charges. Add an earlier bill for this same account to compare changes; a saving cannot be established from this amount alone.</Text>:null}
    <QuietAction label="Add an earlier statement" onPress={()=>router.push({pathname:"/bill/add",params:{recordKind:"historical",providerName:account.provider,category:account.category,accountName:account.latest?.accountNumber??""}})}/>
   </View>:null}
  </>}
 </View>;
}

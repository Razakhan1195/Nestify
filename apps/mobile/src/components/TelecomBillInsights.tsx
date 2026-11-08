import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Linking, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { QuietAction } from "./Brief";
import { useRouter } from "expo-router";
import { ProviderBrand } from "./ProviderBrand";
import { Surface } from "./ui/Surface";
import { Button } from "./Button";
import { InsightStat } from "./BillInsightPrimitives";
import { StatementBarChart } from "./StatementBarChart";
import { apiGet, ApiError } from "@/lib/api";
import { formatDueDate } from "@/lib/bills-data";
import { analyzeTelecom, telecomBreakdown, telecomMoney, type TelecomInsightBill } from "@/lib/telecom-insights";
import { spacing, typography } from "@/theme/tokens";

function ChargeRow({label,value,strong=false}:{label:string;value:string;strong?:boolean}) {
  const { colors } = useTheme();

 const {width,fontScale} = useWindowDimensions(), stack=width<350||fontScale>1.3;
 return <View style={{flexDirection:stack?"column":"row",gap:6,justifyContent:"space-between",paddingVertical:6}}>
  <Text style={[typography.body,{flex:stack?undefined:1,color:colors.foreground,fontWeight:strong?"600":"400"}]}>{label}</Text>
  <Text style={[typography.body,{color:colors.foreground,fontWeight:strong?"600":"400",fontVariant:["tabular-nums"],maxWidth:stack?undefined:"42%",textAlign:stack?"left":"right"}]}>{value}</Text>
 </View>;
}
function Heading({children}:{children:string}) {
  const { colors } = useTheme();

 return <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{children}</Text>;
}
export function TelecomStatementBreakdown({bill}:{bill:TelecomInsightBill}) {
  const { colors } = useTheme();

 const [expanded,setExpanded]=useState(false), breakdown=telecomBreakdown(bill);
 const money=(n:number)=>telecomMoney(n,bill.currency), details=bill.telecomDetails;
 return <View style={{gap:8}}>
  <Heading>How this bill adds up</Heading>
  {breakdown.charged.map((line,i)=><ChargeRow key={i} label={line.label} value={money(line.amount)}/>)}
  {breakdown.taxSeparate?<View style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:6}}>
   <ChargeRow label="After charges and credits, before tax" value={money(breakdown.subtotal)}/>
   <ChargeRow label="Tax on this statement" value={money(breakdown.taxAmount!)}/>
  </View>:null}
  {!breakdown.charged.length?<>
   {details?.discounts.map((d,i)=><ChargeRow key={"discount-"+i} label={d.label+" · credit"} value={money(-Math.abs(d.amount))}/>)}
   {details?.fees.map((fee,i)=><ChargeRow key={"fee-"+i} label={fee.label} value={money(fee.amount)}/>)}
  </>:null}
  {typeof bill.amount==="number"?<View style={{borderTopWidth:1,borderTopColor:colors.borderStrong,paddingTop:6}}><ChargeRow label="Statement total" value={money(bill.amount)} strong/></View>:null}
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>{breakdown.reconciled?"These charges and credits add up to the statement total.":"The captured lines do not provide a complete breakdown of the total. Check the original for the remaining detail."} This is the billed amount, not confirmation of payment.</Text>
  {breakdown.included.length?<View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:8,paddingVertical:10}}>
    <Text style={[typography.meta,{flex:1,color:colors.primary,fontWeight:"600"}]}>Also listed at $0 · {breakdown.included.length}</Text>
    <Feather name={expanded?"chevron-up":"chevron-down"} size={18} color={colors.primary}/>
   </Pressable>
   {expanded?breakdown.included.map((line,i)=><ChargeRow key={i} label={line.label} value={money(0)}/>):null}
  </View>:null}
 </View>;
}

export function TelecomBillInsights({bills,billId,today,complete,onOpen,showIdentity=true}:{bills:TelecomInsightBill[];billId:string;today:string;complete:boolean;onOpen:(id:string)=>void;showIdentity?:boolean}) {
  const { colors } = useTheme();

 const router=useRouter(),story=analyzeTelecom(bills,billId,today,complete),latest=story.latest;
 const [detailsOpen,setDetailsOpen]=useState(false),[opening,setOpening]=useState(false),[error,setError]=useState<string|null>(null);
 if(!latest) return <Text style={[typography.body,{color:colors.mutedForeground}]}>This account’s saved statement is unavailable. Return to Bills to choose an account.</Text>;
 const money=(n:number)=>telecomMoney(n,latest.currency), breakdown=telecomBreakdown(latest);
 const discounts=latest.telecomDetails?.discounts.filter(d=>Math.abs(d.amount)>0)??[];
 const provider=latest.providerName??latest.label;
 const period=latest.billingPeriodStart&&latest.billingPeriodEnd?formatDueDate(latest.billingPeriodStart)+" – "+formatDueDate(latest.billingPeriodEnd):"Service period not captured";
 const recent=story.safe?story.rows.slice(0,12):[],values=recent.map(b=>b.amount!);
 const total=values.reduce((sum,n)=>sum+Math.round(n*100),0)/100;
 const highest=values.length?Math.max(...values):null;
 const highestRows=highest!==null?recent.filter(b=>b.amount===highest):[];
 const latest3=values.slice(0,3).reduce((sum,n)=>sum+n,0),previous3=values.slice(3,6).reduce((sum,n)=>sum+n,0);
 const recentDelta=values.length>=6&&previous3>0?Math.round((latest3/previous3-1)*100):null;
 const stats=[
  {label:"STATEMENT AVERAGE",value:values.length?money(total/values.length):"—",detail:values.length+" "+(values.length===1?"amount":"amounts")+" in the latest "+recent.length+" saved "+(recent.length===1?"statement":"statements")},
  {label:"STATEMENT TOTAL",value:values.length?money(total):"—",detail:"Saved statement amounts; not annual spending"},
  {label:"HIGHEST BILL",value:highest!==null?money(highest):"—",detail:highestRows.length>1?"Same amount on "+highestRows.length+" statements":highestRows[0]?.issueDate?formatDueDate(highestRows[0].issueDate):"Not enough history"},
  {label:"RECENT AMOUNTS",value:recentDelta===null?"Not enough history":recentDelta===0?"About the same":Math.abs(recentDelta)+"% "+(recentDelta>0?"up":"down"),detail:"Last 3 vs previous 3 statements; periods may differ"},
 ];
 const assistantPrompt=[
  "Help me understand my saved "+provider+" bill, issued "+latest.issueDate+".",
  "Statement amount: "+(latest.amount!==null?money(latest.amount):"unknown")+". "+story.headline+". "+story.detail,
  ...breakdown.charged.map(l=>l.label+": "+money(l.amount)+"."),
  ...(breakdown.taxAmount!==null?["Printed tax: "+money(breakdown.taxAmount)+"."]:[]),
  ...discounts.map(d=>d.label+": "+money(Math.abs(d.amount))+" credit. End date: "+(d.endsOn??"not captured")+"."),
  "Use these statement facts. Explain any useful next step. Do not infer a current balance, payment status, expiry date, usage, market offer or guaranteed savings."
 ].join(" ");
 async function openOriginal(){
  if(opening||!latest)return;setOpening(true);setError(null);
  try{const result=await apiGet<{url:string}>(`/api/mobile/v1/bills/${latest.id}/original`,{timeoutMs:15000});await Linking.openURL(result.url);}
  catch(e){setError(e instanceof ApiError?e.message:"Could not open the original. Try again.");}
  finally{setOpening(false);}
 }
 return <View style={{gap:spacing["2xl"]}}>
  <Surface tone="raised" style={{gap:spacing.lg}}>
   {showIdentity?<View style={{flexDirection:"row",alignItems:"flex-start",gap:spacing.md}}>
    <ProviderBrand provider={provider} category={latest.categoryId}/>
    <View style={{flex:1,gap:4}}>
     <Text accessibilityRole="header" style={[typography.heading,{color:colors.foreground}]}>{provider}</Text>
     <View style={{flexDirection:"row",flexWrap:"wrap",gap:7,alignItems:"center"}}>
      <View style={{borderRadius:100,backgroundColor:colors.successBg,paddingHorizontal:9,paddingVertical:4}}><Text style={{fontSize:10,fontWeight:"800",color:colors.successForeground}}>SAVED PROVIDER BILLS</Text></View>
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>{story.rows.length} {story.rows.length===1?"statement":"statements"}</Text>
     </View>
    </View>
   </View>:null}
   <View style={{gap:4}}>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>{latest.telecomDetails?"LATEST STATEMENT CHARGES":"LATEST SAVED AMOUNT"}</Text>
    <Text style={{fontSize:38,lineHeight:44,fontWeight:"800",color:colors.foreground}}>{latest.amount!==null?money(latest.amount):"—"}</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{period}</Text>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>{latest.currency}{latest.issueDate?" · Issued "+formatDueDate(latest.issueDate):""}{latest.accountNumber?" · Account ending "+latest.accountNumber.slice(-4):""}</Text>
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>Saved statement amount. Payment status is separate.</Text>
   </View>
   <Pressable accessibilityRole="button" onPress={()=>onOpen(latest.id)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:6}}>
    <Text style={{fontSize:13.5,fontWeight:"800",color:colors.primary}}>View latest statement</Text><Feather name="arrow-right" size={14} color={colors.primary}/>
   </Pressable>
  </Surface>
  <Surface tone="subtle" style={{gap:spacing.md}}>
   <Heading>What changed</Heading>
   <Text style={[typography.body,{color:colors.foreground}]}>{story.headline}</Text>
   <Text style={[typography.body,{color:colors.mutedForeground}]}>{story.detail}</Text>
   {story.lineChanges.map((line,i)=><ChargeRow key={i} label={line.label} value={money(line.previous)+" → "+money(line.current)}/>)}
  </Surface>
  <View style={{flexDirection:"row",flexWrap:"wrap",gap:spacing.sm}}>{stats.map(stat=><InsightStat key={stat.label} {...stat}/>)}</View>
  <View style={{gap:spacing.md}}>
   <View style={{gap:spacing.xs}}><Heading>Bill trend</Heading><Text style={[typography.caption,{color:colors.mutedForeground}]}>{story.chart.length} saved {story.chart.length===1?"amount":"amounts"} · Tap a bar to explore</Text></View>
   {story.chart.length?<Surface tone="subtle" style={{gap:spacing.md}}>
    <StatementBarChart points={story.chart.map(p=>({id:p.id,label:new Intl.DateTimeFormat("en-CA",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(p.date+"T12:00:00Z")),period:"Issued "+formatDueDate(p.date),value:p.amount,formattedValue:money(p.amount)+" "+latest.currency,detail:latest.telecomDetails?"Statement total including tax · payment status is separate":"Recorded statement amount"}))} onOpen={onOpen}/>
   </Surface>:<Surface tone="subtle"><Text style={[typography.body,{color:colors.mutedForeground}]}>A comparable history isn’t available yet. Your saved statements remain below.</Text></Surface>}
  </View>
  {latest.outcomeKind || story.rows.some(row=>row.outcomeSummary) ? <QuietAction label={story.rows.some(row=>row.outcomeSummary)?"View tracked bill change":"Track an agreed price change"} onPress={()=>router.push({pathname:"/bill/outcome",params:{billId:story.rows.find(row=>row.outcomeSummary)?.id??latest.id}})}/> : null}
  <Button label="Ask Rezlee about this bill" onPress={()=>router.push(("/assistant?q="+encodeURIComponent(assistantPrompt)) as never)}/>
  {latest.telecomDetails?<Surface style={{gap:spacing.md}}>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:detailsOpen}} onPress={()=>setDetailsOpen(v=>!v)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:8}}>
    <Text style={[typography.section,{flex:1,color:colors.foreground}]}>Charges & original statement</Text><Feather name={detailsOpen?"chevron-up":"chevron-down"} size={18} color={colors.primary}/>
   </Pressable>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>{breakdown.reconciled?"See the plan, credits and taxes behind this amount.":"Review the available charge lines and original bill."}</Text>
   {detailsOpen?<TelecomStatementBreakdown key={latest.id} bill={latest}/>:null}
   {latest.originalDocumentId?<QuietAction label={opening?"Opening original…":"Open latest original PDF"} disabled={opening} onPress={()=>void openOriginal()}/>:null}
   {error?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text>:null}
  </Surface>:null}
  {discounts.length?<Surface tone="subtle" style={{gap:spacing.md}}>
   <Heading>Your promotional credits</Heading>
   {discounts.map((d,i)=><View key={i} style={{gap:6}}>
    <Text style={[typography.body,{fontWeight:"600",color:colors.foreground}]}>{money(Math.abs(d.amount))} credit{breakdown.taxSeparate?" before tax":""} · {d.label}</Text>
    <Text style={[typography.body,{color:colors.mutedForeground}]}>{d.endsOn?"End date recorded: "+formatDueDate(d.endsOn):"The saved statement details don’t include an end date."}</Text>
    {!d.endsOn?<Text selectable style={[typography.body,{color:colors.foreground}]}>Ask {provider}: “When does my {money(Math.abs(d.amount))} credit end, and what will my price be then?”</Text>:null}
   </View>)}
  </Surface>:null}
  <View style={{gap:spacing.md}}>
   <View style={{gap:3}}><Heading>Statement history</Heading><Text style={[typography.caption,{color:colors.mutedForeground}]}>Saved statements are also available in Bills.</Text></View>
   <Surface padded={false}>{story.rows.map((b,i)=><Pressable key={b.id} accessibilityRole="button" onPress={()=>onOpen(b.id)} style={({pressed})=>({minHeight:62,flexDirection:"row",alignItems:"center",gap:spacing.md,padding:spacing.lg,borderBottomWidth:i<story.rows.length-1?1:0,borderBottomColor:colors.border,opacity:pressed?0.68:1})}>
    <View style={{flex:1,gap:2}}><Text style={{fontSize:14,fontWeight:"700",color:colors.foreground}}>{b.issueDate?formatDueDate(b.issueDate):"Date not captured"}</Text><Text style={[typography.caption,{color:colors.mutedForeground}]}>{b.billingPeriodStart&&b.billingPeriodEnd?formatDueDate(b.billingPeriodStart)+" – "+formatDueDate(b.billingPeriodEnd):"Saved statement"}{b.originalDocumentId?" · PDF saved":""}</Text></View>
    <Text style={{fontSize:14,fontWeight:"800",color:colors.foreground,maxWidth:"35%"}}>{b.amount!==null?money(b.amount):"—"}</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground}/>
   </Pressable>)}</Surface>
  </View>
  {latest.providerId?<Button label="Manage provider connection" variant="secondary" onPress={()=>router.push(("/provider/"+latest.providerId) as never)}/>:null}
 </View>;
}

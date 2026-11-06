import { useMemo } from "react";
import { ProviderBrand } from "@/components/ProviderBrand";
import {billAmountLabel} from "@/lib/provider-identity";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { SectionHeading } from "@/components/WorkspaceUI";
import { billAccountOverview, billAccountCoverageLabel, featuredBillAccounts, latestBillAccounts, type BillAccountOverview } from "@/lib/bill-account-overview";
import type { BillsPayload } from "@/lib/bills-data";
import { formatDueDate } from "@/lib/bills-data";
import { localDay } from "@/lib/home-start";
import { historyDate } from "@/lib/manual-history-insights";
import { colors, homeTile, typography } from "@/theme/tokens";

type SavedBills = Exclude<BillsPayload, { needsOnboarding: true }>;
function Brand({account}:{account:BillAccountOverview}){return <ProviderBrand provider={account.provider} category={account.categoryId}/>;}
function period(account: BillAccountOverview) {
  const start = account.latest?.billingPeriodStart, end = account.latest?.billingPeriodEnd;
  return historyDate(start ?? null) && historyDate(end ?? null) ? `${formatDueDate(start!)} – ${formatDueDate(end!)}` : "Billing period not recorded";
}
function amount(account: BillAccountOverview) {
  const value = account.latest?.amount;
  if (typeof value !== "number" || !Number.isFinite(value)) return "Amount unavailable";
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency: account.currency }).format(value); }
  catch { return "Check currency"; }
}

export function BillAccountInsight({ account, secondary = false }: { account: BillAccountOverview; secondary?: boolean }) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const chart = account.chart.length > 1 && !secondary && fontScale <= 1.3;
  const max = Math.max(1, ...account.chart.map(p => p.amount));
  return <Pressable accessibilityRole="button" onPress={() => router.push(account.href as never)}
    style={({ pressed }) => ({ backgroundColor: pressed ? colors.accent : "transparent", borderRadius: 0, padding: 0, paddingVertical: 14, borderBottomWidth: secondary ? 1 : 0, borderBottomColor: colors.border, gap: 11 })}>
    <Text style={[typography.caption, { color: colors.mutedForeground, fontWeight: "600" }]}>Bill insight · {account.provider} · {account.category}</Text>
    {account.accountLabel ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{account.accountLabel}</Text> : null}
    <Text accessibilityRole="header" style={[secondary ? typography.section : typography.title, { color: colors.foreground }]}>{account.title}</Text>
    <Text style={[typography.body, { color: colors.foreground }]}>{account.detail}</Text>
    {!secondary ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>Latest period · {period(account)}</Text> : null}
    {chart ? <View accessible accessibilityLabel={account.chart.map(p => `${formatDueDate(p.label)}: ${new Intl.NumberFormat("en-CA", { style: "currency", currency: account.currency }).format(p.amount)}`).join(". ")} style={{ gap: 10, marginTop: 2 }}>
      {account.chart.slice(-3).map(point => <View key={point.label} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Text style={[typography.caption, { color: colors.mutedForeground, width: 65 }]}>{new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(point.label + "T12:00:00Z"))}</Text>
        <View style={{ flex: 1 }}><View style={{ height: 8, borderRadius: 2, width: `${Math.max(0, point.amount / max * 100)}%`, backgroundColor: colors.primary, opacity: point === account.chart[account.chart.length - 1] ? 1 : 0.4 }} /></View>
        <Text style={[typography.caption, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{new Intl.NumberFormat("en-CA", { style: "currency", currency: account.currency }).format(point.amount)}</Text>
      </View>)}
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>Statement amounts · {account.chartDateBasis === "issued" ? "issued on these dates" : "periods ending on these dates"}</Text>
    </View> : null}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 30 }}><Text style={[typography.meta, { flex: 1, fontWeight: "600", color: colors.primary }]}>{account.action}</Text><Feather name="arrow-up-right" size={18} color={colors.primary} /></View>
  </Pressable>;
}

export function HomeBillBrief({ bills, fresh = true, showAccountsLink = true, showChange = true, accounts: suppliedAccounts }: { bills: SavedBills; fresh?: boolean; showAccountsLink?: boolean; showChange?: boolean; accounts?: BillAccountOverview[] }) {
  const router = useRouter();
  const {width,fontScale}=useWindowDimensions();
  const stacked=fontScale>1.2||width<360;
  const today = localDay();
  const accounts = useMemo(() => suppliedAccounts ?? billAccountOverview(bills, today, fresh), [suppliedAccounts, bills, today, fresh]);
  const featured = useMemo(() => featuredBillAccounts(accounts), [accounts]);
  const latestAccounts = useMemo(() => latestBillAccounts(accounts), [accounts]);
  if (!featured.length) return null;
  const comparisons = featured.filter(account => account.priority >= 2);
  // Bills already lists every account below. A routine saved statement is not an insight.
  if (!showAccountsLink && !comparisons.length) return null;
  const complete = bills.historyCoverage?.complete === true;
  if (!showAccountsLink) return <View style={{gap:12}}>{comparisons.map(account=><BillAccountInsight key={account.key} account={account}/>)}</View>;
  return <View style={{gap:homeTile.groupGap}}>
    <View style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",columnGap:16,rowGap:0}}>
      <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Your latest bills</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={billAccountCoverageLabel(accounts,complete)} onPress={()=>router.push({pathname:"/(tabs)/bills",params:{section:"overview"}})} style={({pressed})=>({minHeight:44,minWidth:44,flexDirection:"row",alignItems:"center",gap:4,opacity:pressed?0.6:1})}>
        <Text style={[typography.meta,{color:colors.primary,fontWeight:"600"}]}>View all</Text>
        <Feather name="chevron-right" size={16} color={colors.primary}/>
      </Pressable>
    </View>
    {latestAccounts.map(account=>{
      const hasAmount=typeof account.latest?.amount==="number"&&Number.isFinite(account.latest.amount);
      const importing = bills.providerActivity.some(item => item.providerId === account.providerId && item.state === "syncing");
      const amountLabel=billAmountLabel(account.latest?.isHistoricalStatement===true,account.latest?.amount);
      const draft=["draft","incomplete"].includes(account.latest?.status??"");
      // Generic extraction categories do not help identify a household's account.
      const category=["multiple","other","unknown","uncategorized"].includes(account.category.trim().toLowerCase())?"":account.category;
      const context=[category,account.accountLabel].filter(Boolean).join(" · ");
      return <Pressable key={account.key} accessibilityRole="button" accessibilityLabel={[account.provider,context,account.latest ? amountLabel : "",account.latest ? amount(account) : "Awaiting statements",account.latest ? period(account) : "No saved statement yet",importing ? "Import in progress" : "",draft?"Draft":account.stale?"Older statement":"",account.priority>=2?account.title:"","Open account details"].filter(Boolean).join(". ")} onPress={()=>router.push(account.href as never)} style={({pressed})=>({borderRadius:homeTile.radius,backgroundColor:colors.surfaceWhite,padding:homeTile.padding,gap:homeTile.gap,opacity:pressed?0.8:1})}>
        <View style={{flexDirection:stacked?"column":"row",alignItems:stacked?"stretch":"flex-start",gap:12}}>
          <View style={{flex:stacked?undefined:1,gap:4}}>
            <ProviderBrand provider={account.provider} category={account.categoryId} identity compact/>
            {context?<Text style={[typography.caption,{lineHeight:16,color:colors.mutedForeground}]}>{context}</Text>:null}
          </View>
          <View style={{maxWidth:stacked?undefined:"46%",gap:2,alignItems:stacked?"flex-start":"flex-end"}}>
            <Text style={[hasAmount?typography.title:typography.meta,{color:colors.foreground,fontVariant:["tabular-nums"],textAlign:stacked?"left":"right"}]}>{account.latest ? amount(account) : "Awaiting statements"}</Text>
            <Text style={[typography.caption,{lineHeight:16,color:colors.mutedForeground,textAlign:stacked?"left":"right"}]}>{account.latest ? amountLabel : "No saved statement yet"}{hasAmount?" · "+account.currency:""}</Text>
          </View>
        </View>
        <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
          <Text style={[typography.caption,{lineHeight:16,flex:1,color:colors.mutedForeground}]}>{account.latest ? period(account) : "View provider details"}</Text>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground}/>
        </View>
        {importing ? <Text accessibilityLiveRegion="polite" style={[typography.caption,{lineHeight:16,color:colors.primary}]}>{account.latest ? "Importing more statements · Saved bills are available" : "Import in progress"}</Text> : null}
        {draft||account.stale?<Text style={[typography.caption,{lineHeight:16,color:colors.mutedForeground}]}>{draft?"Draft · Review details":"Older statement"}</Text>:null}
        {showChange&&account.priority>=2?<Text style={[typography.meta,{color:colors.primary,fontWeight:"600"}]}>{account.title}</Text>:null}
      </Pressable>;
    })}
    <Text style={[typography.caption,{lineHeight:16,color:colors.mutedForeground}]}>Separate account periods · not a monthly total</Text>
    {!complete?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Some saved history could not be loaded. Account coverage may be incomplete.</Text>:null}
  </View>;
}

export function BillsAccountList({ bills, fresh = true, showConnectionsAction = true }: { bills: SavedBills; fresh?: boolean; showConnectionsAction?: boolean }) {
  const router = useRouter(), { fontScale, width } = useWindowDimensions();
  const today = localDay();
  const accounts = useMemo(() => billAccountOverview(bills, today, fresh), [bills, today, fresh]);
  const stack = fontScale > 1.2 || width < 360;
  if (!accounts.length) return null;
  return <View>
    <SectionHeading title="Your bill accounts" action={showConnectionsAction ? "Connections" : undefined} onPress={showConnectionsAction ? () => router.push("/provider") : undefined} />
    <Text style={[typography.meta, { color: colors.mutedForeground }]}>Latest saved record for each account</Text>
    {accounts.map(account => <Pressable key={account.key} accessibilityRole="button" onPress={() => router.push(account.href as never)} style={({ pressed }) => ({ paddingVertical: 18, gap: 10, backgroundColor: pressed ? colors.surfaceSubtle : "transparent", borderBottomWidth: 1, borderBottomColor: colors.border })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Brand account={account} /><View style={{ flex: 1, gap: 3 }}>
        <Text style={[typography.section, { color: colors.foreground }]}>{account.provider}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{account.category}{account.accountLabel ? ` · ${account.accountLabel}` : ""}</Text>
        {stack ? <Text style={[typography.section, { color: colors.foreground }]}>{amount(account)}</Text> : null}
      </View>{!stack ? <Text style={[typography.section, { color: colors.foreground, maxWidth: "40%", fontVariant: ["tabular-nums"] }]}>{amount(account)}</Text> : null}</View>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{period(account)} · {account.count} saved {account.count === 1 ? "record" : "records"}</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{account.sourceLabel}{account.stale ? " · Older statement" : ""}</Text>
      {bills.providerActivity.filter(activity => activity.providerId === account.providerId).map(activity => <Text key={activity.providerId} style={[typography.meta, { color: colors.warningForeground }]}>{activity.state === "syncing" ? "Update in progress" : "Connection needs attention"} · Saved records remain available</Text>)}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Text style={[typography.meta, { flex: 1, color: colors.primary, fontWeight: "600" }]}>{account.action}</Text><Feather name="chevron-right" size={17} color={colors.primary} /></View>
    </Pressable>)}
    <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 12 }]}>Accounts can cover different periods. These amounts are not a monthly household total. Uploaded and connected histories stay separate until their identity is confirmed.</Text>
  </View>;
}

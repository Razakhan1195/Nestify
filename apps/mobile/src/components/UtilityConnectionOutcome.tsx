import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { fetchBills, formatDueDate, type BillsPayload } from "@/lib/bills-data";
import { colors, spacing, typography } from "@/theme/tokens";

export function UtilityConnectionOutcome({ providerIds }: { providerIds?: string[] } = {}) {
  const router = useRouter();
  const [data, setData] = useState<BillsPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setState("loading"); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    void fetchBills().then(result => {
      if (active) { setData(result); setState("ready"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt]);
  if (state === "loading") return <View style={{gap:spacing.sm}}><ActivityIndicator color={colors.primary}/><Text style={[typography.body,{color:colors.mutedForeground}]}>Finding your saved utility history…</Text></View>;
  if (state === "error") return <Surface style={{gap:spacing.md}}>
    <Text style={[typography.body,{color:colors.foreground}]}>The connection finished, but this summary couldn’t load. Your saved bills remain in Bills.</Text>
    <Button label="Retry summary" variant="secondary" onPress={retry}/>
  </Surface>;
  const payload = data && !data.needsOnboarding ? data : null;
  const accounts = payload?.utilityInsights.filter(account => (!providerIds || providerIds.includes(account.providerId)) && payload.bills.some(bill => bill.providerId === account.providerId && bill.source === "ezgb")) ?? [];
  return <View style={{gap:spacing.md}}>
    <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Your saved utility history</Text>
    {!accounts.length ? <Surface><Text style={[typography.body,{color:colors.mutedForeground}]}>No bill history is available in this summary yet. Review the connection in Bills. Authorization alone does not mean bills or interval readings have arrived.</Text></Surface> : accounts.slice(0,3).map(account => {
      const bill = payload?.bills.find(row => row.id === account.latestBillId);
      const amount = bill?.amount;
      return <Surface key={account.providerId} tone="subtle" style={{gap:spacing.sm}}>
        <Text style={[typography.section,{color:colors.foreground}]}>{account.providerName}</Text>
        <Text style={[typography.body,{color:colors.foreground}]}>{typeof amount === "number" && Number.isFinite(amount) ? new Intl.NumberFormat("en-CA",{style:"currency",currency:/^[A-Z]{3}$/.test(bill?.currency ?? "") ? bill!.currency : "XXX"}).format(amount) + " · latest recorded bill" : "Latest saved period"}</Text>
        {bill?.billingPeriodStart && bill.billingPeriodEnd ? <Text style={[typography.caption,{color:colors.mutedForeground}]}>{formatDueDate(bill.billingPeriodStart)} – {formatDueDate(bill.billingPeriodEnd)}</Text> : null}
        <Text style={[typography.body,{color:colors.mutedForeground}]}>{account.statementCount} saved statement{account.statementCount===1?"":"s"}. {account.statementCount>1?"Open your history to compare recorded costs across periods.":"Review this bill now. Another comparable period will help show what changed."}</Text>
        <Button label={account.statementCount>1?"Explore bill history":"Review this utility"} variant="secondary" onPress={()=>router.replace({pathname:"/utility/[providerId]",params:{providerId:account.providerId}})}/>
      </Surface>;
    })}
    {accounts.length>3?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Find all {accounts.length} utility accounts in Bills.</Text>:null}
    <Text style={[typography.caption,{color:colors.mutedForeground}]}>These are saved records, including earlier imports. Usage detail depends on what your utility supplied. Scheduled monthly updates remain off; use Bills to refresh when needed.</Text>
  </View>;
}

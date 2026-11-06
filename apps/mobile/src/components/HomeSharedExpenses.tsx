import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {HomeFeatureTile} from "./HomeFeatureTile";
import { ReadNotice } from "@/components/Brief";
import { fetchSharedExpenses } from "@/lib/shared-expenses";
import type { SharedPayload } from "@/lib/shared-expense-types";
import { sharedLedgerStage } from "@/lib/shared-ledger-presentation";
import { sharedMoney } from "@/lib/shared-expense-math";
import { colors, homeTile, typography } from "@/theme/tokens";

export function HomeSharedExpenses({ homeId }: { homeId: string }) {
  const router = useRouter(), request = useRef(0);
  const [data, setData] = useState<SharedPayload | null>(null);
  const [busy, setBusy] = useState(true), [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const version = ++request.current; setBusy(true);
    try {
      const next = await fetchSharedExpenses();
      if (version !== request.current) return;
      if (next.home.id !== homeId) { setData(null); setFailed(true); return; }
      setData(next); setFailed(false);
    } catch { if (version === request.current) setFailed(true); }
    finally { if (version === request.current) setBusy(false); }
  }, [homeId]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  if (!data) return failed ? <ReadNotice message="Shared expenses couldn’t be checked." busy={busy} onRetry={() => void load()} /> : <ActivityIndicator accessibilityLabel="Checking shared expenses" color={colors.primary} />;
  const stage = sharedLedgerStage(data);
  const self = data.people.find(person => person.self)?.id;
  const owe = data.balances.filter(pair => pair.from === self).reduce((sum, pair) => sum + pair.cents, 0);
  const owed = data.balances.filter(pair => pair.to === self).reduce((sum, pair) => sum + pair.cents, 0);
  const pending = data.people.filter(person => person.state === "invited").length;
  if(stage === "start") return <View style={{gap:10}}>
    <HomeFeatureTile title="Shared expenses" detail="Split rent, groceries or bills. Know who paid and who owes what." action="Start sharing costs" artwork="shared" backgroundColor={colors.billSurface} onPress={()=>router.push("/shared")}/>
    {pending?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{pending} {pending===1?"invitation":"invitations"} awaiting acceptance. Shares don’t grant household access.</Text>:null}
    {failed?<ReadNotice message="Couldn’t refresh shared expenses. Showing the last loaded information." busy={busy} onRetry={()=>void load()}/>:null}
  </View>;
  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Shared expenses. View household costs and balances" onPress={() => router.push("/shared")} style={({ pressed }) => ({ padding: homeTile.padding, borderRadius: homeTile.radius, gap: homeTile.gap, backgroundColor: pressed ? colors.accent : colors.billSurface })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text accessibilityRole="header" style={[typography.section, { flex: 1, color: colors.foreground }]}>Shared expenses</Text>
        <Feather name="chevron-right" size={18} color={colors.primary} />
      </View>
      {stage === "active" ? <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
        {[{ label: "You owe", cents: owe }, { label: "You’re owed", cents: owed }].map(item => <View key={item.label} style={{ flexGrow: 1, gap: 4 }}><Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.label}</Text><Text style={[typography.title, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{sharedMoney(item.cents)}</Text></View>)}
      </View> : <Text style={[typography.body, { color: colors.foreground }]}>{stage === "settled" ? "Recorded shares are settled." : "View your recorded expenses and repayments."}</Text>}
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Based on recorded expenses and repayments.</Text>
      {pending ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{pending} {pending === 1 ? "invitation" : "invitations"} awaiting acceptance. Shares don’t grant household access.</Text> : null}
    </Pressable>
    {failed ? <ReadNotice message="Couldn’t refresh shared expenses. Showing the last loaded balances." busy={busy} onRetry={() => void load()} /> : null}
  </View>;
}

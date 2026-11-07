import { useTheme } from "@/theme/useTheme";
import { SavedBillInsights } from "@/components/SavedBillInsights";
import { accountServiceLabel } from "@/lib/saved-bill-story";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { QuietAction } from "@/components/Brief";
import { manualHistoryAccounts, type HistoryBill } from "@/lib/manual-history-insights";
import { typography } from "@/theme/tokens";

export function ManualHistoryInsights({ bills, complete, today, initialBillId, onOpen, onAdd, onTrack }: { bills: HistoryBill[]; complete: boolean; today: string; initialBillId?: string; onOpen: (id: string) => void; onAdd: (bill?: HistoryBill) => void; onTrack: (id: string) => void }) {
  const { colors } = useTheme();

  const router = useRouter();
  const accounts = manualHistoryAccounts(bills);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const selected = accounts.find(a => a.key === selectedKey) ?? accounts.find(a => a.bills.some(b => b.id === initialBillId)) ?? (initialBillId ? undefined : accounts[0]);
  if (!selected && initialBillId) return <View style={{gap:12}}><Text style={[typography.title,{color:colors.foreground}]}>This account could not be loaded</Text><Text style={[typography.body,{color:colors.mutedForeground}]}>Return to Bills and choose the account again. No other account has been selected in its place.</Text></View>;
  if (!selected) return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>Understand your past bills</Text>
    <Text style={[typography.body, { color: colors.mutedForeground }]}>Start with one past statement. Add a second completed period for the same account to see what changed, and a third for a broader daily-charge trend. A provider connection is optional.</Text>
    <QuietAction label="Add a past statement" onPress={() => onAdd()} />
  </View>;
  return <View style={{ gap: 24 }}>
    {accounts.length > 1 ? <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: choosing }} accessibilityLabel={`Choose account. ${selected.provider}, ${selected.nickname}. ${accounts.length} accounts available.`} onPress={() => setChoosing(value => !value)} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={[typography.body, { color: colors.primary, flex: 1 }]}>Choose account · {accounts.length}</Text>
        <Feather name={choosing ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
      </Pressable>
      {choosing ? <View accessibilityRole="radiogroup" accessibilityLabel="Statement accounts">{accounts.map(account => <Pressable key={account.key} accessibilityRole="radio" accessibilityState={{ checked: account.key === selected.key }} onPress={() => { setSelectedKey(account.key); setChoosing(false); }} style={{ minHeight: 64, padding: 12, borderRadius: 12, backgroundColor: account.key === selected.key ? colors.surfaceSubtle : "transparent", gap: 4 }}>
        <Text style={[typography.body, { color: colors.foreground }]}>{[account.provider, accountServiceLabel(account.category)].filter(Boolean).join(" · ")}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{account.nickname} · {account.currency}</Text>
      </Pressable>)}</View> : null}
    </View> : null}
    <SavedBillInsights key={selected.key} account={selected} complete={complete} today={today} onOpen={onOpen} onDetails={(id, read) => router.push({ pathname: "/bill/statement-details", params: { billId: id, ...(read ? { intent: "read" } : {}) } })} onAdd={() => router.push("/bill/batch")} onTrack={onTrack} />
  </View>;
}

import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { BriefRow } from "@/components/Brief";
import type { BillsPayload } from "@/lib/bills-data";
import { formatDueDate } from "@/lib/bills-data";
import { HomeBillAccounts } from "@/components/HomeBillAccounts";
import { manualHistoryAccounts } from "@/lib/manual-history-insights";
import { typography } from "@/theme/tokens";

export type StarterSavedItem = { title: string; detail: string; href: string; kind: "records" | "care" };
type SavedBills = Exclude<BillsPayload, { needsOnboarding: true }>;
export function HomeSavedProgress({ bills, items, stale }: { bills: SavedBills | null; items: StarterSavedItem[]; stale: boolean }) {
  const { colors } = useTheme();

  const router = useRouter();
  if (stale || (!items.length && (!bills || !bills.bills.length))) return null;
  return <View style={{ gap: 16 }}>
    <HomeBillProgress bills={bills} />
    {items.map(item => <View key={item.href} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Feather name="check-circle" color={colors.successForeground} size={18} />
        <Text style={[typography.meta, { color: colors.successForeground }]}>{item.kind === "records" ? "Saved in your Vault" : "Saved in Care"}</Text></View>
      <BriefRow title={item.title} detail={item.detail} onPress={() => router.push(item.href as never)} />
    </View>)}
  </View>;
}

function HomeBillProgress({ bills }: { bills: SavedBills | null }) {
  const { colors } = useTheme();

  const router = useRouter();
  if (!bills) return null;
  if (manualHistoryAccounts(bills.bills).length) return <HomeBillAccounts bills={bills}/>;
  if (bills.utilityInsights.length) return null;
  if (bills.bills.length < 1 || bills.bills.length > 2) return null;
  const bill = bills.bills[0];
  let amount = "Amount not recorded";
  if (bill.amount !== null && Number.isFinite(bill.amount)) {
    try { amount = new Intl.NumberFormat("en-CA", { style: "currency", currency: bill.currency }).format(bill.amount); }
    catch { amount = "Currency unavailable"; }
  }
  return <View style={{ gap: 6 }}>
    <Text style={[typography.meta, { color: colors.successForeground }]}>Your bill is organised</Text>
    <BriefRow title={bill.label} detail={`${amount} · ${bill.status === "paid" ? "Recorded as paid" : bill.dueDate ? `Due ${formatDueDate(bill.dueDate)}` : "Due date not recorded"}`} onPress={() => router.push(`/bill/${bill.id}`)} />
    <Text style={[typography.meta, { color: colors.mutedForeground }]}>Open it to review or edit the details. Add past statements whenever you’re ready to compare charges.</Text>
  </View>;
}

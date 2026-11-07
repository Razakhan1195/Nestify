import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { UtilitySnapshotCard } from "@/components/UtilitySnapshotCard";
import { utilityChoices } from "@/lib/utility-choices";
import type { SnapshotBill, SnapshotUtility } from "@/lib/utility-snapshot";
import { typography } from "@/theme/tokens";

export function UtilityOverview({ bills, utilities, compact = false }: {
  bills: SnapshotBill[]; utilities: SnapshotUtility[]; compact?: boolean;
}) {
  const { colors } = useTheme();

  const router = useRouter();
  const choices = utilityChoices(bills, utilities);
  const [choosing, setChoosing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = choices.find(c => c.key === selectedKey) ?? choices[0];
  if (!selected) return null;
  return <View style={{ gap: 12 }}>
    {choices.length > 1 ? <>
      {compact ? <Pressable accessibilityRole="button" accessibilityLabel={`Choose utility. ${selected.category}, ${selected.providerName}. ${choices.length} accounts available.`} accessibilityState={{ expanded: choosing }} onPress={() => setChoosing(value => !value)} style={{ minHeight: 44, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={[typography.section, { flex: 1, color: colors.foreground }]}>Utilities · {choices.length}</Text>
        <Text style={[typography.meta, { color: colors.primary }]}>Change</Text>
        <Feather name={choosing ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
      </Pressable> : <View style={{ gap: 4 }}>
        <Text style={[typography.section, { color: colors.foreground }]}>Your utilities</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Choose a utility to see its history. Billing periods can differ.</Text>
      </View>}
      {!compact || choosing ?       <View accessibilityRole="radiogroup" accessibilityLabel="Choose utility history">
        {choices.map(choice => {
          const active = choice.key === selected.key;
          const s = choice.snapshot;
          const amount = s ? new Intl.NumberFormat("en-CA", { style: "currency", currency: s.currency }).format(s.latest.amount) : "Amount unavailable";
          const period = s ? `${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(s.latest.start + "T12:00:00Z"))} – ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(s.latest.end + "T12:00:00Z"))}` : "No dated statement available";
          return <Pressable key={choice.key} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${choice.category}, ${choice.providerName}${choice.accountLabel ? `, ${choice.accountLabel}` : ""}. ${amount}. ${period}`} onPress={() => { setSelectedKey(choice.key); setChoosing(false); }}
            style={({ pressed }) => ({ padding: 12, minHeight: 64, borderRadius: 12, backgroundColor: active || pressed ? colors.surfaceSubtle : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
            <Feather name={active ? "check-circle" : "circle"} size={18} color={active ? colors.primary : colors.mutedForeground} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
                <Text style={[typography.meta, { flexGrow: 1, color: colors.primary, fontWeight: "600" }]}>{choice.category}</Text>
                <Text style={[typography.meta, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{amount}</Text>
              </View>
              <Text style={[typography.body, { color: colors.foreground }]}>{choice.providerName}{choice.accountLabel ? ` · ${choice.accountLabel}` : ""}</Text>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>{period}</Text>
            </View>
          </Pressable>;
        })}
      </View> : null}
    </> : null}
    {selected.snapshot ? <UtilitySnapshotCard compact={compact} snapshot={selected.snapshot} accountLabel={selected.accountLabel} statementOnly={selected.href.startsWith("/bill/")} onPress={() => router.push(selected.href as never)} /> :
      <Pressable accessibilityRole="button" onPress={() => router.push(selected.href as never)} style={{ gap: 8, padding: 20, borderRadius: 22, backgroundColor: colors.surfaceSubtle }}>
        <Text style={[typography.section, { color: colors.foreground }]}>{selected.providerName}</Text>
        {selected.accountLabel ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{selected.accountLabel}</Text> : null}
        <Text style={[typography.body, { color: colors.mutedForeground }]}>A dated amount isn’t available. You can still review the saved details.</Text>
        <Text style={[typography.meta, { color: colors.primary }]}>Review saved details ›</Text>
      </Pressable>}
  </View>;
}

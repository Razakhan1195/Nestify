import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { colors, typography } from "@/theme/tokens";
import type { UtilitySnapshot } from "@/lib/utility-snapshot";

const date = (s: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(s + "T12:00:00Z"));
export function UtilitySnapshotCard({ snapshot: s, onPress, compact = false, accountLabel = null, statementOnly = false }: { snapshot: UtilitySnapshot; onPress: () => void; compact?: boolean; accountLabel?: string | null; statementOnly?: boolean }) {
  const money = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: s.currency }).format(n);
  const max = Math.max(...s.points.map(p => p.amount), 1);
  const chart = s.points.length > 1;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${s.providerName}${accountLabel ? `, ${accountLabel}` : ""}. Latest saved statement ${money(s.latest.amount)}. ${date(s.latest.start)} to ${date(s.latest.end)}. ${statementOnly ? "Open saved statement" : "Open utility insights"}.`} onPress={onPress}
    style={({ pressed }) => ({ padding: 20, borderRadius: 22, gap: compact ? 10 : 14, backgroundColor: pressed ? colors.accent : colors.surfaceSubtle })}>
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><View style={{ flex: 1, gap: 3 }}><Text style={[typography.section, { color: colors.foreground }]}>{s.providerName}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{accountLabel ? `${accountLabel} · Latest saved statement` : "Latest saved statement"}</Text></View><Feather name={s.categoryId === "electricity" ? "zap" : s.categoryId === "water" ? "droplet" : "wind"} size={22} color={colors.primary} /></View>
    <View style={{ gap: 4 }}><Text style={[typography.display, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{money(s.latest.amount)}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{date(s.latest.start)} – {date(s.latest.end)}</Text></View>
    {chart ? <View accessible accessibilityLabel={s.points.map(p => `Period ending ${date(p.end)}: ${money(p.amount)}`).join(". ")} style={{ gap: 8 }}>
      <View style={{ height: compact ? 76 : 96, flexDirection: "row", gap: 9, alignItems: "flex-end" }}>
        {s.points.map((p, i) => <View key={p.id} style={{ flex: 1, height: "100%", justifyContent: "flex-end", gap: 7 }}><View style={{ height: p.amount === 0 ? 1 : Math.max(3, p.amount / max * (compact ? 50 : 70)), borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: i === s.points.length - 1 ? colors.primary : "#A3B8A1" }} /><Text style={{ fontSize: 10, color: colors.mutedForeground, textAlign: "center" }}>{new Intl.DateTimeFormat("en-CA", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(p.end + "T12:00:00Z"))}</Text></View>)}
      </View>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{s.points.length} saved periods · statement amounts</Text>
    </View> : null}
    {compact && s.difference !== null ? <Text style={[typography.meta, { color: colors.foreground }]}>Statement change: {s.difference > 0 ? "+" : s.difference < 0 ? "−" : ""}{money(Math.abs(s.difference))} from the previous saved period</Text> : s.difference !== null ? <Text style={[typography.meta, { color: colors.foreground }]}>{s.difference === 0 ? "Same amount as" : `${money(Math.abs(s.difference))} ${s.difference < 0 ? "less" : "more"} than`} the statement ending {date(s.previousEnd!)}. Billing periods can differ.</Text> : s.note ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{s.note}</Text> : null}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Text style={[typography.meta, { flex: 1, color: colors.primary, fontWeight: "600" }]}>{statementOnly ? "Open saved statement" : s.categoryId === "electricity" ? "Explore usage & plan comparisons" : "Explore statement history"}</Text><Feather name="arrow-up-right" size={18} color={colors.primary} /></View>
  </Pressable>;
}

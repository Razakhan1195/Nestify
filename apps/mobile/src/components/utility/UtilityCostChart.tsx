import { useTheme } from "@/theme/useTheme";
import { Text, View } from "react-native";
import { Surface } from "@/components/ui/Surface";
import { StatementBarChart } from "@/components/StatementBarChart";
import { formatDueDate, type UtilityInsight } from "@/lib/bills-data";
import { spacing, typography } from "@/theme/tokens";

export function UtilityCostChart({ insight, onOpenStatement }: { insight: UtilityInsight; onOpenStatement: (id: string) => void }) {
  const { colors } = useTheme();

 const points = insight.history.filter(point => typeof point.amount === "number" && Number.isFinite(point.amount));
 if (!points.length) return null;
 const currency = insight.currency ?? "CAD";
 const money = (value: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
 return <View style={{ gap: spacing.md }}>
  <View style={{ gap: spacing.xs }}>
   <Text style={[typography.section, { color: colors.foreground }]}>Bill trend</Text>
   <Text style={[typography.caption, { color: colors.mutedForeground }]}>{points.length} saved {points.length === 1 ? "amount" : "amounts"} · Tap a bar to explore</Text>
  </View>
  <Surface tone="subtle" style={{ gap: spacing.md }}>
   <StatementBarChart key={insight.providerId} points={points.map(point => ({
     id: point.billId, label: point.label, value: point.amount,
     period: point.periodStart && point.periodEnd ? `${formatDueDate(point.periodStart)} – ${formatDueDate(point.periodEnd)}` : "Billing dates unavailable",
     formattedValue: money(point.amount!) + " " + currency,
     detail: point.amount! < 0 ? "Credit on this statement" : insight.amountBasis === "amount_due" ? "Amount due when issued · payment status is separate" : "Recorded statement amount",
   }))} onOpen={onOpenStatement} />
   {points.some(point => point.amount! < 0) ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Bar height shows the size of each amount. Credits are labelled with a minus sign.</Text> : null}
  </Surface>
 </View>;
}

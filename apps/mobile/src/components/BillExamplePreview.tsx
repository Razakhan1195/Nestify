import { useTheme } from "@/theme/useTheme";
import { Text, View } from "react-native";
import { exampleStatements, startingHistory } from "@/lib/home-start";
import { typography } from "@/theme/tokens";

// The same fictional statements and calculation used by the full example.
const history = startingHistory(exampleStatements, true, "2026-07-01")!;
export function BillExamplePreview() {
  const { colors } = useTheme();

  return <View style={{ width: "100%", maxWidth: 430, borderRadius: 22, padding: 20, gap: 12, backgroundColor: colors.exampleBillSurface }}>
    <Text style={[typography.caption, { color: colors.mutedForeground }]}>EXAMPLE · ELECTRICITY · CAD</Text>
    <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>What changed on this bill?</Text>
    <View style={{ gap: 8 }}>
      {[...history.analysis.window].reverse().map((period, index) => <View key={period.bill.id} style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Text style={[typography.meta, { color: colors.foreground }]}>{["April", "May", "June"][index]}</Text>
          <Text style={[typography.meta, { color: colors.foreground }]}>${(period.dailyMinor / 100).toFixed(2)} / day</Text>
        </View>
        <View accessible={false} style={{ height: 6, backgroundColor: colors.exampleChartTrack, borderRadius: 3 }}>
          <View style={{ height: 6, width: `${period.dailyMinor / 360 * 100}%`, borderRadius: 3, backgroundColor: index === 2 ? colors.primary : colors.exampleChartBar }} />
        </View>
      </View>)}
    </View>
    <Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>Daily charges rose {history.analysis.comparison!.percent}%</Text>
    <Text style={[typography.caption, { color: colors.mutedForeground }]}>Check the original for usage or price changes. Totals alone don’t tell us the cause.</Text>
  </View>;
}

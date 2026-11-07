import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { layout, spacing, typography } from "@/theme/tokens";

export type StatementChartPoint = {
  id: string; label: string; period: string; value: number | null;
  formattedValue: string; detail: string;
};
// Selection is by statement ID so corrected/reordered history keeps its identity.
// Arrow controls provide full-sized alternatives to narrow monthly bars.
export function StatementBarChart({ points, onOpen }: { points: StatementChartPoint[]; onOpen: (id: string) => void }) {
  const { colors } = useTheme();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { width, fontScale } = useWindowDimensions();
  if (!points.length) return null;
  const selected = points.find(point => point.id === selectedId) ?? points[points.length - 1];
  const selectedIndex = points.indexOf(selected);
  const max = Math.max(1, ...points.map(point => point.value !== null && Number.isFinite(point.value) ? Math.abs(point.value) : 0));
  const stacked = width < 350 || fontScale > 1.3;
  return <View style={{ gap: spacing.md }}>
    <View style={{ height: 146, flexDirection: "row", alignItems: "flex-end", gap: spacing.xs }}>
      {points.map((point, index) => <Pressable key={point.id} accessibilityRole="button"
        accessibilityLabel={`${point.period}, ${point.formattedValue}`} accessibilityHint="Show this saved statement’s details"
        accessibilityState={{ selected: point.id === selected.id }} onPress={() => setSelectedId(point.id)}
        style={{ flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs }}>
        {point.value === null || !Number.isFinite(point.value) ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>—</Text> : <View style={{ width: "100%", maxWidth: 26, height: Math.max(2, Math.abs(point.value) / max * 118), borderRadius: 5, backgroundColor: point.id === selected.id ? colors.primary : colors.borderStrong }} />}
        {index === 0 || index === points.length - 1 || points.length <= 4 ? <Text numberOfLines={1} style={{ fontSize: 10, color: colors.mutedForeground }}>{point.label.split(" ")[0]}</Text> : <View style={{ height: 12 }} />}
      </Pressable>)}
    </View>
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: stacked ? "column" : "row", alignItems: stacked ? "flex-start" : "center", gap: spacing.sm }}>
        <View accessibilityLiveRegion="polite" style={{ flex: stacked ? undefined : 1, gap: spacing.xs }}>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{selected.period}</Text>
          <Text style={[typography.section, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{selected.formattedValue}</Text>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{selected.detail}</Text>
        </View>
        <View style={{ flexDirection: "row", alignSelf: stacked ? "flex-end" : "auto" }}>
          {([-1, 1] as const).map(direction => {
            const next = points[selectedIndex + direction];
            return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction < 0 ? "Previous statement" : "Next statement"}
              accessibilityState={{ disabled: !next }} disabled={!next} onPress={() => next && setSelectedId(next.id)}
              style={{ width: layout.touchMin, height: layout.touchMin, alignItems: "center", justifyContent: "center", opacity: next ? 1 : 0.3 }}>
              <Feather name={direction < 0 ? "chevron-left" : "chevron-right"} size={20} color={colors.primary} />
            </Pressable>;
          })}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${selected.label} statement`} onPress={() => onOpen(selected.id)}
        style={{ minHeight: layout.touchMin, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={[typography.body, { color: colors.primary, fontWeight: "600", flexShrink: 1 }]}>View statement</Text><Feather name="arrow-right" size={16} color={colors.primary} />
      </Pressable>
    </View>
  </View>;
}

import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import type { HomePayload } from "@/lib/home-data";
import { formatCurrency } from "@/lib/home-data";
import { radii, spacing, typography } from "@/theme/tokens";
import { Surface } from "@/components/ui/Surface";

type ReadyHomePayload = Exclude<HomePayload, { needsOnboarding: true }>;

type Props = {
  analytics: ReadyHomePayload["analytics"];
  onPress: () => void;
};

export function HomeCostAnalytics({ analytics, onPress }: Props) {
  const { colors } = useTheme();

  const maxAmount = Math.max(1, ...analytics.months.map((month) => month.amount));
  const change = analytics.changePercent;
  const comparison = change === null ? "First month of data" : `${change > 0 ? "+" : ""}${change}% vs last month`;

  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Surface tone="raised" style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: colors.mutedForeground }]}>Home costs</Text>
            <Text style={[typography.heading, { color: colors.foreground }]}>{formatCurrency(analytics.currentMonthTotal)}</Text>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>known this month</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceSubtle }}>
            <Feather name={change !== null && change > 0 ? "trending-up" : "trending-down"} size={13} color={colors.primary} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>{comparison}</Text>
          </View>
        </View>

        <View style={{ height: 86, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          {analytics.months.map((month, index) => {
            const height = Math.max(8, Math.round((month.amount / maxAmount) * 62));
            const active = index === analytics.months.length - 1;
            return (
              <View key={month.key} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ width: "100%", height: 64, justifyContent: "flex-end", alignItems: "center" }}>
                  <View style={{ width: "70%", height, borderRadius: 7, backgroundColor: active ? colors.primary : colors.accent }} />
                </View>
                <Text style={{ fontSize: 10, color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? "700" : "500" }}>{month.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            Full payment status and category detail live in Bills.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>View bills</Text>
            <Feather name="arrow-right" size={14} color={colors.primary} />
          </View>
        </View>
      </Surface>
    </Pressable>
  );
}

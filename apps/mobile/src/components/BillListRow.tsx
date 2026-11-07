import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { formatCurrency } from "@/lib/home-data";
import {
  formatDueDate,
  statusLabel,
  statusTone,
  type BillListItem,
} from "@/lib/bills-data";
import { radii, spacing } from "@/theme/tokens";

const makeToneColors = (colors: Colors): Record<string, { fg: string; bg: string }> => ({
  critical: { fg: colors.criticalForeground, bg: colors.criticalBg },
  warning: { fg: colors.warningForeground, bg: colors.warningBg },
  info: { fg: colors.infoForeground, bg: colors.infoBg },
  success: { fg: colors.successForeground, bg: colors.successBg },
});

function categoryIcon(category: string): keyof typeof Feather.glyphMap {
  const value = category.toLowerCase();
  if (value.includes("electric") || value.includes("hydro")) return "zap";
  if (value.includes("water")) return "droplet";
  if (value.includes("internet") || value.includes("phone")) return "wifi";
  if (value.includes("insurance")) return "shield";
  if (value.includes("tax") || value.includes("rent") || value.includes("mortgage")) return "home";
  return "file-text";
}
type BillListRowProps = {
  bill: BillListItem;
  onPress: (bill: BillListItem) => void;
};

export function BillListRow({ bill, onPress }: BillListRowProps) {
  const { colors, premium } = useTheme();
  const toneColors = useThemeMemo(() => makeToneColors(colors), [colors, premium]);

  const tone = toneColors[statusTone(bill.status)];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(bill);
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        backgroundColor: pressed ? colors.surfaceSubtle : colors.surfaceRaised,
        borderRadius: radii["2xl"],
        borderWidth: 1,
        borderColor: colors.border,
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent,
        }}
      >
        <Feather name={categoryIcon(bill.category)} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
          {bill.label}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.mutedForeground }} numberOfLines={1}>
          {bill.category} · {formatDueDate(bill.dueDate)}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
          {bill.amount === null ? "—" : formatCurrency(bill.amount)}
        </Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full, backgroundColor: tone.bg }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: tone.fg }}>
            {statusLabel(bill.status)}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

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
import { colors, radii, spacing } from "@/theme/tokens";

const toneColors: Record<string, { fg: string; bg: string }> = {
  critical: { fg: colors.criticalForeground, bg: colors.criticalBg },
  warning: { fg: colors.warningForeground, bg: colors.warningBg },
  info: { fg: colors.infoForeground, bg: colors.infoBg },
  success: { fg: colors.successForeground, bg: colors.successBg },
};

type BillListRowProps = {
  bill: BillListItem;
  onPress: (bill: BillListItem) => void;
};

export function BillListRow({ bill, onPress }: BillListRowProps) {
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
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.card,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
          numberOfLines={1}
        >
          {bill.label}
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }} numberOfLines={1}>
          Due {formatDueDate(bill.dueDate)} · {bill.category}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
          {bill.amount === null ? "—" : formatCurrency(bill.amount)}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radii.full,
            backgroundColor: tone.bg,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: tone.fg }}>
            {statusLabel(bill.status)}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

import { Text, View } from "react-native";

import type { UpcomingItem } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type UpcomingListProps = {
  items: UpcomingItem[];
};

export function UpcomingList({ items }: UpcomingListProps) {
  if (!items.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>
        Coming up
      </Text>
      <View
        style={{
          borderRadius: radii.lg,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {items.map((item, index) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
              padding: spacing.md,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={1}>
                {item.detail}
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>
              {item.timing}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

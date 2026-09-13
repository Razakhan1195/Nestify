import { Text, View } from "react-native";

import type { ActivityItem } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type ActivityListProps = {
  items: ActivityItem[];
};

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ActivityList({ items }: ActivityListProps) {
  if (!items.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>
        Recently handled & added
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
              padding: spacing.md,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
              gap: 2,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                {timeAgo(item.created_at)}
              </Text>
            </View>
            {item.description ? (
              <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

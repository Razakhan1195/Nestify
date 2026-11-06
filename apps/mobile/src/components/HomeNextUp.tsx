import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import type { UpcomingItem } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import { SectionHeader } from "@/components/ui/SectionHeader";

type Props = { items: UpcomingItem[]; onItemPress: (item: UpcomingItem) => void };

const icons: Record<UpcomingItem["type"], keyof typeof Feather.glyphMap> = {
  Bill: "credit-card",
  Care: "tool",
  Vault: "archive",
};

function dateBadge(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { month: "", day: "—" };
  return {
    month: new Intl.DateTimeFormat("en-CA", { month: "short" }).format(date).toUpperCase(),
    day: String(date.getDate()),
  };
}

export function HomeNextUp({ items, onItemPress }: Props) {
  const visibleItems = items.slice(0, 4);
  if (!visibleItems.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Coming up" detail="Next 30 days" />
      <View style={{ gap: spacing.sm }}>
        {visibleItems.map((item) => {
          const badge = dateBadge(item.date);
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onItemPress(item);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: spacing.md,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View style={{ width: 48, height: 52, borderRadius: radii.xl, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: colors.mutedForeground }}>{badge.month}</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{badge.day}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <Feather name={icons[item.type]} size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{item.title}</Text>
                <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>{item.detail} · {item.timing}</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

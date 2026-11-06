import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { SectionHeader } from "@/components/ui/SectionHeader";
import type { HomePayload } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type ReadyHome = Exclude<HomePayload, { needsOnboarding: true }>;
type TodayItem = ReadyHome["todayCare"][number];

type Props = {
  items: TodayItem[];
  busyId: string | null;
  onComplete: (item: TodayItem) => void;
  onOpenItem: (item: TodayItem) => void;
  onOpenCare: () => void;
};

export function HomeToday({ items, busyId, onComplete, onOpenItem, onOpenCare }: Props) {
  if (!items.length) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        title="Today at home"
        detail={`${items.length} ${items.length === 1 ? "thing" : "things"}`}
      />
      <View style={{ borderRadius: radii["2xl"], backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        {items.map((item, index) => {
          const busy = busyId === item.id;
          return (
            <View
              key={item.id}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark ${item.title} complete`}
                disabled={busy}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onComplete(item);
                }}
                style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: busy ? 0.45 : pressed ? 0.72 : 1 })}
              >
                <Feather name="check" size={17} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => onOpenItem(item)} style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>{item.title}</Text>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>{[item.category, item.recurrence].filter(Boolean).join(" · ") || "Care task"}</Text>
              </Pressable>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          );
        })}
      </View>
      <Pressable onPress={onOpenCare} style={{ alignSelf: "flex-start", paddingVertical: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>View all Care</Text>
      </Pressable>
    </View>
  );
}

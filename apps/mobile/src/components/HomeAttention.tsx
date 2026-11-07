import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { Surface } from "@/components/ui/Surface";
import type { AttentionItem } from "@/lib/home-data";
import { severityColors, spacing, typography } from "@/theme/tokens";

type Props = {
  items: AttentionItem[];
  totalCount: number;
  onItemPress: (item: AttentionItem) => void;
  onViewAll: () => void;
};

const sourceIcons: Record<AttentionItem["sourceType"], keyof typeof Feather.glyphMap> = {
  bill: "credit-card",
  care: "tool",
  vault: "archive",
  provider: "refresh-cw",
  help: "alert-triangle",
};

export function HomeAttention({ items, totalCount, onItemPress, onViewAll }: Props) {
  const { colors } = useTheme();

  const visible = items.slice(0, 3);
  if (!visible.length) return null;

  function press(item: AttentionItem) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onItemPress(item);
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        title="Worth your attention"
        detail={`${totalCount} ${totalCount === 1 ? "item" : "items"}`}
      />
      <Surface
        tone="raised"
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: 0,
        }}
      >
        {visible.map((item, index) => {
          const tone = severityColors(item.severity, colors);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.cta}`}
              onPress={() => press(item)}
              style={({ pressed }) => ({
                minHeight: 72,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: spacing.md,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.68 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  backgroundColor: tone.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={sourceIcons[item.sourceType]} size={17} color={tone.fg} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{ fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: colors.foreground }}
                  numberOfLines={index === 0 ? undefined : 1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground, lineHeight: 17 }]}
                  numberOfLines={index === 0 ? undefined : 2}
                >
                  {item.explanation}
                </Text>
                {index === 0 ? <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{item.cta}</Text> : null}
                {item.meta ? (
                  <Text style={{ fontSize: 11, fontWeight: "700", color: tone.fg }} numberOfLines={1}>
                    {item.meta}
                  </Text>
                ) : null}
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          );
        })}
        {totalCount > visible.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onViewAll();
            }}
            style={({ pressed }) => ({
              minHeight: 52,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.primary }}>
              View all {totalCount}
            </Text>
            <Feather name="arrow-right" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
      </Surface>
    </View>
  );
}

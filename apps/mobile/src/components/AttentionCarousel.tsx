import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Dimensions, FlatList, Pressable, Text, View } from "react-native";

import type { AttentionItem } from "@/lib/home-data";
import { colors, radii, severityColors, spacing, typography } from "@/theme/tokens";

const CARD_WIDTH = Math.min(Dimensions.get("window").width - spacing["2xl"] * 2, 320);

type AttentionCarouselProps = {
  items: AttentionItem[];
  onItemPress: (item: AttentionItem) => void;
};

export function AttentionCarousel({ items, onItemPress }: AttentionCarouselProps) {
  const listRef = useRef<FlatList<AttentionItem>>(null);

  if (!items.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>
        Needs a look
      </Text>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={{ gap: spacing.md }}
        renderItem={({ item }) => {
          const tone = severityColors(item.severity);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onItemPress(item);
              }}
              style={({ pressed }) => ({
                width: CARD_WIDTH,
                borderRadius: radii.lg,
                padding: spacing.lg,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                gap: spacing.sm,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: radii.full,
                  backgroundColor: tone.bg,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: tone.fg }}>
                  {item.meta}
                </Text>
              </View>
              <Text
                style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text
                style={{ fontSize: 13, color: colors.mutedForeground }}
                numberOfLines={2}
              >
                {item.explanation}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                {item.cta}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

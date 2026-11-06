import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { askRezleeSuggestions } from "@/lib/assistant-data";
import { colors, radii, shadows, spacing, typography } from "@/theme/tokens";

type Props = {
  onOpen: (prompt?: string) => void;
};

export function AskRezleeCard({ onOpen }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen()}
        style={({ pressed }) => ({
          borderRadius: radii["3xl"],
          backgroundColor: colors.primary,
          overflow: "hidden",
          opacity: pressed ? 0.94 : 1,
          ...shadows.card,
        })}
      >
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 24,
                backgroundColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: colors.primaryForeground,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="star" size={20} color={colors.primary} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typography.label, { color: "rgba(250,247,239,0.7)" }]}>Ask Rezlee</Text>
              <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: "700", color: colors.primaryForeground }}>
                Ask anything about your place
              </Text>
              <Text style={[typography.meta, { color: "rgba(250,247,239,0.72)" }]}>Bills, upkeep, warranties, costs, repairs and what needs attention.</Text>
            </View>
            <Feather name="arrow-up-right" size={20} color={colors.primaryForeground} />
          </View>
        </View>
      </Pressable>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {askRezleeSuggestions.slice(0, 2).map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => {
              Haptics.selectionAsync();
              onOpen(prompt);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 72,
              borderRadius: radii.xl,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Text style={{ fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground }} numberOfLines={3}>
              {prompt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

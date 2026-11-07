import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { homeTile, typography } from "@/theme/tokens";

// An ongoing tool, not a setup milestone. Opening it never sends a model request.
export function HomeAssistantTile({ owner }: { owner: boolean }) {
  const { colors } = useTheme();

  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const detail = owner ? "Talk through a repair, plan a household task or understand a bill."
    : "Talk through a household task or get help caring for your place.";
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ask Rezlee. Your AI home assistant. ${detail}`}
    onPress={() => router.push("/assistant")} style={({ pressed }) => ({ padding: homeTile.padding, borderRadius: homeTile.radius, gap: homeTile.gap,
      backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 })}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[typography.caption, { color: colors.primaryForeground }]}>YOUR AI HOME ASSISTANT</Text>
        <Text accessibilityRole="header" style={[typography.section, { color: colors.primaryForeground }]}>Need a hand at home?</Text>
        <Text style={[typography.meta, { color: colors.primaryForeground }]}>{detail}</Text>
      </View>
      {fontScale <= 1.3 ? <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 58, height: 60 }}>
        <View style={{ position: "absolute", left: 0, top: 4, width: 43, height: 38, borderRadius: 12, backgroundColor: colors.assistantLayer, transform: [{ rotate: "-12deg" }] }} />
        <View style={{ position: "absolute", right: 0, bottom: 0, width: 43, height: 42, borderRadius: 12, borderBottomRightRadius: 3, backgroundColor: colors.primaryForeground, transform: [{ rotate: "8deg" }], alignItems: "center", justifyContent: "center" }}>
          <Feather name="home" size={23} color={colors.primary} />
        </View>
      </View> : null}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={[typography.meta, { fontWeight: "600", color: colors.primaryForeground }]}>Ask Rezlee</Text>
      <Feather name="arrow-up-right" size={18} color={colors.primaryForeground} />
    </View>
  </Pressable>;
}

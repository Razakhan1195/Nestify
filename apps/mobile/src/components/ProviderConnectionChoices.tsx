import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Surface } from "./ui/Surface";
import { colors, spacing, typography } from "@/theme/tokens";

export function ProviderConnectionChoices() {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Find and connect your provider" onPress={() => router.push("/provider/connect")} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
    <Surface tone="raised" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Feather name="search" size={24} color={colors.primary} />
        <Text style={[typography.section, { color: colors.foreground, flex: 1 }]}>Connect your provider</Text>
        <Feather name="arrow-right" size={20} color={colors.primary} />
      </View>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Find your company or municipality in one place. We’ll guide you to Green Button or secure sign-in with Deck.</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>See availability before you sign in. You can always upload a bill.</Text>
    </Surface>
  </Pressable>;
}

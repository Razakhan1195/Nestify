import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing, typography } from "@/theme/tokens";

type ComingSoonScreenProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  note: string;
};

export function ComingSoonScreen({
  title,
  subtitle,
  icon,
  note,
}: ComingSoonScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing["2xl"], gap: spacing.sm }}>
        <Text style={[typography.heading, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.md,
          paddingHorizontal: spacing["2xl"],
        }}
      >
        <Feather name={icon} size={32} color={colors.mutedForeground} />
        <Text
          style={{
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: "center",
          }}
        >
          {note}
        </Text>
      </View>
    </SafeAreaView>
  );
}

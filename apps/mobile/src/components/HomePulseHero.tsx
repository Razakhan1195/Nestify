import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { HomePayload } from "@/lib/home-data";
import { spacing, typography } from "@/theme/tokens";

type ReadyHomePayload = Exclude<HomePayload, { needsOnboarding: true }>;
type Props = {
  nickname: string;
  household: ReadyHomePayload["household"];
  onHouseholdPress: () => void;
  onSettingsPress: () => void;
};

export function HomePulseHero({ nickname, household, onHouseholdPress, onSettingsPress }: Props) {
  const { colors } = useTheme();

  const today = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "short", day: "numeric" }).format(new Date());

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.lg }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>{today}</Text>
          <Text style={[typography.display, { color: colors.foreground }]} numberOfLines={1}>{nickname}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open household"
            onPress={onHouseholdPress}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {household.members.slice(0, 3).map((member, index) => (
                <View
                  key={member.id}
                  style={{ width: 24, height: 24, borderRadius: 12, marginLeft: index ? -6 : 0, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.background, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary }}>{member.name.trim().charAt(0).toUpperCase() || "•"}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{household.count > 1 ? `${household.count} people` : household.count === 1 ? "Just you" : "Household"}</Text>
            <Feather name="chevron-right" size={13} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={onSettingsPress}
          style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.78 : 1 })}
        >
          <Feather name="settings" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

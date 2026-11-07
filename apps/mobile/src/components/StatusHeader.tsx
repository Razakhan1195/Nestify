import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { DashboardState } from "@/lib/home-data";
import { radii, spacing, typography } from "@/theme/tokens";

const stateLabels: Record<DashboardState, string> = {
  EMPTY: "Getting started",
  EARLY: "Getting set up",
  ACTIVE: "In motion",
  ATTENTION: "Needs attention",
  STABLE: "All good",
};

type StatusHeaderProps = {
  nickname: string;
  dashboardState: DashboardState;
  statusSentence: string;
  onAddPress?: () => void;
};

export function StatusHeader({
  nickname,
  dashboardState,
  statusSentence,
  onAddPress,
}: StatusHeaderProps) {
  const { colors } = useTheme();

  const needsAttention = dashboardState === "ATTENTION";
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[typography.display, { color: colors.foreground }]} numberOfLines={1}>
            {nickname}
          </Text>
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
              borderRadius: radii.full,
              backgroundColor: needsAttention ? colors.criticalBg : colors.successBg,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: radii.full,
                backgroundColor: needsAttention ? colors.critical : colors.success,
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: needsAttention ? colors.criticalForeground : colors.successForeground,
              }}
            >
              {stateLabels[dashboardState]}
            </Text>
          </View>
        </View>

        {onAddPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to Rezlee"
            onPress={onAddPress}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.primary,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <Feather name="plus" size={20} color={colors.primaryForeground} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[typography.body, { color: colors.mutedForeground, maxWidth: 330 }]}>
        {statusSentence}
      </Text>
    </View>
  );
}

import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { DashboardState } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

const stateLabels: Record<DashboardState, string> = {
  EMPTY: "Getting started",
  EARLY: "Early days",
  ACTIVE: "Active this month",
  ATTENTION: "Needs attention",
  STABLE: "Up to date",
};

type StatusHeaderProps = {
  nickname: string;
  dashboardState: DashboardState;
  statusSentence: string;
  onAddPress: () => void;
};

export function StatusHeader({
  nickname,
  dashboardState,
  statusSentence,
  onAddPress,
}: StatusHeaderProps) {
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>
            {nickname}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: radii.full,
                backgroundColor:
                  dashboardState === "ATTENTION" ? colors.critical : colors.success,
              }}
            />
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              {stateLabels[dashboardState]}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add"
          onPress={onAddPress}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="plus" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <Text style={[typography.body, { color: colors.foreground, fontSize: 17 }]}>
        {statusSentence}
      </Text>
    </View>
  );
}

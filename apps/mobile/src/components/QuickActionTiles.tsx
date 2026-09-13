import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/theme/tokens";

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

const actions: QuickAction[] = [
  { key: "bill", label: "Add bill", icon: "file-plus" },
  { key: "repair", label: "Log repair", icon: "tool" },
  { key: "document", label: "Save record", icon: "upload" },
  { key: "reminder", label: "Add reminder", icon: "bell" },
];

type QuickActionTilesProps = {
  onActionPress: (key: string) => void;
};

export function QuickActionTiles({ onActionPress }: QuickActionTilesProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>
        Quick actions
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onActionPress(action.key);
            }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              gap: 6,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name={action.icon} size={18} color={colors.primary} />
            <Text
              style={{ fontSize: 11, fontWeight: "600", color: colors.foreground }}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

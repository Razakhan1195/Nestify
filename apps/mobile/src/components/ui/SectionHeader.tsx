import { useTheme } from "@/theme/useTheme";
import { Text, View } from "react-native";

import { spacing, typography } from "@/theme/tokens";

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  detail?: string;
};

export function SectionHeader({ title, eyebrow, detail }: SectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      {eyebrow ? (
        <Text style={[typography.label, { color: colors.mutedForeground }]}>
          {eyebrow}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <Text style={[typography.section, { color: colors.foreground, flex: 1 }]}>
          {title}
        </Text>
        {detail ? (
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

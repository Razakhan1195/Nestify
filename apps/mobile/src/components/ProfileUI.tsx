import { useTheme } from "@/theme/useTheme";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Surface } from "@/components/ui/Surface";
import { profileBadge } from "@/lib/profile-identity";
import { spacing, typography } from "@/theme/tokens";
export function ProfileBadge({ metadata, size = 64, circular = false }: { metadata?: Record<string, unknown>; size?: number; circular?: boolean }) {
  const badge = profileBadge(metadata);
  return <View accessible={false} style={{ width: size, height: size, borderRadius: circular ? size / 2 : size * 0.32, backgroundColor: badge.colour.background, alignItems: "center", justifyContent: "center" }}>
    <Text allowFontScaling={false} style={{ fontSize: size * 0.32, fontWeight: "600", color: badge.colour.foreground }}>{badge.initials}</Text>
  </View>;
}
export function ProfileGroup({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();

  return <View style={{ gap: spacing.sm }}>
    <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{title}</Text>
    <Surface style={{ paddingVertical: 0 }}>{children}</Surface>
  </View>;
}

import type { ReactNode } from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";

import { colors, radii, shadows, spacing } from "@/theme/tokens";

type SurfaceTone = "default" | "raised" | "subtle" | "accent";

type SurfaceProps = {
  children: ReactNode;
  tone?: SurfaceTone;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

const backgrounds: Record<SurfaceTone, string> = {
  default: colors.surface,
  raised: colors.surfaceRaised,
  subtle: colors.surfaceSubtle,
  accent: colors.accent,
};

export function Surface({
  children,
  tone = "default",
  style,
  padded = true,
}: SurfaceProps) {
  return (
    <View
      style={[
        {
          backgroundColor: backgrounds[tone],
          borderRadius: radii["2xl"],
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? spacing.lg : 0,
        },
        tone === "raised" ? shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

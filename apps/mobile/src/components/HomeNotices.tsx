import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import type { HomePayload } from "@/lib/home-data";
import { radii, spacing, typography } from "@/theme/tokens";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ReadyHomePayload = Exclude<HomePayload, { needsOnboarding: true }>;
type Notice = ReadyHomePayload["notices"][number];

type Props = {
  notices: Notice[];
  onPress: (notice: Notice) => void;
};

const makeToneMeta = (colors: Colors) => ({
  positive: { bg: colors.successBg, fg: colors.successForeground },
  neutral: { bg: colors.infoBg, fg: colors.infoForeground },
  warning: { bg: colors.warningBg, fg: colors.warningForeground },
});

export function HomeNotices({ notices, onPress }: Props) {
  const { colors, premium } = useTheme();
  const toneMeta = useThemeMemo(() => makeToneMeta(colors), [colors, premium]);

  if (!notices.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader eyebrow="Rezlee intelligence" title="What Rezlee noticed" />
      <View style={{ gap: spacing.sm }}>
        {notices.map((notice) => {
          const tone = toneMeta[notice.tone];
          return (
            <Pressable
              key={notice.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress(notice);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radii["2xl"],
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
                <Feather name={notice.icon} size={18} color={tone.fg} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", color: colors.foreground }}>{notice.title}</Text>
                <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 17 }]}>{notice.detail}</Text>
              </View>
              <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

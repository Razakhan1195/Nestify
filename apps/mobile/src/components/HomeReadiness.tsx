import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { HomePayload } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ReadyHomePayload = Exclude<HomePayload, { needsOnboarding: true }>;
type ReadinessItem = ReadyHomePayload["readiness"]["items"][number];

type Props = { readiness: ReadyHomePayload["readiness"] };

const meta: Record<ReadinessItem["id"], { title: string; detail: string; icon: keyof typeof Feather.glyphMap }> = {
  bills: { title: "Costs", detail: "See what is due and changing", icon: "credit-card" },
  care: { title: "Care", detail: "Stay ahead of maintenance", icon: "tool" },
  vault: { title: "Records", detail: "Keep proof and warranties ready", icon: "archive" },
  providers: { title: "Autopilot", detail: "Pull supported bills automatically", icon: "refresh-cw" },
};

export function HomeReadiness({ readiness }: Props) {
  if (!readiness.showSetup) return null;
  const progress = readiness.completeCount / readiness.totalCount;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader eyebrow="Make Rezlee smarter" title="Build a fuller picture of your place" detail={`${readiness.completeCount}/${readiness.totalCount}`} />
      <View style={{ height: 6, borderRadius: radii.full, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(8, progress * 100)}%`, height: "100%", borderRadius: radii.full, backgroundColor: colors.primary }} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {readiness.items.map((item) => {
          const itemMeta = meta[item.id];
          return (
            <View
              key={item.id}
              style={{
                width: "48%",
                minHeight: 112,
                borderRadius: radii["2xl"],
                padding: spacing.md,
                backgroundColor: item.complete ? colors.accent : colors.surfaceRaised,
                borderWidth: 1,
                borderColor: item.complete ? colors.accent : colors.border,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: item.complete ? colors.primary : colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Feather name={itemMeta.icon} size={16} color={item.complete ? colors.primaryForeground : colors.primary} />
                </View>
                {item.complete ? <Feather name="check-circle" size={16} color={colors.successForeground} /> : null}
              </View>
              <View style={{ gap: 3 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{itemMeta.title}</Text>
                <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 16 }]}>{itemMeta.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

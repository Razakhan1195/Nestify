import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/theme/tokens";

export function BillsIllustration() {
  return (
    <View style={{ height: 132, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: 130,
          height: 88,
          borderRadius: radii["2xl"],
          backgroundColor: colors.secondary,
          transform: [{ rotate: "-7deg" }, { translateX: -18 }],
        }}
      />
      <View
        style={{
          width: 148,
          minHeight: 104,
          borderRadius: radii["2xl"],
          backgroundColor: colors.surfaceRaised,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radii.full,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="file-text" size={16} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>$126.40</Text>
        </View>
        <View style={{ height: 7, width: "72%", borderRadius: radii.full, backgroundColor: colors.muted }} />
        <View style={{ height: 7, width: "48%", borderRadius: radii.full, backgroundColor: colors.muted }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Feather name="calendar" size={12} color={colors.successForeground} />
          <Text style={[typography.caption, { color: colors.successForeground }]}>Due in 6 days</Text>
        </View>
      </View>
    </View>
  );
}

const values = [
  { icon: "calendar", title: "Know what’s due", body: "See upcoming and overdue bills before they surprise you." },
  { icon: "refresh-cw", title: "Pull bills automatically", body: "Connect supported providers and let Rezlee keep details fresh." },
  { icon: "archive", title: "Keep proof together", body: "Bills and related records stay connected to your home history." },
] as const;
export function BillsValueProps() {
  return (
    <View style={{ gap: spacing.sm }}>
      {values.map((item) => (
        <View
          key={item.title}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.xl,
            backgroundColor: colors.surfaceRaised,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radii.full,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={item.icon} size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{item.title}</Text>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { spacing, typography } from "@/theme/tokens";

export const editorial = {
  fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  fontSize: 32,
  lineHeight: 39,
  fontWeight: "400" as const,
  letterSpacing: -0.6,
};

export function PaperworkArtifact() {
  const { colors } = useTheme();

  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 84, height: 78 }}>
    <View style={{ position: "absolute", width: 65, height: 52, top: 20, left: 7, borderRadius: 8, backgroundColor: colors.primary, transform: [{ rotate: "-6deg" }] }} />
    <View style={{ position: "absolute", width: 29, height: 10, top: 14, left: 7, borderTopLeftRadius: 5, borderTopRightRadius: 7, backgroundColor: colors.primary, transform: [{ rotate: "-6deg" }] }} />
    <View style={{ position: "absolute", width: 43, height: 57, top: 5, left: 32, borderRadius: 4, backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.border, transform: [{ rotate: "12deg" }] }} />
    <View style={{ position: "absolute", width: 44, height: 59, top: 2, left: 19, borderRadius: 4, padding: 8, gap: 6, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, transform: [{ rotate: "-5deg" }] }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.accent }} />
      <View style={{ height: 2, width: 27, backgroundColor: colors.borderStrong }} />
      <View style={{ height: 2, width: 21, backgroundColor: colors.border }} />
      <View style={{ height: 2, width: 25, backgroundColor: colors.border }} />
    </View>
    <View style={{ position: "absolute", width: 66, height: 29, top: 43, left: 10, borderRadius: 7, backgroundColor: colors.primary, borderTopWidth: 1, borderTopColor: colors.borderStrong, transform: [{ rotate: "-6deg" }] }}>
      <View style={{ width: 19, height: 4, borderRadius: 2, backgroundColor: colors.accent, top: 12, left: 10 }} />
    </View>
  </View>;
}

export function BriefHeading({ eyebrow, title, detail, children }: { eyebrow?: string; title: string; detail?: string; children?: ReactNode }) {
  const { colors } = useTheme();

  return <View style={{ gap: spacing.lg }}>
    {eyebrow ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{eyebrow}</Text> : null}
    <Text accessibilityRole="header" style={[editorial, { color: colors.foreground }]}>{title}</Text>
    {detail ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{detail}</Text> : null}
    {children}
  </View>;
}

export function QuietAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={() => { Keyboard.dismiss(); onPress(); }}
    style={({ pressed }) => ({ minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.surfaceRaised, opacity: disabled ? 0.5 : 1 })}>
    <Text style={[typography.body, { fontWeight: "600", color: colors.primary }]}>{label}</Text>
  </Pressable>;
}

export function BriefRow({ title, detail, value, onPress }: { title: string; detail?: string; value?: string; onPress: () => void }) {
  const { colors } = useTheme();

  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.2 || width < 350;
  return <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onPress(); }} style={({ pressed }) => ({
    minHeight: 64, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: "row", alignItems: "center", gap: spacing.md, opacity: pressed ? 0.65 : 1,
  })}>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>{title}</Text>
      {detail ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{detail}</Text> : null}
      {stacked && value ? <Text style={[typography.body, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{value}</Text> : null}
    </View>
    {!stacked && value ? <Text style={[typography.body, { maxWidth: "40%", color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{value}</Text> : null}
    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
  </Pressable>;
}

export function ReadNotice({ message, onRetry, busy = false }: { message: string; onRetry: () => void; busy?: boolean }) {
  const { colors } = useTheme();

  return <View style={{ padding: spacing.lg, gap: spacing.xs, borderRadius: 12, backgroundColor: colors.surfaceSubtle }}>
    <Text accessibilityRole="alert" style={[typography.body, { color: colors.foreground }]}>{message}</Text>
    {busy ? <ActivityIndicator accessibilityLabel="Checking saved information" color={colors.primary} /> : null}
    <QuietAction label={busy ? "Checking…" : "Try again"} disabled={busy} onPress={onRetry} />
  </View>;
}

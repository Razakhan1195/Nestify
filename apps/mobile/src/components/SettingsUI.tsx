import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import type { MembershipPayload } from "@/lib/membership";
import { membershipPresentation } from "@/lib/membership-presentation";
import { colors, premium, typography } from "@/theme/tokens";
export type SettingsIcon = ComponentProps<typeof Feather>["name"];
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={[typography.label, { color: colors.mutedForeground, marginLeft: 4 }]}>{title}</Text><View style={{ borderRadius: 22, backgroundColor: colors.card, paddingHorizontal: 18, borderWidth: 1, borderColor: premium.line }}>{children}</View></View>;
}
export function SettingsRow({ icon, title, detail, onPress, last = false, danger = false }: { icon: SettingsIcon; title: string; detail?: string; onPress: () => void; last?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onPress(); }} style={({ pressed }) => ({ minHeight: 72, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: premium.line, opacity: pressed ? 0.65 : 1 })}>
    <View accessible={false} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: danger ? colors.criticalBg : colors.background, alignItems: "center", justifyContent: "center" }}><Feather name={icon} size={18} color={danger ? colors.criticalForeground : colors.primary} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text style={[typography.body, { fontWeight: "600", color: danger ? colors.criticalForeground : colors.foreground }]}>{title}</Text>{detail ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{detail}</Text> : null}</View><Feather name="chevron-right" size={17} color={colors.mutedForeground} />
  </Pressable>;
}
export function MembershipCard({ data, unavailable = false, actionLabel, onPress }: { data: MembershipPayload | null; unavailable?: boolean; actionLabel?: string; onPress: () => void }) {
  const plan = membershipPresentation(data);
  return <Pressable accessibilityRole="button" accessibilityLabel={unavailable ? "Membership could not refresh. View membership" : `${plan.title}. ${plan.badge}. ${actionLabel ?? plan.action}`} onPress={onPress} style={({ pressed }) => ({ borderRadius: 18, backgroundColor: colors.surfaceSubtle, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}>
    <View accessible={false} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Feather name={plan.pro ? "star" : "home"} size={18} color={colors.primary} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text style={[typography.section, { color: colors.primary }]}>{plan.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{unavailable ? "Couldn’t refresh · tap to check" : plan.lifetime ? "Yours for life · See benefits" : data?.membership?.household ? "Shared with you · See benefits" : data?.membership?.source === "referral" && plan.pro ? "Your gift month · See benefits" : plan.pro ? "Your plan · See benefits" : data?.membership||data?.enabled===false ? "Free plan · Explore Pro" : "Checking your plan…"}</Text></View>
    <Feather name="chevron-right" size={18} color={colors.primary} />
  </Pressable>;
}

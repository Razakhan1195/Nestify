import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { editorialType, typography } from "@/theme/tokens";

/* Static imports keep artwork bundled and available offline. */
/* eslint-disable @typescript-eslint/no-require-imports */
const sections = {
  care: { image: require("../../assets/care/shared-home.jpg"), title: "Less chasing. More living.", detail: "A few useful jobs. Everyone knows their part. Pick a routine and make it yours." },
  insights: { image: require("../../assets/collections/insights.jpg"), title: "See what changed.", detail: "Understand your charges and find a useful next step." },
  accounts: { image: require("../../assets/collections/accounts.jpg"), title: "Your providers, together.", detail: "Find your provider, connect when supported and keep its statements together." },
  expenses: { image: require("../../assets/collections/expenses.jpg"), title: "Everyone’s share, clear.", detail: "Choose who paid and who shares the cost. Keep track of who owes whom, together." },
  records: { image: require("../../assets/collections/records.jpg"), title: "Keep what matters.", detail: "Receipts, policies and manuals, ready when you need them." },
  "home-items": { image: require("../../assets/collections/home-items.jpg"), title: "Know your home.", detail: "Keep models, receipts and useful details with each belonging." },
  warranties: { image: require("../../assets/collections/warranties.jpg"), title: "Coverage, close at hand.", detail: "Proof of purchase and saved coverage dates, together." },
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */
export type CollectionSection = keyof typeof sections;
/** One feature, one explicit next step. Compact once the collection is in use. */
export function CollectionIntro({ section, spacious = false, compact = false, actionLabel, onPress, disabled = false, title, detail, eyebrow }: {
  section: CollectionSection; spacious?: boolean; compact?: boolean; actionLabel: string; onPress: () => void;
  disabled?: boolean; title?: string; detail?: string; eyebrow?: string;
}) {
  const { colors } = useTheme();

  const item = sections[section], { fontScale } = useWindowDimensions();
  const stacked = spacious || fontScale > 1.3;
  // Returning customers need the action, not the introductory artwork again.
  // Natural-height text preserves the control at larger accessibility sizes.
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel={actionLabel}
    accessibilityHint={detail ?? item.detail} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1,
      borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
      opacity: disabled ? .6 : 1 })}>
    <Text style={[typography.body, { color: colors.primary, fontWeight: "600", flex: 1 }]}>{actionLabel}</Text>
    <Feather accessible={false} name="arrow-right" size={19} color={colors.primary} />
  </Pressable>;
  return <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityHint={detail ?? item.detail}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 24, padding: spacious ? 20 : 16, opacity: disabled ? .6 : pressed ? .78 : 1 })}>
    <View style={{ gap: 10 }}>
      {stacked ? <Image source={item.image} accessible={false} alt="" resizeMode="contain" style={{ width: "100%", height: spacious ? 160 : 110 }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {!stacked ? <Image source={item.image} accessible={false} alt="" resizeMode="contain" style={{ width: 72, height: 64 }} /> : null}
        <View style={{ flex: 1, gap: 6 }}>
          {eyebrow ? <Text style={[typography.label, { color: colors.primary }]}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" style={[editorialType, { fontSize: spacious ? 28 : 23, lineHeight: spacious ? 34 : 28, color: colors.foreground }]}>{title ?? item.title}</Text>
        </View>
      </View>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{detail ?? item.detail}</Text>
      <View style={{ minHeight: 44, paddingTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[typography.body, { color: colors.primary, fontWeight: "600", flexShrink: 1 }]}>{actionLabel}</Text>
        <Feather name="arrow-right" size={21} color={colors.primary} />
      </View>
    </View>
  </Pressable>;
}

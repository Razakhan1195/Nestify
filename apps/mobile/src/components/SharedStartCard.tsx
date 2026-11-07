import { useTheme } from "@/theme/useTheme";
import { Text, View, useWindowDimensions } from "react-native";
import { Button } from "./Button";
import { radii, spacing, typography } from "@/theme/tokens";

function SharedReceiptArt() {
  const { colors } = useTheme();

  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 84, height: 88, justifyContent: "center", alignItems: "center" }}>
    <View style={{ width: 62, height: 76, borderRadius: 8, backgroundColor: colors.surfaceRaised, padding: 10, transform: [{ rotate: "8deg" }], gap: 7 }}>
      <View style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
      <View style={{ height: 2, backgroundColor: colors.borderStrong }} />
      {[30, 38, 24].map(width => <View key={width} style={{ width, height: 3, borderRadius: 2, backgroundColor: colors.borderStrong }} />)}
      <View style={{ flexDirection: "row", gap: 4, paddingTop: 3 }}><View style={{ flex: 1, height: 9, borderRadius: 3, backgroundColor: colors.primary }} /><View style={{ flex: 1, height: 9, borderRadius: 3, backgroundColor: colors.info }} /></View>
    </View>
  </View>;
}

export function SharedStartCard({ ready, hasEntries, onAdd, compact = false }: { compact?: boolean; ready: boolean; hasEntries: boolean; onAdd: () => void }) {
  const { colors } = useTheme();

  const { fontScale } = useWindowDimensions();
  return <View style={{ backgroundColor: colors.surfaceSubtle, padding: spacing.lg, borderRadius: radii.xl, gap: spacing.md }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, { flex: 1, color: colors.foreground }]}>Split household costs</Text>
      {!compact && fontScale <= 1.3 ? <SharedReceiptArt /> : null}
    </View>
    <Text style={[typography.body, { color: colors.foreground }]}>Choose who paid and who shares the expense. Rezlee keeps track of who owes whom.</Text>
    {hasEntries ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>Your recorded activity stays below. Start sharing by including another person.</Text> : null}
    <Button label="Add shared expense" disabled={!ready} onPress={onAdd} />
    <Text style={[typography.caption, { color: colors.mutedForeground }]}>Include someone now; they can join later. An accepted household invitation gives them access.</Text>
  </View>;
}

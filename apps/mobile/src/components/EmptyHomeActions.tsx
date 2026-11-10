import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { JourneyHeading } from "./JourneyUI";
import { useTheme } from "@/theme/useTheme";
import { typography } from "@/theme/tokens";

export function EmptyHomeActions({ onBill, onRecord, onReminder, onSplit }: {
  onBill: () => void; onRecord: () => void; onReminder: () => void; onSplit: () => void;
}) {
  const { colors } = useTheme();
  const actions: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; run: () => void }[] = [
    { icon: "file-text", title: "Add a bill", detail: "Upload a statement or connect a provider.", run: onBill },
    { icon: "folder", title: "Save a record", detail: "Keep a receipt, warranty or document.", run: onRecord },
    { icon: "calendar", title: "Create a reminder", detail: "Choose something you want to remember.", run: onReminder },
    { icon: "users", title: "Split an expense", detail: "Record who paid and who shares the cost.", run: onSplit },
  ];
  return <View style={{ gap: 24 }}>
    <JourneyHeading title="Your home, in one place." detail="Bills, records, reminders and shared expenses." />
    <View style={{ gap: 12 }}>{actions.map(action => <Pressable key={action.title} accessibilityRole="button" accessibilityLabel={action.title} accessibilityHint={action.detail} onPress={action.run}
      style={({ pressed }) => ({ padding: 18, minHeight: 98, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 14, opacity: pressed ? 0.75 : 1 })}>
      <View accessible={false} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}><Feather name={action.icon} size={25} color={colors.primary} /></View>
      <View style={{ flex: 1, gap: 5 }}><Text style={[typography.section, { color: colors.foreground }]}>{action.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{action.detail}</Text></View>
      <Feather accessible={false} name="chevron-right" size={18} color={colors.primary} />
    </Pressable>)}</View>
    <Text style={[typography.meta, { color: colors.mutedForeground, textAlign: "center" }]}>Start whenever you’re ready.</Text>
  </View>;
}

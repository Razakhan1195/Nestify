import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { provinces } from "@/lib/canadian-address";
import { layout, radii, spacing, typography } from "@/theme/tokens";
export function ProvincePicker({ value, onChange, disabled = false, error }: { value: string; onChange: (value: string) => void; disabled?: boolean; error?: string }) {
  const { colors } = useTheme();

  const [open, setOpen] = useState(false);
  return <View style={{ gap: 6 }}>
    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Province or territory</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={"Province or territory, " + (value || "not selected")} accessibilityState={{ expanded: open, disabled }}
      accessibilityHint={error} aria-invalid={Boolean(error)} disabled={disabled} onPress={() => setOpen(true)}
      style={{ minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: error ? colors.criticalForeground : colors.border, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1, fontSize: 16, color: value ? colors.foreground : colors.mutedForeground }}>{value || "Select province or territory"}</Text>
      <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={{ fontSize: 13, lineHeight: 18, color: colors.criticalForeground }}>{error}</Text> : null}
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: layout.screenHorizontal, flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
          <Text accessibilityRole="header" style={[typography.title, { flex: 1, color: colors.foreground }]}>Province or territory</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close province picker" onPress={() => setOpen(false)} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Feather name="x" size={23} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingBottom: spacing.xl }}>
          {provinces.map(([code, name]) => <Pressable key={code} accessibilityRole="radio" accessibilityState={{ checked: name === value }} onPress={() => { onChange(name); setOpen(false); }}
            style={{ minHeight: 56, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Text style={[typography.body, { flex: 1, color: colors.foreground }]}>{name}</Text>
            {name === value ? <Feather name="check" size={20} color={colors.primary} /> : null}
          </Pressable>)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { useTheme } from "@/theme/useTheme";
import { typography } from "@/theme/tokens";
import type { AppearancePreference } from "@/theme/appearance";

const options = [
  { value: "system", title: "System", detail: "Follow your device’s appearance.", icon: "smartphone" },
  { value: "light", title: "Light", detail: "Warm paper and forest green.", icon: "sun" },
  { value: "dark", title: "Dark", detail: "Soft charcoal and gentle greens.", icon: "moon" },
] as const;
export default function AppearanceScreen() {
  const { colors, preference, setPreference } = useTheme();
  const [error, setError] = useState(false);
  function select(value: AppearancePreference) {
    try { setPreference(value); setError(false); } catch { setError(true); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Appearance" fallback="/account" />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Make Rezlee comfortable to use, day or night. This choice applies on this device.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="App appearance" style={{ gap: 12 }}>
        {options.map(option => {
          const selected = preference === option.value;
          return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={option.title + ". " + option.detail} onPress={() => select(option.value)}
            style={({ pressed }) => ({ minHeight: 88, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.surfaceSubtle : colors.card, opacity: pressed ? 0.8 : 1, flexDirection: "row", alignItems: "center", gap: 16 })}>
            <Feather name={option.icon} size={24} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}><Text style={[typography.section, { color: colors.foreground }]}>{option.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{option.detail}</Text></View>
            <Feather name={selected ? "check-circle" : "circle"} size={22} color={selected ? colors.primary : colors.mutedForeground} />
          </Pressable>;
        })}
      </View>
      {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>Your appearance choice couldn’t be saved. Please try again.</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

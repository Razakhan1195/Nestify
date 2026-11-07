import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { HomeTaskArtwork } from "@/components/HomeTaskArtwork";
import { typography } from "@/theme/tokens";

export function HomeShortcuts() {
  const { colors } = useTheme();

  const router = useRouter();
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 350;
  return <View style={{ flexDirection: stacked ? "column" : "row", gap: 12 }}>
    {[{ title: "Add a bill", detail: "Scan or enter details", tint: colors.shortcutBill, route: "/bill/add", art: <HomeTaskArtwork goal="bills" small /> }, { title: "Save a record", detail: "Receipt, policy or warranty", tint: colors.shortcutRecord, route: "/vault-record", art: <HomeTaskArtwork goal="records" small /> }].map(item => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.route as never)} style={({ pressed }) => ({ flex: 1, padding: 16, gap: 10, borderRadius: 20, backgroundColor: item.tint, opacity: pressed ? 0.75 : 1, flexDirection: stacked ? "row" : "column", alignItems: stacked ? "center" : "flex-start" })}>
      {item.art}<View style={{ flexShrink: 1, gap: 5 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={[typography.section, { color: colors.foreground, flexShrink: 1 }]}>{item.title}</Text><Feather name="arrow-up-right" size={16} color={colors.primary} /></View><Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.detail}</Text></View>
    </Pressable>)}
  </View>;
}

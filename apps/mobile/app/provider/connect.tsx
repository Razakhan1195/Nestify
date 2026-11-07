import { useTheme } from "@/theme/useTheme";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { ProviderFinder } from "@/components/ProviderFinder";
import { layout } from "@/theme/tokens";

export default function ConnectProviderScreen() {
  const { colors } = useTheme();

  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  if (providerId) return <Redirect href={{ pathname: "/provider/deck", params: { providerId } }} />;
  return <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScreenNavigation title="Connect a provider" fallback="/(tabs)/bills" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40 }}>
      <ProviderFinder />
    </ScrollView>
  </SafeAreaView>;
}

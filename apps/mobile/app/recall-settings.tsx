import { useTheme } from "@/theme/useTheme";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { RecallPreferences } from "@/components/RecallPreferences";
import { spacing } from "@/theme/tokens";
export default function RecallSettingsScreen() {
  const { colors } = useTheme();

 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
  <ScreenNavigation title="Recall preferences" fallback="/recalls" />
  <ScrollView contentContainerStyle={{padding:spacing.xl}}><RecallPreferences /></ScrollView>
 </SafeAreaView>;
}

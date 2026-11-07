import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { HomeTaskArtwork, getTaskPalette } from "@/components/HomeTaskArtwork";
import { exampleStatements, isStartingGoal, startingContent, startingHistory } from "@/lib/home-start";
import { layout, typography } from "@/theme/tokens";

export default function HomeExampleScreen() {
  const { colors, premium } = useTheme();
  const taskPalette = useThemeMemo(() => getTaskPalette(colors), [colors, premium]);

  const router = useRouter();
  const { session, isLoading } = useAuth();
  const params = useLocalSearchParams<{ goal?: string }>();
  const goal = isStartingGoal(params.goal) ? params.goal : "bills";
  const history = startingHistory(exampleStatements, true, "2026-07-01")!;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="See an example" fallback={session ? "/(tabs)/home" : "/(auth)/welcome"} />
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ padding: layout.screenHorizontal, gap: 24, paddingBottom: 36 }}>
      <View style={{ gap: 6 }}>
        <Text style={[typography.label, { color: colors.warningForeground }]}>Example only</Text>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Fictional details to show how this works. Nothing here is added to your home.</Text>
      </View>
      {goal === "bills" ? <>
        <View style={{ backgroundColor: taskPalette.bills.surface, borderRadius: 22, padding: 22, gap: 18 }}>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>Example electricity account · April to June</Text>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>Daily charges rose 20%</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>June averaged $3.60 a day, compared with $3.00 a day across April and May.</Text>
          <View accessible accessibilityLabel="Average daily charges: April 3 Canadian dollars, May 3 Canadian dollars, June 3 dollars 60 cents." style={{ gap: 10 }}>
            {[...history.analysis.window].reverse().map((period, index) => <View key={period.bill.id} style={{ gap: 5 }}>
              <View style={{ flexDirection: "row", gap: 12 }}><Text style={[typography.meta, { flex: 1, color: colors.foreground }]}>{["April", "May", "June"][index]}</Text><Text style={[typography.meta, { color: colors.foreground }]}>${(period.dailyMinor / 100).toFixed(2)} / day</Text></View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.chartTrack }}><View style={{ height: 8, borderRadius: 4, width: `${period.dailyMinor / 360 * 100}%`, backgroundColor: index === 2 ? colors.primary : taskPalette.bills.accent }} /></View>
            </View>)}
          </View>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>Based on 3 completed statements. Different period lengths are accounted for.</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>A useful next step</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>Check June’s original statement for higher usage, changed fees or an expired discount.</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>The totals alone cannot tell us which caused the increase. Usage and electricity-plan comparisons need additional supported utility data.</Text>
        </View>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Start with one statement. After three eligible periods for the same account, you can compare daily charges like this.</Text>
      </> : <>
        <View style={{ backgroundColor: taskPalette[goal].surface, borderRadius: 22, padding: 22, gap: 14 }}>
          <HomeTaskArtwork goal={goal} />
          <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>{goal === "records" ? "Washing machine warranty" : "Check the furnace filter"}</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{goal === "records" ? "Expiry recorded: October 31, 2027\nOriginal receipt attached" : "Due October 1\nRepeats monthly"}</Text>
        </View>
        <View style={{ gap: 10 }}><Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{goal === "records" ? "Ready when you need it" : "From planned to done"}</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{goal === "records" ? "Open the record in Vault to find its dates, notes and original file. You can edit the details or replace the attachment later." : "Open the task in Care, then mark it done when you finish. For a repeating task, Rezlee schedules its next occurrence."}</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>{goal === "records" ? "Saved dates help you keep track. The original warranty terms determine what is covered." : "Tasks appear in the app. Saving a task does not turn on push reminders."}</Text>
        </View>
      </>}
      <Button label={session ? startingContent[goal].action : "Create an account"} disabled={isLoading} onPress={() => router.replace(session ? startingContent[goal].route as never : "/(auth)/signup")} />
      {!session ? <Button label="Back to the introduction" variant="secondary" onPress={() => router.replace("/(auth)/welcome")} /> : null}
    </ScrollView>
  </SafeAreaView>;
}

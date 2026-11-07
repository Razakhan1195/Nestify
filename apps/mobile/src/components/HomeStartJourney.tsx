import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { getTaskPalette } from "@/components/HomeTaskArtwork";
import { startingContent, startingGoals, type StartingGoal } from "@/lib/home-start";
import { HomeFeatureTile } from "./HomeFeatureTile";
import { homeTile, typography } from "@/theme/tokens";

export function StartingGoalOptions({ selected, onSelect, disabled = false }: {
  selected: StartingGoal; onSelect: (goal: StartingGoal) => void; disabled?: boolean;
}) {
  const { colors, premium } = useTheme();
  const taskPalette = useThemeMemo(() => getTaskPalette(colors), [colors, premium]);

  return <View accessibilityRole="radiogroup" accessibilityLabel="What would help today?" style={{ gap: 10 }}>
    {startingGoals.map(goal => <Pressable key={goal} accessibilityRole="radio" accessibilityState={{ checked: selected === goal, disabled }}
      disabled={disabled} onPress={() => onSelect(goal)} style={({ pressed }) => ({ minHeight: 82, padding: 14, borderRadius: 16,
        borderWidth: 1, borderColor: selected === goal ? colors.primary : colors.border,
        backgroundColor: selected === goal || pressed ? taskPalette[goal].surface : colors.surfaceRaised,
        flexDirection: "row", alignItems: "center", gap: 12, opacity: disabled ? 0.6 : 1 })}>
      <Feather name={selected === goal ? "check-circle" : "circle"} size={20} color={colors.primary} />
      <View style={{ flex: 1, gap: 4 }}><Text style={[typography.section, { color: colors.foreground }]}>{startingContent[goal].label}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{startingContent[goal].benefit}</Text></View>
    </Pressable>)}
  </View>;
}

const tileContent = {
  bills: { title: "Understand your bills", detail: "Understand the charges. See what changed as you add bills.", action: "Add a bill" },
  records: { title: "Keep records handy", detail: "Find the receipt or warranty when something goes wrong.", action: "Save a record" },
  care: { title: "Less to remember", detail: "Give the next home task a date. Keep it in view until it’s done.", action: "Create a reminder" },
} as const;

export function TaskTile({ goal, onStart }: { goal: StartingGoal; onStart: (goal: StartingGoal) => void }) {
  const { colors, premium } = useTheme();
  const taskPalette = useThemeMemo(() => getTaskPalette(colors), [colors, premium]);

  const content = tileContent[goal];
  return <HomeFeatureTile title={content.title} detail={content.detail} action={content.action} artwork={goal} backgroundColor={taskPalette[goal].surface} onPress={()=>onStart(goal)}/>;
}

export function HomeStartJourney({ remaining, onStart }: {
  remaining: StartingGoal[]; onStart: (goal: StartingGoal) => void;
}) {
  const { colors } = useTheme();

  const router = useRouter();
  if (!remaining.length) return null;
  return <View style={{ gap: homeTile.groupGap }}>
    {remaining.map(goal => <View key={goal} style={{ gap: 4 }}>
      <TaskTile goal={goal} onStart={onStart} />
      {goal === "bills" ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 20 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/provider/connect")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>Or connect a provider →</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="See an example bill insight" onPress={() => router.push({ pathname: "/home-example", params: { goal: "bills" } })} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.meta, { color: colors.primary }]}>See an example</Text>
        </Pressable>
      </View> : null}
    </View>)}
  </View>;
}

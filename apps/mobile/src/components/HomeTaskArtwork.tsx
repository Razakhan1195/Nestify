import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import type { StartingGoal } from "@/lib/home-start";


export const getTaskPalette = (colors: Colors) => ({
  bills: { surface: colors.artBillSurface, accent: colors.artBillAccent, paper: colors.artBillPaper },
  records: { surface: colors.artRecordSurface, accent: colors.artRecordAccent, paper: colors.artRecordPaper },
  care: { surface: colors.artCareSurface, accent: colors.artCareAccent, paper: colors.artCarePaper },
} as const);

// Original paper constructions: a statement, a tabbed folder and a task planner.
// Decorative only; numbers and charts belong to the customer's actual content.
export function HomeTaskArtwork({ goal, small = false }: { goal: StartingGoal; small?: boolean }) {
  const { colors, premium } = useTheme();
  const taskPalette = useThemeMemo(() => getTaskPalette(colors), [colors, premium]);

  const palette = taskPalette[goal];
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: small ? 74 : 112, height: small ? 65 : 98, justifyContent: "center", alignItems: "center" }}>
    <View style={{ width: 112, height: 98, transform: [{ scale: small ? 0.65 : 1 }] }}>
      <View style={{ position: "absolute", width: 88, height: 16, borderRadius: 44, backgroundColor: palette.accent, opacity: 0.09, bottom: 2, left: 13, transform: [{ rotate: "-8deg" }] }} />
      {goal === "records" ? <>
        <View style={{ position: "absolute", left: 10, top: 23, width: 88, height: 62, backgroundColor: palette.accent, borderRadius: 8, transform: [{ rotate: "-9deg" }] }} />
        <View style={{ position: "absolute", left: 14, top: 15, width: 35, height: 18, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: palette.accent, transform: [{ rotate: "-9deg" }] }} />
        <View style={{ position: "absolute", left: 30, top: 9, width: 56, height: 70, borderRadius: 4, backgroundColor: colors.surfaceRaised, transform: [{ rotate: "6deg" }], padding: 10, gap: 7 }}>
          <View style={{ width: 15, height: 15, borderWidth: 2, borderColor: palette.accent, borderRadius: 8 }} />
          {[32, 26, 30].map((width, i) => <View key={i} style={{ width, height: 2, backgroundColor: palette.paper }} />)}
        </View>
        <View style={{ position: "absolute", left: 15, top: 48, width: 90, height: 41, borderRadius: 7, backgroundColor: palette.paper, transform: [{ rotate: "-9deg" }], padding: 12 }}>
          <View style={{ width: 27, height: 6, borderRadius: 2, backgroundColor: colors.surfaceRaised }} />
        </View>
      </> : <>
        <View style={{ position: "absolute", left: 18, top: 16, width: 63, height: 73, borderRadius: 6, backgroundColor: palette.paper, transform: [{ rotate: "-13deg" }] }} />
        <View style={{ position: "absolute", left: 36, top: 5, width: 62, height: 78, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, transform: [{ rotate: "8deg" }], padding: 10, gap: 7 }}>
          <View style={{ height: 15, flexDirection: "row", gap: 4, alignItems: "center" }}>
            <View style={{ width: 15, height: 15, borderRadius: goal === "bills" ? 8 : 3, backgroundColor: palette.paper }} />
            <View style={{ width: 21, height: 3, backgroundColor: palette.accent, opacity: 0.55 }} />
          </View>
          {[30, 24, 34].map((width, i) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {goal === "care" ? <View style={{ width: 6, height: 6, borderWidth: 1, borderColor: palette.accent, borderRadius: 1, backgroundColor: i === 0 ? palette.paper : "transparent" }} /> : null}
            <View style={{ width: goal === "care" ? width - 10 : width, height: 2, backgroundColor: palette.paper }} />
          </View>)}
          {goal === "bills" ? <View style={{ width: 38, height: 1, backgroundColor: palette.accent, opacity: 0.3 }} /> : null}
        </View>
        <View style={{ position: "absolute", bottom: 4, left: 8, width: 31, height: 31, borderRadius: 16, backgroundColor: palette.accent, justifyContent: "center", alignItems: "center", borderWidth: 3, borderColor: palette.surface }}>
          <Feather name={goal === "bills" ? "file-text" : "check"} size={14} color={colors.primaryForeground} />
        </View>
      </>}
    </View>
  </View>;
}

import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BriefRow, QuietAction, ReadNotice } from "@/components/Brief";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { fetchCare, type CareTask } from "@/lib/care-data";
import { colors, layout, spacing, typography } from "@/theme/tokens";
export default function CareHistory() {
  const router = useRouter();
  const [tasks, setTasks] = useState<CareTask[] | null>(null), [error, setError] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    try { const p = await fetchCare(); if (version === request.current) { setTasks(p.needsOnboarding ? [] : p.tasks.filter(t => t.status === "completed")); setError(false); } }
    catch { if (version === request.current) setError(true); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Completed Care" fallback="/account" />
    <FlatList data={tasks ?? []} keyExtractor={item => item.id} contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40 }}
      ListHeaderComponent={<View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>The things you’ve taken care of</Text>
        <Text style={[typography.body, { color: colors.mutedForeground }]}>Tasks recorded as completed in your accessible Care records. Deleted tasks and past recurring completions may not appear here.</Text>
        {error ? <ReadNotice message={tasks ? "Couldn’t refresh. Showing previously loaded tasks." : "Completed tasks couldn’t be loaded."} onRetry={() => void load()} /> : null}
        {!tasks && !error ? <ActivityIndicator accessibilityLabel="Loading completed tasks" /> : null}
      </View>}
      renderItem={({ item }) => <BriefRow title={item.title} detail={["Recorded as completed", item.category].filter(Boolean).join(" · ")} onPress={() => router.push({ pathname: "/care/[id]", params: { id: item.id } })} />}
      ListEmptyComponent={tasks && !error ? <View style={{ gap: spacing.md }}><Text style={[typography.section, { color: colors.foreground }]}>Your completed tasks will appear here</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>Mark a task done in Care, then return to its details whenever you need them.</Text><QuietAction label="Open Care" onPress={() => router.push("/(tabs)/care")} /></View> : null} />
  </SafeAreaView>;
}

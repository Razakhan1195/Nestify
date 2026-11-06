import { useCallback, useState } from "react";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { colors, spacing, typography } from "@/theme/tokens";
type Match = { key: string; itemId: string; itemName: string; reason: string; status: string; recall: { id: string; title: string; product: string; url: string; issue: string; action: string; updated: string } };
type Payload = { checkedAt: string; itemCount: number; missingBrandCount: number; matches: Match[] };
export default function RecallsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string; saved?: string }>();
  const itemId = typeof params.itemId === "string" ? params.itemId : undefined;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiGet<Payload>("/api/mobile/v1/recalls")); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not check recalls. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function save(match: Match, status: string) {
    setWorking(match.key); setError(null);
    try {
      await apiPost("/api/mobile/v1/recalls", { itemId: match.itemId, recallId: match.recall.id, updated: match.recall.updated, status });
      setData((current) => current ? { ...current, matches: current.matches.map((m) => m.key === match.key ? { ...m, status } : m) } : current);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save your review."); }
    finally { setWorking(null); }
  }
  function confirm(match: Match, status: "handled" | "dismissed") {
    Alert.alert(status === "handled" ? "Have you followed the recall instructions?" : "This notice does not apply?",
      status === "handled" ? "Mark handled after completing the action in the official notice." : "Check the model, serial number and affected dates in the official notice first.",
      [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: () => void save(match, status) }]);
  }
  const matches = data?.matches.filter((m) => !itemId || m.itemId === itemId) ?? [];
  const open = matches.filter((m) => m.status === "open");
  const visible = reviewed ? matches.filter((m) => m.status !== "open") : open;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Recall Watch" fallback="/(tabs)/vault" />
    <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      {params.saved === "1" ? <Text style={[typography.body, { color: colors.foreground }]}>Item saved. Recall results below are for this item.</Text> : null}
      {itemId ? <Pressable accessibilityRole="button" onPress={() => router.setParams({ itemId: undefined, saved: undefined })} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.body, { color: colors.primary }]}>View recalls for all home items</Text></Pressable> : null}
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Check your saved home items against Health Canada consumer product notices. Potential matches need you to confirm the model and affected dates.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push("/recall-settings")} style={{minHeight:44,justifyContent:"center"}}><Text style={[typography.body,{color:colors.primary}]}>Notification preferences</Text></Pressable>
      <Button label={loading ? "Checking recalls…" : "Check again"} disabled={loading || Boolean(working)} onPress={() => void load()} />
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.criticalForeground }}>{error}</Text> : null}
      {data ? <>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>Source checked {new Date(data.checkedAt).toLocaleString()} · {data.itemCount} saved items</Text>
        {data.missingBrandCount ? <Text style={[typography.body, { color: colors.warningForeground }]}>{data.missingBrandCount} item(s) need a brand in their saved details before they can be matched.</Text> : null}
        <Button label={reviewed ? "Show notices to review (" + open.length + ")" : "Show reviewed notices (" + (matches.length - open.length) + ")"} onPress={() => setReviewed(!reviewed)} />
        {!visible.length ? <Surface><Text style={[typography.body, { color: colors.foreground }]}>{reviewed ? "No reviewed notices." : !data.itemCount ? "Add home items to your inventory to check them here." : "No potential matches found in the available notice descriptions. This is not a guarantee that your items are recall-free."}</Text></Surface> : null}
        {visible.map((match) => <Surface key={match.key} style={{ gap: spacing.md }}>
          <Text style={[typography.caption, { color: colors.warningForeground }]}>{match.status === "open" ? "Potential match" : match.status === "handled" ? "Handled" : "Marked not applicable"} · {match.itemName}</Text>
          <Text style={[typography.section, { color: colors.foreground }]}>{match.recall.title}</Text>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{match.reason} · Updated {match.recall.updated}</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{match.recall.issue}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>{match.recall.action}</Text>
          <Button label="Read official recall and instructions" onPress={() => { void Linking.openURL(match.recall.url).catch(() => setError("Could not open the official notice. Please try again.")); }} />
          {match.status === "open" ? <View style={{ gap: spacing.sm }}>
            <Button label="I've taken the required action" disabled={Boolean(working) || loading} onPress={() => confirm(match, "handled")} />
            <Button label="Does not apply to my item" disabled={Boolean(working) || loading} onPress={() => confirm(match, "dismissed")} />
          </View> : <Button label="Reopen for review" disabled={Boolean(working) || loading} onPress={() => void save(match, "open")} />}
        </Surface>)}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

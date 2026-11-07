import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { FilterChips } from "@/components/FilterChips";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { useTheme } from "@/theme/useTheme";
import { editorialType, typography } from "@/theme/tokens";
import { updateRoadmapSafety, fetchRoadmap, roadmapCategories, roadmapStatuses, voteOnRoadmap, type RoadmapItem, type RoadmapList, type RoadmapStatus } from "@/lib/roadmap";

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export default function RoadmapScreen() {
 const { session, isLoading } = useAuth();
 const params = useLocalSearchParams<{ view?: string }>();
 if (isLoading) return <ActivityIndicator accessibilityLabel="Loading roadmap"/>;
 if (!session) return <Redirect href="/(auth)/login"/>;
 return <Roadmap key={session.user.id+":"+(params.view??"public")} userId={session.user.id}/>;
}
function Roadmap({ userId }: { userId: string }) {
 const { colors } = useTheme(), router = useRouter(), params = useLocalSearchParams<{ view?: string }>();
 const [mine, setMine] = useState(params.view === "mine"), [status, setStatus] = useState<RoadmapStatus>("all"), [sort, setSort] = useState("top");
 const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [data, setData] = useState<RoadmapList | null>(null), [page, setPage] = useState(0);
 const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(""), [voting, setVoting] = useState<string | null>(null);
 const [filtersOpen, setFiltersOpen] = useState(false);
 const [safetyBusy, setSafetyBusy] = useState(false), [notice, setNotice] = useState("");
 const safetyLock = useRef(false);
 const generation = useRef(0), active = useRef(false), voteLock = useRef(false);
 useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300); return () => clearTimeout(timer); }, [search]);
 const load = useCallback(async (pulled = false) => {
  const version = ++generation.current; setLoading(true); setRefreshing(pulled); setError("");
  try {
   const next = await fetchRoadmap(userId, { mine, status, sort, search: query, page });
   if (active.current && generation.current === version) setData(next);
  } catch (e) {
   if (active.current && generation.current === version) { setData(null); setError(e instanceof Error ? e.message : "The roadmap couldn’t load. Try again."); }
  } finally { if (active.current && generation.current === version) { setLoading(false); setRefreshing(false); } }
 }, [userId, mine, status, sort, query, page]);
 useFocusEffect(useCallback(() => { active.current = true; void load(); return () => { active.current = false; generation.current++; }; }, [load]));
 async function vote(item: RoadmapItem, value: -1 | 1) {
  if (voteLock.current || safetyLock.current) return; voteLock.current = true; setVoting(item.id); setError(""); const version = generation.current;
  try {
   const next = await voteOnRoadmap(userId, item.id, item.myVote === value ? 0 : value);
   if (active.current && generation.current === version) setData(old => old ? { ...old, items: old.items.map(x => x.id === item.id ? { ...x, ...next } : x) } : old);
  } catch (e) { if (active.current && generation.current === version) setError(e instanceof Error ? e.message : "Your vote couldn’t be confirmed. Try again."); }
  finally { voteLock.current = false; if (active.current) setVoting(null); }
 }
 async function safety(action: "hide" | "block" | "report" | "reset", item?: RoadmapItem, reason?: string) {
  if (safetyLock.current || voteLock.current) return;
  safetyLock.current = true; setSafetyBusy(true); setError(""); setNotice("");
  try {
   await updateRoadmapSafety(userId, action, item?.id, reason);
   if (!active.current) return;
   setNotice(action === "report" ? "Report received. This idea is hidden from your roadmap while we review it." : action === "block" ? "Author blocked. Their current and future ideas are hidden from you." : action === "reset" ? "Hidden ideas and blocked authors have been restored." : "Idea hidden from your roadmap.");
   await load();
  } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "We couldn’t confirm the change. Please retry."); }
  finally { safetyLock.current = false; if (active.current) setSafetyBusy(false); }
 }
 function options(item: RoadmapItem) {
  Alert.alert("Manage this idea", item.title, [
   { text: "Hide idea", onPress: () => void safety("hide", item) },
   ...(item.canBlock ? [{ text: "Block author", onPress: () => Alert.alert("Block this author?", "Their current and future roadmap ideas will be hidden from you. You can restore them using Reset hidden ideas and blocked authors.", [{ text: "Cancel", style: "cancel" as const }, { text: "Block author", style: "destructive" as const, onPress: () => void safety("block", item) }]) }] : []),
   { text: "Cancel", style: "cancel" },
  ]);
 }
 function report(item: RoadmapItem) {
  Alert.alert("Report this idea", "Reports are private. Choose a reason; the idea will also be hidden from your roadmap.", [
   { text: "Abuse or harmful content", onPress: () => void safety("report", item, "abuse") },
   { text: "Privacy, spam or another concern", onPress: () => void safety("report", item, "other") },
   { text: "Cancel", style: "cancel" },
  ]);
 }
 return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
  <ScreenNavigation title="Rezlee roadmap" fallback="/account"/>
  <FlatList data={loading && !refreshing ? [] : data?.items ?? []} keyExtractor={item => item.id} initialNumToRender={6}
   keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
   contentContainerStyle={{ padding: 20, paddingBottom: 44, gap: 16 }}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary}/>}
   ListHeaderComponent={<View style={{ gap: 14, paddingBottom: 0 }}>
    <View style={{ gap: 8 }}><Text accessibilityRole="header" style={[editorialType, { fontSize: 28, lineHeight: 34, color: colors.foreground }]}>Help shape Rezlee.</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>We’re a small team building with you. Tell us what would make life at home easier.</Text><Text style={[typography.meta, { color: colors.foreground }]}>We’ll reply within seven calendar days with a decision, priority and reason.</Text></View>
    <Button label="Share an idea" onPress={() => router.push("/roadmap-suggest")}/>
    <FilterChips options={[{ value: "public", label: "Roadmap" }, { value: "mine", label: "Your ideas" }]} selected={mine ? "mine" : "public"} onSelect={value => { setMine(value === "mine"); setPage(0); }}/>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} accessibilityLabel="Search and filter ideas" onPress={() => setFiltersOpen(value => !value)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Text style={[typography.meta, { color: colors.mutedForeground, flex: 1 }]}>{query ? `“${query}” · ` : ""}{roadmapStatuses.find(option => option.value === status)?.label} · {sort === "top" ? "Most supported" : "Newest"}{data ? ` · ${data.total}` : ""}</Text><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Feather name="sliders" size={16} color={colors.primary}/><Text style={[typography.meta, { color: colors.primary }]}>{filtersOpen ? "Hide filters" : "Filters"}</Text></View></Pressable>
    {filtersOpen ? <View style={{ gap: 14 }}><TextField label="Search ideas" placeholder="Search the roadmap…" maxLength={120} value={search} onChangeText={setSearch} autoCorrect={false}/>
    <FilterChips options={roadmapStatuses} selected={status} onSelect={value => { setStatus(value); setPage(0); }}/>
    <FilterChips options={[{ value: "top", label: "Most supported" }, { value: "newest", label: "Newest" }]} selected={sort} onSelect={value => { setSort(value); setPage(0); }}/></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.primary }]}>{notice}</Text> : null}
    {error ? <Surface tone="subtle" style={{ gap: 12 }}><Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text><Button variant="secondary" label="Try again" disabled={loading} onPress={() => void load()}/></Surface> : null}
   </View>}
   ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading ideas" color={colors.primary} style={{ marginVertical: 24 }}/> : error ? null : <Surface style={{ gap: 8 }}><Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{query || status !== "all" ? "No matching ideas" : mine ? "Your next idea starts here" : "Help set the direction"}</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>{query || status !== "all" ? "Try another search or choose All ideas." : mine ? "Share a suggestion to see its response and progress here." : "Share an idea. Reviewed suggestions appear here for everyone to vote on."}</Text></Surface>}
   renderItem={({ item }) => <RoadmapCard asOf={data?.generatedAt ?? item.createdAt} item={item} voting={voting} disabled={loading || !!voting || safetyBusy} onManage={() => options(item)} onReport={() => report(item)} onVote={value => void vote(item, value)}/>}
   ListFooterComponent={<View style={{ gap: 16, paddingTop: 12 }}>{data && data.total > 30 ? <><Text style={[typography.meta, { color: colors.mutedForeground }]}>Page {page + 1} of {Math.ceil(data.total / 30)}</Text><View style={{ flexDirection: "row", gap: 12 }}><View style={{ flex: 1 }}><Button variant="secondary" label="Previous" disabled={loading || page === 0} onPress={() => setPage(p => p - 1)}/></View><View style={{ flex: 1 }}><Button variant="secondary" label="Next" disabled={loading || (page + 1) * 30 >= data.total} onPress={() => setPage(p => p + 1)}/></View></View></> : null}<Text style={[typography.meta, { color: colors.mutedForeground }]}>Votes help us prioritize. Planned work can change and isn’t a promised delivery date.</Text><Button variant="secondary" label="Reset hidden ideas and blocked authors" disabled={safetyBusy || !!voting} onPress={() => Alert.alert("Restore hidden content?", "This will show ideas you hid and allow blocked authors’ ideas to appear again. Your reports remain with the team.", [{ text: "Cancel", style: "cancel" }, { text: "Reset", onPress: () => void safety("reset") }])}/><Button variant="secondary" label="Report a problem privately" onPress={() => router.push("/feedback")}/></View>}
  />
 </SafeAreaView>;
}
function RoadmapCard({ item, voting, disabled, onVote, asOf, onManage, onReport }: { onManage: () => void; onReport: () => void; asOf: string; item: RoadmapItem; voting: string | null; disabled: boolean; onVote: (value: -1 | 1) => void }) {
 const { colors } = useTheme();
 return <Surface style={{ gap: 14 }}>
  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}><Text style={[typography.meta, { color: colors.primary }]}>{roadmapStatuses.find(s => s.value === item.status)?.label}</Text>{item.priority !== "none" ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>· {item.priority === "next" ? "Up next" : "Later"}</Text> : null}<Text style={[typography.meta, { color: colors.mutedForeground }]}>· {roadmapCategories.find(c => c.value === item.category)?.label}</Text></View>
  <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{item.title}</Text>
  <Text style={[typography.body, { color: colors.mutedForeground }]}>{item.description}</Text>
  {item.response ? <View style={{ padding: 16, gap: 8, borderRadius: 16, backgroundColor: colors.surfaceSubtle }}><Text style={[typography.meta, { color: colors.foreground }]}>From the Rezlee team · {date(item.updatedAt)}</Text><Text style={[typography.body, { color: colors.foreground }]}>{item.response}</Text></View> : null}
  {item.mine && !item.decidedAt ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.visibility === "pending" ? "Only you and the team can see this while we check it for the public roadmap. " : ""}{Date.parse(item.responseDueAt) < Date.parse(asOf) ? "Our response is overdue. Your idea remains in the team’s review queue." : "Our decision is due by " + date(item.responseDueAt) + "."}</Text> : null}
  {item.visibility === "hidden" ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>Visible only to you and the team.</Text> : item.visibility === "public" ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}><View style={{ flexDirection: "row", gap: 12 }}>{([1, -1] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: item.myVote === value, disabled }} accessibilityLabel={(value === 1 ? "Upvote " : "Downvote ") + item.title + (item.myVote === value ? ". Selected. Tap to remove." : "")} disabled={disabled} onPress={() => onVote(value)} style={{ minWidth: 70, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: item.myVote === value ? colors.accent : colors.surface, borderWidth: 1, borderColor: item.myVote === value ? colors.primary : colors.border, opacity: disabled ? 0.6 : 1 }}><Feather name={value === 1 ? "arrow-up" : "arrow-down"} size={18} color={item.myVote === value ? colors.primary : colors.foreground}/><Text style={[typography.body, { color: colors.foreground }]}>{value === 1 ? item.upvotes : item.downvotes}</Text></Pressable>)}</View><Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.mutedForeground }]}>{voting === item.id ? "Saving your vote…" : "One vote per account. Tap again to remove."}</Text></View> : null}
  {!item.mine && item.visibility === "public" ? <View style={{ gap: 8 }}><Button variant="secondary" label={item.canBlock ? "Hide or block" : "Hide idea"} disabled={disabled} onPress={onManage}/><Button variant="secondary" label="Report idea" disabled={disabled} onPress={onReport}/></View> : null}
 </Surface>;
}

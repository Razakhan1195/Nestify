import { useTheme } from "@/theme/useTheme";
import { ActionFeedback } from "@/components/ActionFeedback";
import { CareFeedback } from "@/components/CareFeedback";
import { QuietAction, ReadNotice } from "@/components/Brief";
import { homeAttentionHref } from "@/lib/home-overview";
import { DetailLoading } from "@/components/DetailLoading";
import { attentionScreen, applyAttentionDismissal, applyAttentionRestoration, careNotice, clearCareNotice } from "@/lib/screen-state";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Feather } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { attentionSections } from "@/lib/attention-scope";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Pressable,
  SectionList,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import type { AttentionItem } from "@/lib/home-data";
import {
  fetchNeedsYou, dismissAttention, restoreAttention, type AttentionDismissal,
  type NeedsYouSection, type NeedsYouPayload,
} from "@/lib/needs-you-data";
import { layout, severityColors, spacing, typography } from "@/theme/tokens";

const sourceIcons: Record<
  AttentionItem["sourceType"],
  keyof typeof Feather.glyphMap
> = {
  bill: "credit-card",
  care: "tool",
  vault: "archive",
  provider: "refresh-cw",
  help: "alert-triangle",
};

function ActionRow({
  item,
  onPress, onDismiss, busy,
}: {
  item: AttentionItem;
  onPress: () => void; onDismiss: () => void; busy: boolean;
}) {
  const { colors } = useTheme();

  const tone = severityColors(item.severity, colors);

  return (
    <View><Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. View details`}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.66 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          backgroundColor: tone.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather
          name={sourceIcons[item.sourceType]}
          size={17}
          color={tone.fg}
        />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{
            fontSize: 14.5,
            lineHeight: 19,
            fontWeight: "700",
            color: colors.foreground,
          }}
        >
          {item.title}
        </Text>
        <Text
          style={[
            typography.caption,
            { color: colors.mutedForeground, lineHeight: 17 },
          ]}
        >
          {item.explanation}
        </Text>
        <Text
          style={{ fontSize: 11, fontWeight: "700", color: tone.fg }}
        >
          {item.meta}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={18}
        color={colors.mutedForeground}
      />
    </Pressable><QuietAction label="Dismiss item" disabled={busy} onPress={onDismiss}/></View>
  );
}

function SectionHeading({ section }: { section: NeedsYouSection }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        paddingTop: spacing.xl,
        paddingBottom: spacing.sm,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <Text style={[typography.section, { color: colors.foreground }]}>
          {section.title}
        </Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>
          {section.items.length}
        </Text>
      </View>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>
        {section.detail}
      </Text>
    </View>
  );
}

export default function NeedsYouScreen() {
  const {session} = useAuth();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const careOnly = source === "care";
  return <><ScreenNavigation title={careOnly ? "Care reminders" : "Needs attention"} fallback={careOnly ? "/(tabs)/care" : "/(tabs)/home"}/><NeedsYouContent key={`${session?.user.id}:${careOnly}`} careOnly={careOnly}/></>;
}

function NeedsYouContent({ careOnly }: { careOnly: boolean }) {
  const { colors } = useTheme();

  const router = useRouter();
  const { session } = useAuth();
  const request = useRef(0), saving = useRef(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [undo, setUndo] = useState<(AttentionDismissal & {previous: Exclude<NeedsYouPayload,{needsOnboarding:true}>}) | null>(null);
  const [notice, setNotice] = useState<{message:string;completionVersion:number} | null>(null);
  const completion = useSyncExternalStore(careNotice.subscribe, careNotice.getSnapshot);
  const completionVersion = useSyncExternalStore(careNotice.subscribe, careNotice.getVersion);
  const currentNotice = notice?.completionVersion === completionVersion ? notice.message : null;
  const payload = useSyncExternalStore(attentionScreen.subscribe, attentionScreen.getSnapshot);
  const sections = attentionSections(payload && !payload.needsOnboarding ? payload.sections : [], careOnly);
  const count = sections.reduce((total, section) => total + section.items.length, 0);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    const version = ++request.current;
    if (refresh) setIsRefreshing(true);
    setError(null);
    try {
      await fetchNeedsYou(refresh);
    } catch (loadError) {
      if (version === request.current) setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Could not load what needs your attention.",
      );
    } finally {
      if (version === request.current) setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { request.current++; };
    }, [load]),
  );

  async function changeAttention(dismissal?: typeof undo, itemKey?: string) {
    if (saving.current || !session || !payload || payload.needsOnboarding || !payload.homeId) return;
    const homeId = payload.homeId, userId = session.user.id;
    const keys = itemKey ? [itemKey] : sections.flatMap(section => section.items.map(item => item.key)).slice(0, 500);
    saving.current = true; setMutationBusy(true); setError(null);
    try {
      if (dismissal) {
        const restored = await restoreAttention(dismissal, userId);
        clearCareNotice();
        request.current++;
        applyAttentionRestoration(homeId, restored.keys, dismissal.previous);
        setUndo(null); setNotice({completionVersion:careNotice.getVersion(),message:restored.keys.length ? "Dismissal undone. The items are back in your attention list." : "These items have changed and could not be restored."});
        void load(true);
      } else {
        const result = await dismissAttention(homeId, keys, userId);
        clearCareNotice();
        // Invalidate earlier reads so they cannot put just-dismissed rows back.
        request.current++;
        applyAttentionDismissal(homeId, result.keys);
        setUndo(result.keys.length ? {...result, previous: payload} : null);
        setNotice({completionVersion:careNotice.getVersion(),message:result.keys.length ? `${result.keys.length} ${result.keys.length === 1 ? "item dismissed" : "items dismissed"}. Bills and tasks are unchanged.` : "These items are no longer active."});
        if (!result.keys.length) await load(true);
      }
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Could not confirm the change. Refresh your list before trying again.");
    } finally { saving.current = false; setMutationBusy(false); }
  }
  function confirmDismissAll() {
    if (!payload || payload.needsOnboarding || !count || saving.current || error) return;
    Alert.alert(careOnly ? "Dismiss these Care reminders?" : "Dismiss these attention items?", careOnly ? "Remove these reminders from your attention list? The tasks stay open in Care, and their schedules stay the same. You can undo this dismissal." : "Remove these items from the attention list? Bills, tasks and connections will stay unchanged. You can undo this dismissal.", [
      { text: "Cancel", style: "cancel" },
      { text: "Dismiss all", onPress: () => void changeAttention() },
    ]);
  }

  function openItem(item: AttentionItem) {
    router.push(homeAttentionHref(item) as never);
  }

  if (!payload && !error) {
    return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}><DetailLoading label="Checking what needs attention…"/></SafeAreaView>;
  }

  if (payload?.needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (error && !payload) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.md,
            paddingHorizontal: spacing["2xl"],
          }}
        >
          <Feather
            name="alert-circle"
            size={28}
            color={colors.criticalForeground}
          />
          <Text
            style={[
              typography.body,
              { color: colors.foreground, textAlign: "center" },
            ]}
          >
            {error}
          </Text>
          <Pressable onPress={() => void load()}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: colors.primary,
              }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!payload || payload.needsOnboarding) return null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["bottom"]}
    >
      <SectionList
        sections={sections.map((section) => ({
          ...section,
          data: section.items,
        }))}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        scrollEnabled={!mutationBusy}
        onRefresh={() => { if (!saving.current) void load(true); }}
        contentContainerStyle={{
          paddingHorizontal: layout.screenHorizontal,
          paddingBottom: spacing["4xl"],
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingTop: spacing.lg }}>
            {error ? <ReadNotice message={error} busy={isRefreshing || mutationBusy} onRetry={() => void load(true)} /> : null}
            <Text style={[typography.body, { color: colors.foreground }]}>
              {careOnly ? `${count} Care ${count === 1 ? "reminder" : "reminders"}` : count === 1 ? "1 attention item" : `${count} attention items`}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.mutedForeground, lineHeight: 18 },
              ]}
            >
              Open an item to act on it. Dismiss removes it from this list without completing the underlying task.
            </Text>
            {count > 0 && payload.homeId ? <QuietAction label={count > 500 ? "Dismiss first 500 items" : careOnly ? "Dismiss all Care reminders" : "Dismiss all items"} disabled={Boolean(error) || isRefreshing || mutationBusy} onPress={confirmDismissAll}/> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeading section={section as NeedsYouSection} />
        )}
        renderItem={({ item }) => (
          <ActionRow item={item} busy={mutationBusy} onPress={() => openItem(item)} onDismiss={() => void changeAttention(undefined, item.key)} />
        )}
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              gap: spacing.sm,
              paddingVertical: spacing["4xl"],
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: colors.foreground,
              }}
            >
              {careOnly ? "No Care reminders to dismiss" : "No attention items"}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.mutedForeground, textAlign: "center" },
              ]}
            >
              {careOnly ? "Your tasks and their dates remain in Care. Dismissing a reminder does not complete a task." : "Bills, tasks and connections remain available in their sections."}
            </Text>
          </View>
        }
      />
      {completion ? <CareFeedback/> : currentNotice ? <ActionFeedback message={currentNotice} actionLabel={undo ? "Undo dismissal" : undefined} onAction={undo ? () => void changeAttention(undo) : undefined} busy={mutationBusy} onClose={() => {setNotice(null);setUndo(null);}}/> : null}
    </SafeAreaView>
  );
}


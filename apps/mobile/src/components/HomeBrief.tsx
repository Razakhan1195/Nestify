import { useTheme } from "@/theme/useTheme";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { useAuth } from "@/auth/AuthProvider";
import { useReviewedBillChanges } from "@/lib/use-reviewed-bill-changes";
import { QuietAction } from "./Brief";
import { Feather } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { HomePayload } from "@/lib/home-data";
import type { BillAccountOverview } from "@/lib/bill-account-overview";
import { buildHomeBrief } from "@/lib/home-outcome-brief";
import { startingContent, type StartingGoal } from "@/lib/home-start";
import { editorialType, typography } from "@/theme/tokens";

export function HomeBrief({ home, accounts, failed, loading, updating = false, careDueCount = 0, providerBusy, startingGoal = "bills" }: {
  home: Exclude<HomePayload, { needsOnboarding: true }>; accounts: BillAccountOverview[];
  failed: boolean; loading: boolean; updating?: boolean; careDueCount?: number; providerBusy: boolean; startingGoal?: StartingGoal;
}) {
  const { colors, premium } = useTheme();

  const router = useRouter(), { session } = useAuth();
  const reviews = useReviewedBillChanges(session?.user.id ?? null, home.home.id);
  const [reviewPresentation, setReviewPresentation] = useState<string | null>(null);
  useFocusEffect(useCallback(() => () => setReviewPresentation(null), []));
  const heldKey = reviewPresentation === reviews.undo ? reviewPresentation : null;
  // Keep the acknowledged change visible, but always rebuild the rest from
  // current records so a newly arrived urgent item is never hidden by Undo.
  const brief = buildHomeBrief(home, accounts, { failed, loading, providerBusy, careDueCount, reviewed: reviews.keys.filter(key => key !== heldKey) });
  const [lead, ...rest] = brief.items;
  const reviewed = (item: typeof brief.items[number]) => Boolean(heldKey && item.reviewKey === heldKey);
  const reviewAction = (item: typeof brief.items[number]) => <QuietAction
    label={reviews.busy ? "Saving…" : reviewed(item) ? "Undo review" : "Mark reviewed"}
    disabled={!reviews.ready || reviews.busy}
    onPress={() => {
      if (reviewed(item)) void reviews.restore();
      else { setReviewPresentation(item.reviewKey!); void reviews.mark(item.reviewKey!); }
    }}/>;

  const empty = !home.hasMeaningfulHouseholdData && !brief.incomplete && !loading && !providerBusy && !lead;
  const starter = startingContent[startingGoal];
  const pending = loading && !lead && !brief.incomplete;
  const calm = !lead && !empty && !brief.incomplete;
  const ink = calm ? colors.foreground : premium.onInk;
  const secondaryInk = calm ? colors.mutedForeground : premium.onInkMuted;
  const title = lead?.title ?? (empty && home.accessRole === "owner" ? starter.title : brief.title);
  const detail = lead?.detail ?? (empty && home.accessRole === "owner" ? starter.description : brief.detail);
  const action = lead ? { label: lead.label, href: lead.href } : empty
    ? home.accessRole === "owner" ? { label: starter.action, href: starter.route } : { label: "Open shared Care", href: "/(tabs)/care" }
    : null;
  return <View style={{ gap: 14 }}>
    <View style={{ backgroundColor: calm ? colors.surfaceRaised : premium.ink, borderRadius: 24, borderWidth: 1, borderColor: calm ? colors.borderStrong : premium.ink, overflow: "hidden", padding: 22, gap: 14, minHeight: calm ? 178 : undefined }}>
      {!pending && !calm && <AmbientBackdrop dark />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {loading || updating ? <ActivityIndicator size="small" color={calm ? colors.primary : premium.onInkMuted} accessibilityLabel="Checking saved information" /> : <Feather accessible={false} name={brief.incomplete ? "cloud-off" : lead?.urgent ? "alert-circle" : "sun"} size={17} color={calm ? colors.primary : premium.apricot} />}
        <Text style={[typography.label, { color: secondaryInk, flex: 1 }]}>{lead && reviewed(lead) ? "REVIEWED" : brief.incomplete ? "LAST LOADED INFORMATION" : lead ? lead.urgent ? "NEEDS YOUR ATTENTION" : lead.kind === "change" ? "A CHANGE TO UNDERSTAND" : "YOUR NEXT STEP" : empty ? "GET STARTED" : "HOUSEHOLD SUMMARY"}</Text>
      </View>
      {pending ? <View accessible accessibilityLabel="Loading your home summary" accessibilityState={{ busy: true }} style={{ gap: 18, paddingTop: 4 }}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: 9 }}>
          <View style={{ height: 23, width: "84%", borderRadius: 6, backgroundColor: colors.border }} />
          <View style={{ height: 23, width: "60%", borderRadius: 6, backgroundColor: colors.border }} />
        </View>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: 9, opacity: 0.65 }}>
          {["100%", "94%", "72%"].map(width => <View key={width} style={{ height: 12, width: width as `${number}%`, borderRadius: 4, backgroundColor: colors.border }} />)}
        </View>
      </View> : <>
      <Text accessibilityRole="header" style={[editorialType, { fontSize: calm ? 24 : 29, lineHeight: calm ? 31 : 36, color: ink }]}>{title}</Text>
      <Text style={[typography.body, { color: secondaryInk }]}>{detail}</Text>
      </>}
      {action ? <Pressable accessibilityRole="button" onPress={() => router.push(action.href as never)} style={({ pressed }) => ({ minHeight: 50, borderRadius: 16, backgroundColor: premium.onInk, paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.8 : 1 })}>
        <Text style={[typography.body, { color: premium.ink, fontWeight: "600", flex: 1 }]}>{lead && reviewed(lead) ? "View details" : action.label}</Text><Feather accessible={false} name="arrow-right" size={19} color={premium.ink} />
      </Pressable> : null}
      {lead && !loading ? <Text style={[typography.caption, { color: secondaryInk }]}>{reviewed(lead) ? "Reviewed on this device · Bill unchanged" : "From your saved records"}{brief.incomplete ? " · Updates incomplete" : ""}</Text> : null}
    </View>
    {lead?.kind === "change" && lead.reviewKey ? reviewAction(lead) : null}
    {rest.map(item => <View key={item.key}>
      <Pressable accessibilityRole="button" onPress={() => router.push(item.href as never)} style={({ pressed }) => ({ padding: 18, borderRadius: 20, backgroundColor: colors.surfaceRaised, gap: 6, opacity: pressed ? 0.7 : 1 })}>
        <Text style={[typography.caption, { color: item.urgent ? colors.warningForeground : colors.mutedForeground }]}>{reviewed(item) ? "Reviewed · Bill unchanged" : item.kind === "change" ? "What changed" : item.urgent ? "Needs attention" : "Also to review"}</Text>
        <Text style={[typography.section, { color: colors.foreground }]}>{item.title}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.detail}</Text>
        <Text style={[typography.meta, { color: colors.primary, fontWeight: "600", paddingVertical: 8 }]}>{item.label} →</Text>
      </Pressable>
      {item.kind === "change" && item.reviewKey ? reviewAction(item) : null}
    </View>)}
    {reviews.error ? <View><Text accessibilityRole="alert" style={[typography.meta, { color: colors.criticalForeground }]}>Review status could not be saved. Try again.</Text><QuietAction label="Try again" onPress={reviews.retry} /></View> : null}
    {home.attentionCount > 0 ? <QuietAction label={`View ${home.attentionCount} attention ${home.attentionCount === 1 ? "item" : "items"}`} onPress={() => router.push("/needs-you")} /> : null}
  </View>;
}


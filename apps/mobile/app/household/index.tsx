import { useTheme } from "@/theme/useTheme";
import { useTabScrollTop } from "@/lib/use-tab-scroll-top";
import { approvePhoneInvitation, openPhoneInvitation } from "@/lib/phone-invites";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {ProfileGroup} from "@/components/ProfileUI";
import { Feather } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BriefRow, QuietAction } from "@/components/Brief";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import { fetchHousehold, removeHouseholdPerson, type HouseholdMember, type HouseholdPayload } from "@/lib/household-data";
import { layout, radii, spacing, typography } from "@/theme/tokens";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function MemberRow({ member, onRemove, canManage }: { member: HouseholdMember; onRemove: (member: HouseholdMember) => void; canManage: boolean }) {
  const { colors } = useTheme();

  const owner = member.role === "owner";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md }}>
      <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: owner ? colors.primary : colors.accent, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: owner ? colors.primaryForeground : colors.primary }}>{initials(member.display_name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{member.display_name}</Text>
          
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{owner ? "Household owner" : member.relationship || "Household member"}</Text>
          {!owner && canManage ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.full, backgroundColor: member.status === "active" ? colors.successBg : colors.warningBg }}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: member.status === "active" ? colors.successForeground : colors.warningForeground }}>
                {member.status === "active" ? "JOINED" : member.status === "invited" ? member.inviteExpired ? "INVITE EXPIRED" : "INVITE PENDING" : canManage ? "MANAGED BY YOU" : "MANAGED BY OWNER"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {!owner && canManage ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.display_name}`} onPress={() => onRemove(member)} style={{ width: 44, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
          <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HouseholdScreen({ embedded = false }: { embedded?: boolean }) {
  const { colors } = useTheme();

  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  useTabScrollTop("household", scroll, embedded);
  const [payload, setPayload] = useState<HouseholdPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try { setPayload(await fetchHousehold()); }
    catch (loadError) { setError(loadError instanceof ApiError ? loadError.message : "Could not load your household."); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function approve(member: HouseholdMember) {
    const userId = member.phoneInvite?.request_user_id;
    if (!userId) return;
    try { await approvePhoneInvitation(member.id, userId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t approve this request. Refresh and try again."); }
  }
  function confirmRemove(member: HouseholdMember) {
    const pending = member.status === "invited";
    Alert.alert(
      pending ? `Cancel ${member.display_name}’s invitation?` : `Remove ${member.display_name}?`,
      pending
        ? "This cancels the pending invitation. You can then send a fresh invitation from Invite someone."
        : "They’ll lose Household access. Existing Care and shared-expense history stays intact.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: pending ? "Cancel invitation" : "Remove",
          style: "destructive",
          onPress: () => void removeHouseholdPerson(member.id).then(load).catch((e) => setError(e instanceof ApiError ? e.message : pending ? "Could not cancel this invitation." : "Could not remove this person.")),
        },
      ],
    );
  }

  if (loading) return <SafeAreaView edges={embedded ? ["left", "right"] : ["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: embedded ? "transparent" : colors.background, alignItems: "center", justifyContent: "center" }}>{!embedded ? <ScreenNavigation title="Household" fallback="/account" /> : null}<ActivityIndicator color={colors.primary} /></SafeAreaView>;
  if (payload && "needsOnboarding" in payload) return <Redirect href="/onboarding" />;
  if (!payload || !payload.available) return <SafeAreaView edges={embedded ? ["left", "right"] : ["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: embedded ? "transparent" : colors.background }}>{!embedded ? <ScreenNavigation title="Household" fallback="/account" /> : null}<View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.md }}><Feather name="users" size={28} color={colors.primary} /><Text style={[typography.title, { color: colors.foreground }]}>Household unavailable</Text><Text style={[typography.body, { color: colors.mutedForeground, textAlign: "center" }]}>We could not load household collaboration right now.</Text><QuietAction label="Try again" onPress={() => void load()} /></View></SafeAreaView>;

  const isOwner = payload.accessRole === "owner";
  const hasSharedPeople = payload.members.some(member => member.role === "member" && member.status === "active");
  const hasResponsibilities = payload.summary.assignedOpenCount > 0 || payload.summary.activeRotationCount > 0;

  return (
    <SafeAreaView edges={embedded ? ["left", "right"] : ["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: embedded ? "transparent" : colors.background }}>
      {!embedded ? <ScreenNavigation title="Household" fallback="/account" /> : null}
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingTop: spacing.lg, paddingBottom: spacing["4xl"], gap: spacing.xl }}>
        <Surface tone="subtle" style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>{payload.home.nickname}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Your people and shared responsibilities, in one place.</Text>
          {isOwner ? <QuietAction label="Invite someone" onPress={() => router.push("/household/add")} /> : <Text style={[typography.meta, { color: colors.mutedForeground }]}>You’re a member of this household.</Text>}
        </Surface>

        {isOwner && payload.phoneInvitesAvailable === false ? <Text style={[typography.meta, { color: colors.warningForeground }]}>Phone invitation status couldn’t be checked. Refresh before approving access.</Text> : null}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={[typography.section, { color: colors.foreground }]}>People</Text><Text style={[typography.caption, { color: colors.mutedForeground }]}>{payload.members.length}</Text></View>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>{payload.members.map((member, index) => <View key={member.id} style={{ borderBottomWidth: index === payload.members.length - 1 ? 0 : 1, borderBottomColor: colors.border }}><MemberRow member={member} onRemove={confirmRemove} canManage={isOwner} />{isOwner && member.phoneInvite && member.status === "invited" ? <View style={{ gap: 8, paddingBottom: 12 }}>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>{member.phoneInvite.request_email ? "Join request from " + member.phoneInvite.request_email : "Phone invitation prepared · Delivery not confirmed"}</Text>
            {!member.inviteExpired && member.phoneInvite.request_user_id ? <QuietAction label="Review join request" onPress={() => Alert.alert("Confirm it’s " + member.display_name, "Approve " + member.phoneInvite!.request_email + " only if this is their account. This grants access to shared expenses and Care, including shared history.", [{ text: "Not now", style: "cancel" }, { text: "Approve access", onPress: () => void approve(member) }])} /> : !member.inviteExpired ? <QuietAction label="Open invitation in Messages" onPress={() => void openPhoneInvitation(member.id).catch(e => setError(e instanceof Error ? e.message : "Couldn’t open Messages."))} /> : null}
          </View> : null}</View>)}</View>

        </View>

        <BriefRow title="Shared expenses" detail="Keep track of who paid and everyone’s share" onPress={() => router.push("/(tabs)/bills?section=shared")} />

        <ProfileGroup title="Household settings">
          <BriefRow title="Household details" detail={isOwner ? "Change the name everyone sees" : "View your household name"} onPress={() => router.push("/household/details")} />
          <BriefRow title="Sharing and privacy" detail="What members can access and what stays private" onPress={() => router.push("/household/sharing")} />
        </ProfileGroup>

        <View style={{ gap: spacing.md }}>
          <Text style={[typography.section, { color: colors.foreground }]}>Shared responsibilities</Text>
          {hasResponsibilities ? (
            <Pressable onPress={() => router.push("/(tabs)/care")} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}><Surface style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}><View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" }}><Feather name="repeat" size={18} color={colors.successForeground} /></View><View style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{payload.summary.activeRotationCount ? `${payload.summary.activeRotationCount} active rotation${payload.summary.activeRotationCount === 1 ? "" : "s"}` : `${payload.summary.assignedOpenCount} assigned task${payload.summary.assignedOpenCount === 1 ? "" : "s"}`}</Text><Text style={[typography.caption, { color: colors.mutedForeground }]}>Open Care to see who owns what and what comes next.</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Surface></Pressable>
          ) : hasSharedPeople && isOwner ? (
            <Pressable onPress={() => router.push("/care/routine")} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}><Surface style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}><View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}><Feather name="repeat" size={18} color={colors.primary} /></View><View style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Set up your first rotation</Text><Text style={[typography.caption, { color: colors.mutedForeground }]}>Choose a cleaning rhythm and let Rezlee rotate the next turn fairly.</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Surface></Pressable>
          ) : (
            <Text style={[typography.body, { color: colors.mutedForeground }]}>{isOwner ? "Invite someone first. Then Rezlee can assign or rotate recurring Care tasks between you." : "There are no assigned household responsibilities yet."}</Text>
          )}
        </View>

        {error ? <View style={{ borderRadius: radii.xl, backgroundColor: colors.criticalBg, padding: spacing.md }}><Text style={[typography.meta, { color: colors.criticalForeground }]}>{error}</Text></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useTheme } from "@/theme/useTheme";
import { readGiftInvitation } from "@/lib/gift-invitation";
import { hasSeenQuickGuide } from "@/lib/quick-guide";
import {readIncomingGroupInvite} from "@/lib/expense-group-invites";
import { readIncomingPhoneInvite } from "@/lib/phone-invites";
import { readDeletionReceipt } from "@/lib/account-deletion";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SetupAccount } from "@/components/SetupAccount";
import { useAccountSwitch } from "@/auth/useAccountSwitch";
import { RezleeLoading } from "@/components/RezleeLoading";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { spacing, typography } from "@/theme/tokens";

type Destination = "/gift" | "/quick-guide" | "/onboarding" | "/(tabs)/home" | "/delete-account" | "/household/join" | "/shared/join" | "/(auth)/welcome";

class EntryRecoveryError extends Error {}

export default function Index() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  // Never carry a previous account's resolved destination or recovery state
  // across sign-in/out, including when an earlier read finishes late.
  return <AccountEntry key={session?.user.id ?? "signed-out"} userId={session?.user.id} email={session?.user.email} />;
}

function AccountEntry({ userId, email }: { userId?: string; email?: string }) {
  const { colors } = useTheme();

  const account = useAccountSwitch();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (account.busy) return;
    let active = true;
    void (async () => {
      try {
        // Check durable recovery in order. A failed read must not be mistaken
        // for an absent receipt or invitation, and retry repeats every check.
        let receipt;
        try { receipt = await readDeletionReceipt(userId); }
        catch { throw new EntryRecoveryError("Your saved deletion status couldn’t be read. Try again to continue safely."); }
        if (!active || account.switching.current) return;
        if (receipt && (!userId || receipt.userId === userId)) { setDestination("/delete-account"); return; }
        if (!userId) { setDestination("/(auth)/welcome"); return; }
        const gift = await readGiftInvitation();
        if (!active || account.switching.current) return;
        if (gift) { setDestination("/gift"); return; }
        let invitation;
        try { invitation = await readIncomingPhoneInvite(); }
        catch { throw new EntryRecoveryError("Your saved household invitation couldn’t be checked. Try again to return to it."); }
        if (!active || account.switching.current) return;
        if (invitation) { setDestination("/household/join"); return; }
        let groupInvitation;
        try { groupInvitation = await readIncomingGroupInvite(); }
        catch { throw new EntryRecoveryError("Your saved expense invitation couldn’t be checked. Try again to return to it."); }
        if (!active || account.switching.current) return;
        if (groupInvitation) { setDestination("/shared/join"); return; }
        // The tab entry owns the authenticated home/setup decision. Performing
        // it here as well adds a second sequential network gate on every launch.
        // Durable deletion/invitation recovery still takes precedence above.
        const seen = await hasSeenQuickGuide(userId).catch(() => true);
        if (!active || account.switching.current) return;
        setDestination(seen ? "/(tabs)/home" : "/quick-guide");
      } catch (loadError) {
        if (active && !account.switching.current) setError(loadError instanceof ApiError || loadError instanceof EntryRecoveryError
          ? loadError.message : "We could not load your Rezlee setup. Check your connection and try again.");
      }
    })();
    return () => { active = false; };
  }, [userId, attempt, account.busy, account.switching]);

  const accountControl = userId ? <SetupAccount email={email} busy={account.busy} error={account.error} onSwitch={() => void account.switchAccount()} /> : null;

  if (destination) return <Redirect href={destination} />;
  if (error) {
    return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.md }}>
      <Text style={[typography.title, { color: colors.foreground, textAlign: "center" }]}>Could not load Rezlee</Text>
      <Text accessibilityRole="alert" style={[typography.body, { color: colors.mutedForeground, textAlign: "center" }]}>{error}</Text>
      <Pressable accessibilityRole="button" disabled={account.busy} onPress={() => { setError(null); setAttempt(value => value + 1); }} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>Try again</Text>
      </Pressable>
      {accountControl}
    </View>;
  }
  return <LoadingScreen />;
}

function LoadingScreen() {
  const { colors } = useTheme();

  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
    <RezleeLoading />
  </View>;
}

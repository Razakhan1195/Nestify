import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { ApiError } from "@/lib/api";
import {
  fetchBills,
  formatDueDate,
  markBillPaidRequest,
  statusLabel,
  statusTone,
  type BillListItem,
} from "@/lib/bills-data";
import { formatCurrency } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

const toneColors: Record<string, { fg: string; bg: string }> = {
  critical: { fg: colors.criticalForeground, bg: colors.criticalBg },
  warning: { fg: colors.warningForeground, bg: colors.warningBg },
  info: { fg: colors.infoForeground, bg: colors.infoBg },
  success: { fg: colors.successForeground, bg: colors.successBg },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 14, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{value}</Text>
    </View>
  );
}

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [bill, setBill] = useState<BillListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await fetchBills();
      const found =
        !payload.needsOnboarding && payload.bills.find((item) => item.id === id);
      if (!found) {
        setError("This bill is no longer available.");
      } else {
        setBill(found);
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof ApiError
          ? fetchError.message
          : "We could not load this bill. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkPaid() {
    if (!bill) return;
    setIsMarkingPaid(true);
    setActionError(null);

    try {
      await markBillPaidRequest(bill.id, {
        attentionKey: bill.attentionKey,
        eventType: bill.eventType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (markError) {
      setActionError(
        markError instanceof ApiError
          ? markError.message
          : "Could not mark this bill paid. Please try again.",
      );
    } finally {
      setIsMarkingPaid(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error || !bill) {
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
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={{ fontSize: 15, color: colors.foreground, textAlign: "center" }}>
            {error ?? "This bill is no longer available."}
          </Text>
          <Text
            onPress={() => router.back()}
            style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}
          >
            Go back
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const tone = toneColors[statusTone(bill.status)];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, padding: spacing["2xl"], gap: spacing["2xl"] }}>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radii.full,
              backgroundColor: tone.bg,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: tone.fg }}>
              {statusLabel(bill.status)}
            </Text>
          </View>
          <Text style={[typography.heading, { color: colors.foreground }]}>{bill.label}</Text>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground }}>
            {bill.amount === null ? "Amount not set" : formatCurrency(bill.amount)}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.lg,
          }}
        >
          <Row label="Due" value={formatDueDate(bill.dueDate)} />
          <Row label="Category" value={bill.category} />
          <Row label="Recurrence" value={bill.recurrence || "One-time"} />
          {bill.source === "manual" ? <Row label="Source" value="Added by you" /> : null}
        </View>

        {actionError ? (
          <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{actionError}</Text>
        ) : null}

        {bill.canMarkPaid ? (
          <Button label="Mark as paid" onPress={handleMarkPaid} loading={isMarkingPaid} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

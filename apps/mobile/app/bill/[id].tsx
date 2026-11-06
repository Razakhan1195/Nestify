import { FormScrollView } from "@/components/FormScrollView";
import {TelecomStatementBreakdown} from "@/components/TelecomBillInsights";
import {BillRecordNotice} from "@/components/BillRecordNotice";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import { editorial, QuietAction, ReadNotice } from "@/components/Brief";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { apiGet, ApiError } from "@/lib/api";
import {
  deleteBillRequest,
  fetchBills,
  formatDueDate,
  markBillPaidRequest,
  statusLabel,
  statusTone,
  updateBillRequest,
  type BillListItem,
} from "@/lib/bills-data";
import { formatCurrency } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import { firstStatementSummary } from "@/lib/first-statement";
import { earlierBills, billChange, remainingForBill } from "@/lib/bill-explanation";
import { safeBack } from "@/lib/navigation";
const toneColors: Record<string, { fg: string; bg: string }> = {
  critical: { fg: colors.criticalForeground, bg: colors.criticalBg },
  warning: { fg: colors.warningForeground, bg: colors.warningBg },
  info: { fg: colors.infoForeground, bg: colors.infoBg },
  success: { fg: colors.successForeground, bg: colors.successBg },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.md }}>
      <Text style={[typography.meta, { flex: 1, color: colors.mutedForeground }]}>{label}</Text>
      <Text style={{ flex: 1, textAlign: "right", fontSize: 14, fontWeight: "600", color: colors.foreground }}>{value}</Text>
    </View>
  );
}

function FinancialStat({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={{ flex: 1, minWidth: "44%", gap: 3 }}>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={{
          fontSize: emphasized ? 21 : 17,
          fontWeight: emphasized ? "800" : "700",
          color: colors.foreground,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

type EditFields = {
  name: string;
  amount: string;
  due_date: string;
  category: string;
  provider_name: string;
  account_number: string;
  billing_period_start: string;
  billing_period_end: string;
};

export default function BillDetailScreen() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const [confirmationDismissed, setConfirmationDismissed] = useState(false);
  const router = useRouter();
  const navigation = useNavigation();
  const saveInFlight = useRef(false);
  const [bill, setBill] = useState<BillListItem | null>(null);
  const [history, setHistory] = useState<BillListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editFields, setEditFields] = useState<EditFields>({ name: "", amount: "", due_date: "", category: "", provider_name: "", account_number: "", billing_period_start: "", billing_period_end: "" });
  usePreventRemove(isEditing, ({ data }) => {
    if (saveInFlight.current) { Alert.alert("Saving your changes", "Please wait for the save to finish."); return; }
    Alert.alert("Discard changes?", "Your edits have not been saved.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) }]);
  });
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchBills();
      let found = !payload.needsOnboarding && payload.bills.find((item) => item.id === id);
       if(!found&&id){const direct=await fetchBills(id);found=!direct.needsOnboarding&&direct.bills.find(item=>item.id===id);}
      if (!found) {
        setError("This bill is no longer available.");
        setBill(null);
      } else {
        setBill(found);
        const related = earlierBills(found, payload.needsOnboarding ? [] : payload.bills);
        setHistory(related);
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function beginEdit() {
    if (!bill) return;
    setActionError(null);
    setEditFields({
      name: bill.name,
      amount: bill.amount === null ? "" : String(bill.amount),
      due_date: bill.dueDate ?? "",
      category: bill.category,
      provider_name: bill.providerName ?? "",
      account_number: bill.accountNumber ?? "",
      billing_period_start: bill.billingPeriodStart ?? "",
      billing_period_end: bill.billingPeriodEnd ?? "",
    });
    setIsEditing(true);
  }
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
      await load();
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

  async function saveEdit() {
    if (!bill || saveInFlight.current) return;
    saveInFlight.current = true;
    setIsSaving(true);
    setActionError(null);
    try {
      await updateBillRequest(bill.id, bill.isHistoricalStatement ? editFields : { name: editFields.name, amount: editFields.amount, due_date: editFields.due_date, category: editFields.category });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
      await load();
    } catch (saveError) {
      setActionError(
        saveError instanceof ApiError ? saveError.message : "Could not save this bill.",
      );
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  }
  async function openOriginal() {
    if (!bill || openingOriginal) return;
    setOpeningOriginal(true); setActionError(null);
    try {
      const result = await apiGet<{ url: string }>(`/api/mobile/v1/bills/${bill.id}/original`, { timeoutMs: 15000 });
      await Linking.openURL(result.url);
    } catch (e) { setActionError(e instanceof ApiError ? e.message : "Could not open the original. Try again."); }
    finally { setOpeningOriginal(false); }
  }
  function confirmDelete() {
    if (!bill) return;
    Alert.alert(
      "Remove this bill?",
      (bill.originalDocumentId ? "This removes the bill entry. Its original file stays in your private Vault, where you can remove it separately." : "This removes the manual bill from Rezlee. Bills added through a connected provider stay in your home history.") + (bill.outcomeSummary || bill.reviewSummary ? " Saved actions attached to this statement will also be removed." : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setActionError(null);
            try {
              await deleteBillRequest(bill.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace("/(tabs)/bills");
            } catch (deleteError) {
              setActionError(
                deleteError instanceof ApiError
                  ? deleteError.message
                  : "Could not remove this bill.",
              );
            }
          },
        },
      ],
    );
  }

  if (isLoading && !bill) {
    return (
      <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ScreenNavigation title="Bill details" fallback="/(tabs)/bills"/>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!bill) {
    return (
      <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenNavigation title="Bill details" fallback="/(tabs)/bills"/>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing["2xl"] }}>
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={[typography.body, { color: colors.foreground, textAlign: "center" }]}>{error ?? "This bill is no longer available."}</Text>
          <QuietAction label="Try again" onPress={() => void load()} /><QuietAction label="Go back" onPress={() => safeBack(router, "/(tabs)/bills")} />
        </View>
      </SafeAreaView>
    );
  }

  const tone = toneColors[statusTone(bill.status)];
  const period = bill.billingPeriodStart || bill.billingPeriodEnd
    ? `${formatDueDate(bill.billingPeriodStart)} – ${formatDueDate(bill.billingPeriodEnd)}`
    : null;
  const previous = history[0] ?? null;
  const change = billChange(bill, previous);
  const firstStatement = !change ? firstStatementSummary(bill) : null;
  const comparison =
    previous?.amount != null && bill.amount != null && previous.amount > 0
      ? Math.round(((bill.amount - previous.amount) / previous.amount) * 100)
      : null;
  const historyAmounts = [bill, ...history].filter((item) => item.amount != null);
  const maxHistoryAmount = Math.max(...historyAmounts.map((item) => item.amount ?? 0), 1);
  const billedAmount = bill.amount;
  const isPaid = bill.status === "paid" || bill.paymentStatus === "paid";
  const paidAmount =
    bill.amountPaid ??
    (isPaid && billedAmount !== null ? billedAmount : null);
  const remainingAmount = remainingForBill(bill);
  const scheduledAmount =
    bill.autopayScheduledAmount ??
    (bill.paymentStatus === "scheduled" ? remainingAmount : null);
  const hasConfirmedScheduledPayment =
    scheduledAmount !== null &&
    scheduledAmount > 0 &&
    Boolean(bill.autopayScheduledDate || bill.paymentStatus === "scheduled");
  const autopayEnrolled = bill.autopayStatus === "enrolled";
  const dueDateValue = bill.dueDate ? new Date(`${bill.dueDate}T00:00:00`) : null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue =
    dueDateValue && !Number.isNaN(dueDateValue.getTime())
      ? Math.round((dueDateValue.getTime() - todayStart.getTime()) / 86_400_000)
      : null;
  const partialPayment = bill.paymentStatus === "partial" || (paidAmount ?? 0) > 0;
  const scheduledCopy = bill.autopayScheduledDate
    ? `${formatCurrency(scheduledAmount ?? 0)} is scheduled for ${formatDueDate(bill.autopayScheduledDate)}.`
    : `${formatCurrency(scheduledAmount ?? 0)} is recorded as scheduled.`;

  const paymentState = (() => {
    if (bill.isHistoricalStatement) return {
      icon: "file-text" as const, title: "Saved statement",
      body: "This saved statement records billed charges. It does not confirm what you owe now. Check your provider account before making a payment.",
      tone: "info" as const,
    };
    if (isPaid) {
      return {
        icon: "check-circle" as const,
        title: "Paid",
        body: bill.paymentDate
          ? `Payment recorded ${formatDueDate(bill.paymentDate)}.`
          : "Rezlee has this bill recorded as paid.",
        tone: "success" as const,
      };
    }

    if (bill.status === "incomplete") {
      return {
        icon: "edit-3" as const,
        title: "Finish bill details",
        body: "Add the missing amount, due date or category so Rezlee can track this bill properly.",
        tone: "warning" as const,
      };
    }

    if (bill.status === "overdue") {
      if (hasConfirmedScheduledPayment) {
        return {
          icon: "alert-circle" as const,
          title: "Overdue · payment scheduled",
          body: `${scheduledCopy} This bill is already past due, so check that the payment completes as expected.`,
          tone: "critical" as const,
        };
      }

      if (partialPayment) {
        return {
          icon: "alert-circle" as const,
          title: "Overdue · partially paid",
          body:
            remainingAmount !== null
              ? `${formatCurrency(remainingAmount)} still appears to be outstanding.`
              : "Rezlee has a partial payment recorded, but this bill is still overdue.",
          tone: "critical" as const,
        };
      }

      return {
        icon: "alert-circle" as const,
        title: "Payment appears overdue",
        body:
          remainingAmount !== null
            ? `${formatCurrency(remainingAmount)} still appears to be outstanding.`
            : "Rezlee does not have a paid or scheduled payment recorded for this bill.",
        tone: "critical" as const,
      };
    }

    if (partialPayment) {
      return {
        icon: "pie-chart" as const,
        title: hasConfirmedScheduledPayment
          ? "Partially paid · payment scheduled"
          : "Partially paid",
        body: hasConfirmedScheduledPayment
          ? `${remainingAmount !== null ? `${formatCurrency(remainingAmount)} remains. ` : ""}${scheduledCopy}`
          : remainingAmount !== null
            ? `${formatCurrency(remainingAmount)} still appears to be outstanding.`
            : "Rezlee has a partial payment recorded for this bill.",
        tone: "warning" as const,
      };
    }

    if (hasConfirmedScheduledPayment) {
      return {
        icon: "clock" as const,
        title: "Payment scheduled",
        body: `${scheduledCopy} Scheduled payments are not counted as paid until they complete.`,
        tone: "info" as const,
      };
    }

    if (autopayEnrolled) {
      return {
        icon: "repeat" as const,
        title: "Autopay is on",
        body: "Rezlee sees autopay enabled, but no confirmed payment date or amount is available yet.",
        tone: "info" as const,
      };
    }

    const dueTitle =
      daysUntilDue === 0
        ? "Due today"
        : daysUntilDue === 1
          ? "Due tomorrow"
          : daysUntilDue !== null && daysUntilDue > 1
            ? `Due in ${daysUntilDue} days`
            : "Payment not recorded yet";

    return {
      icon: "calendar" as const,
      title: dueTitle,
      body:
        remainingAmount !== null
          ? `${formatCurrency(remainingAmount)} currently appears to be outstanding.`
          : "Rezlee does not have a payment recorded for this bill yet.",
      tone: bill.status === "due_soon" || daysUntilDue === 0 ? ("warning" as const) : ("info" as const),
    };
  })();
  const paymentTone = toneColors[paymentState.tone];

  return (
    <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenNavigation title="Bill details" fallback="/(tabs)/bills"/>
      <View
        style={{ flex: 1 }}
        
      >
      <FormScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: spacing["2xl"], gap: spacing.xl, paddingBottom: spacing["4xl"] }}
      >
        {error ? <ReadNotice message="We couldn’t load newer information. Showing the last loaded bill." onRetry={() => void load()} busy={isLoading} /> : null}
        {saved === "1" && !confirmationDismissed && bill.source === "manual" && bill.isHistoricalStatement && !isEditing ? <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border }}>
          <Text style={[typography.section, { color: colors.foreground }]}>Statement saved</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Your reviewed details are in Bills history.{bill.originalDocumentId ? " The original is also in Vault." : ""}</Text>
          <QuietAction label="Dismiss confirmation" onPress={() => { setConfirmationDismissed(true); router.setParams({ saved: undefined }); }} />
        </View> : null}
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.full, backgroundColor: tone.bg }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: tone.fg }}>{statusLabel(bill.status)}</Text>
          </View>
          <Text style={editorial}>{bill.label}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            {bill.isHistoricalStatement ? `Statement period: ${period ?? "Not available"}` : `Due ${formatDueDate(bill.dueDate)}`}
          </Text>
        </View>

        {bill.isHistoricalStatement ? <View style={{ gap: 8 }}><Text style={{ fontSize: 38, fontWeight: "500", color: colors.foreground }}>{bill.amount === null ? "Amount unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency: bill.currency }).format(bill.amount)}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>Saved statement · Current balance not confirmed</Text></View> : <Surface tone="raised" style={{ gap: spacing.lg }}>
          <View style={{ gap: 3 }}>
            <Text style={[typography.label, { color: colors.mutedForeground }]}>BILL SNAPSHOT</Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {bill.isHistoricalStatement ? "A saved statement is not a current payment request." : "Statement amount and recorded payment progress are shown separately."}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xl }}>
            <FinancialStat
              label="Billed"
              value={billedAmount === null ? "—" : formatCurrency(billedAmount)}
            />
            <FinancialStat
              label="Paid"
              value={bill.isHistoricalStatement ? "Not confirmed" : paidAmount === null ? "—" : formatCurrency(paidAmount)}
            />
            <FinancialStat
              label="Remaining"
              value={bill.isHistoricalStatement ? "Not confirmed" : remainingAmount === null ? "—" : formatCurrency(remainingAmount)}
              emphasized
            />
            {scheduledAmount !== null && scheduledAmount > 0 ? (
              <FinancialStat label="Scheduled" value={formatCurrency(scheduledAmount)} />
            ) : null}
          </View>
        </Surface>}
        {(bill.canEnquire ?? (bill.source === "manual" && bill.isHistoricalStatement)) && !isEditing ? <Surface tone="raised" style={{ gap: spacing.md }}>
          <Text style={[typography.title, { color: colors.foreground }]}>What would you like to understand?</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Review the charges, prepare a question and keep track of the answer.</Text>
          <Button label={bill.reviewSummary ? "Continue your bill enquiry" : "Make sense of this bill"} onPress={() => router.push({ pathname: "/bill/review", params: { billId: bill.id } })} />
          {bill.source==="manual"?<QuietAction label="Understand charges and usage" onPress={() => router.push({ pathname: "/bill/statement-details", params: { billId: bill.id } })} />:null}
          {bill.source==="manual"?<QuietAction label="Compare this account’s history" onPress={() => router.push({ pathname: "/bill/history-insights", params: { billId: bill.id } })} />:null}
        </Surface> : null}

        {!isEditing && (bill.outcomeKind || bill.outcomeSummary) ? <QuietAction label={bill.outcomeSummary ? "View tracked bill change" : bill.outcomeKind==="usage_change" ? "Track a usage change" : "Track an agreed bill amount"} onPress={()=>router.push({pathname:"/bill/outcome",params:{billId:bill.id}})}/> : null}
        <BillRecordNotice billId={bill.id}/>
        <Surface
          style={{
            gap: spacing.sm,
            borderColor: paymentTone.bg,
            backgroundColor: paymentTone.bg,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radii.full,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={paymentState.icon} size={18} color={paymentTone.fg} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                {paymentState.title}
              </Text>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>
                {paymentState.body}
              </Text>
            </View>
          </View>
        </Surface>

        {bill.telecomDetails && !isEditing ? <View style={{ gap: spacing.sm }}>
          <Text style={[typography.section, { color: colors.foreground }]}>On this statement</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{bill.telecomDetails.services.length ? bill.telecomDetails.services.join(" · ") : "Telecom services · Service breakdown not confirmed"}</Text>
          {bill.accountNumber ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>Account {bill.accountNumber}</Text> : null}
          {bill.telecomDetails.services.length > 1 ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>These services share one statement. The total is counted once.</Text> : null}
          <TelecomStatementBreakdown bill={bill}/>
          <QuietAction label="Explore charges, credits & history" onPress={()=>router.push({pathname:"/bill/telecom-insights",params:{billId:bill.id}})}/>
        </View> : null}

        {change ? <View style={{ gap: spacing.sm }}>
          <Text style={[typography.section, { color: colors.foreground }]}>What changed</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{change.difference === 0 ? "The statement amount is unchanged." : `The statement is ${formatCurrency(Math.abs(change.difference))} ${change.difference > 0 ? "higher" : "lower"} than the earlier saved statement.`}</Text>
          {change.currentDays && change.previousDays ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{change.currentDays} days in this period, compared with {change.previousDays} in the earlier saved statement.</Text> : null}
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>These are recorded differences. They do not establish whether usage, prices or other charges caused the change.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/bill/${change.previousId}`)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.primary }}>View earlier statement</Text></Pressable>
          {bill.source === "ezgb" && bill.providerId ? <Pressable accessibilityRole="button" onPress={() => router.push(`/utility/${bill.providerId}`)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.primary }}>Explore usage and plan comparisons</Text></Pressable> : null}
        </View> : null}

        {bill.isHistoricalStatement && bill.source === "manual" && !change && !isEditing ? <View style={{ gap: spacing.sm }}>
          <Text style={[typography.section, { color: colors.foreground }]}>Understand this statement</Text>
          {firstStatement?.days ? <Text style={[typography.body, { color: colors.foreground }]}>This saved period covers {firstStatement.days} {firstStatement.days === 1 ? "day" : "days"}.</Text> : null}
          {firstStatement?.dailyCents !== null && firstStatement?.dailyCents !== undefined ? <>
            <Text style={[typography.body, { color: colors.foreground }]}>{formatCurrency(firstStatement.dailyCents / 100)} per day in recorded period charges.</Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>An average of the saved total, including tax and any fixed charges. This is not a unit rate, measured daily usage or a savings estimate.</Text>
          </> : null}
          {firstStatement ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{firstStatement.nextCheck}</Text> : null}
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Add an earlier statement for the same provider and account nickname to see what changed. Rezlee cannot establish overpayment from this total alone.</Text>
          <QuietAction label="Add another statement" onPress={() => router.push({ pathname: "/bill/add", params: { providerName: bill.providerName ?? "", category: bill.category, recordKind: "historical", accountName: bill.accountNumber ?? "" } })} />
        </View> : null}

        {(bill.source === "manual" && bill.isHistoricalStatement || bill.source === "deck") && !isEditing ? <View style={{ gap: spacing.sm }}>
          <Text style={[typography.section, { color: colors.foreground }]}>Saved original</Text>
          {bill.originalDocumentId ? <>
            <QuietAction label={openingOriginal ? "Opening original…" : "Open statement file"} onPress={() => void openOriginal()} />
            <QuietAction label="Manage file in Vault" onPress={() => router.push({ pathname: "/vault-record", params: { id: bill.originalDocumentId! } })} />
          </> : <><Text style={[typography.body, { color: colors.mutedForeground }]}>{bill.originalWasAttached ? "The original was removed from Vault. Your saved charges are still here." : "No original file is attached to this statement."}</Text>{bill.source === "manual" ? <QuietAction label="Attach original" onPress={() => router.push({ pathname: "/bill/import", params: { billId: bill.id } })} /> : null}</>}
        </View> : null}

        {bill.currency === "CAD" && !isEditing && !error ? <View style={{gap:spacing.xs}}>
          <QuietAction label="Share an amount from this bill" onPress={()=>router.push({pathname:"/shared/edit",params:{billId:bill.id}})} />
          <Text style={[typography.meta,{color:colors.mutedForeground}]}>Confirm what you paid and everyone’s share. The original stays private.</Text>
        </View> : null}

        {bill.status === "incomplete" && bill.canEdit && !isEditing ? (
          <Button label="Finish bill details" onPress={beginEdit} />
        ) : null}

        {isEditing ? (
          <Surface tone="raised" style={{ gap: spacing.lg }}><View pointerEvents={isSaving ? "none" : "auto"} style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.section, { color: colors.foreground }]}>Edit bill</Text>
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>{bill.isHistoricalStatement ? "Correct the charges, account or period. This stays in History." : "Update the details Rezlee uses for status and reminders."}</Text>
            </View>
            <TextField label="Bill name" value={editFields.name} onChangeText={(value) => setEditFields((current) => ({ ...current, name: value }))} />
            <TextField label={bill.isHistoricalStatement ? "Charges for this period (CAD)" : "Amount"} keyboardType={bill.isHistoricalStatement ? "numbers-and-punctuation" : "decimal-pad"} value={editFields.amount} onChangeText={(value) => setEditFields((current) => ({ ...current, amount: value }))} />
            <DateField label={bill.isHistoricalStatement ? "Original due date" : "Due date"} optional={bill.isHistoricalStatement} value={editFields.due_date} onChange={(value) => setEditFields((current) => ({ ...current, due_date: value }))} />
            <TextField label="Category" value={editFields.category} onChangeText={(value) => setEditFields((current) => ({ ...current, category: value }))} />
            {bill.isHistoricalStatement ? <>
              <TextField label="Provider" value={editFields.provider_name} onChangeText={v => setEditFields(current => ({ ...current, provider_name: v }))} />
              <TextField label="Account nickname" value={editFields.account_number} onChangeText={v => setEditFields(current => ({ ...current, account_number: v }))} />
              <DateField label="Period start" value={editFields.billing_period_start} onChange={v => setEditFields(current => ({ ...current, billing_period_start: v }))} />
              <DateField label="Period end" value={editFields.billing_period_end} onChange={v => setEditFields(current => ({ ...current, billing_period_end: v }))} />
            </> : null}
            <Button label="Save changes" loading={isSaving} disabled={!editFields.name.trim() || !editFields.amount.trim() || (!bill.isHistoricalStatement && !editFields.due_date.trim()) || !editFields.category.trim()} onPress={saveEdit} />
            <Button label="Cancel" variant="secondary" disabled={isSaving} onPress={() => Alert.alert("Discard changes?", "Your edits have not been saved.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => setIsEditing(false) }])} />
          </View></Surface>
        ) : (
          <>
            <Surface padded={false}>
              <View style={{ paddingHorizontal: spacing.lg }}>
                <DetailRow label="Provider" value={bill.providerName ?? "Not linked"} />
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <DetailRow
                  label="Added through"
                  value={bill.source === "manual" ? "Manual entry" : bill.providerId ? "Connected provider" : "Imported"}
                />
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <DetailRow label="Category" value={bill.category} />
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <DetailRow label="Frequency" value={bill.recurrence || "One-time"} />
                {bill.issueDate ? <><View style={{ height: 1, backgroundColor: colors.border }} /><DetailRow label="Bill date" value={formatDueDate(bill.issueDate)} /></> : null}
                {period ? <><View style={{ height: 1, backgroundColor: colors.border }} /><DetailRow label="Billing period" value={period} /></> : null}
                {bill.accountNumber ? <><View style={{ height: 1, backgroundColor: colors.border }} /><DetailRow label="Account" value={bill.accountNumber} /></> : null}
                {bill.autopayPaymentMethod ? <><View style={{ height: 1, backgroundColor: colors.border }} /><DetailRow label="Payment method" value={bill.autopayPaymentMethod} /></> : null}
              </View>
            </Surface>

            {bill.providerId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push((`/provider/${bill.providerId}`) as never)}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Feather name="link-2" size={17} color={colors.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                    Manage provider connection
                  </Text>
                </View>
                <Feather name="chevron-right" size={17} color={colors.primary} />
              </Pressable>
            ) : null}
            {bill.notes ? (
              <Surface tone="subtle" style={{ gap: spacing.xs }}>
                <Text style={[typography.label, { color: colors.mutedForeground }]}>NOTES</Text>
                <Text style={[typography.body, { color: colors.foreground }]}>{bill.notes}</Text>
              </Surface>
            ) : null}

            {history.length ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: 3 }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>History</Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    {comparison === null
                      ? "Earlier saved bills for this account."
                      : comparison === 0
                        ? "About the same as the earlier saved bill."
                        : `${Math.abs(comparison)}% ${comparison > 0 ? "higher" : "lower"} than the earlier saved bill.`}
                  </Text>
                </View>
                <Surface tone="subtle" style={{ gap: spacing.md }}>
                  {[bill, ...history.slice(0, 4)].map((item, index) => (
                    <View key={item.id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
                        <Text style={[typography.caption, { color: index === 0 ? colors.foreground : colors.mutedForeground }]}>
                          {index === 0 ? "This statement" : formatDueDate(item.billingPeriodEnd ?? item.issueDate ?? item.dueDate)}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                          {item.amount == null ? "—" : formatCurrency(item.amount)}
                        </Text>
                      </View>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                        <View
                          style={{
                            height: "100%",
                            width: `${Math.max(0, ((item.amount ?? 0) / maxHistoryAmount) * 100)}%`,
                            backgroundColor: index === 0 ? colors.primary : colors.mutedForeground,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </Surface>
              </View>
            ) : null}

            <View style={{ gap: spacing.md }}>
              {bill.canMarkPaid ? (
                <Button
                  label="I already paid this"
                  variant={hasConfirmedScheduledPayment || autopayEnrolled ? "secondary" : undefined}
                  onPress={handleMarkPaid}
                  loading={isMarkingPaid}
                />
              ) : null}
              {bill.canEdit ? (
                <Button label="Edit bill" variant="secondary" onPress={beginEdit} />
              ) : null}
              {bill.canDelete ? (
                <Pressable
                  onPress={confirmDelete}
                  style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.criticalForeground }}>Remove bill</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}

        {actionError ? (
          <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
            <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{actionError}</Text>
          </Surface>
        ) : null}
      </FormScrollView>
      </View>
    </SafeAreaView>
  );
}


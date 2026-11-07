import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {ProviderBrand} from "@/components/ProviderBrand";
import { TelecomImportProgress } from "@/components/TelecomImportProgress";
import {NavigationButton} from "@/components/NavigationButton";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import {
  backfillProviderBillsRequest,
  disconnectProviderRequest,
  fetchProviderConnection,
  refreshProviderRequest,
  submitProviderInteractionRequest,
  type ProviderConnectionItem,
  type ProviderInteraction,
  type ProviderInteractionField,
} from "@/lib/provider-data";
import { layout, radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";
import { EzgbConnectionPanel } from "@/components/utility/EzgbConnectionPanel";

function isVerificationExpired(provider: ProviderConnectionItem) {
  return provider.syncFailureReason === "interaction_timeout" || Boolean(provider.importProgress?.verificationExpiresAt && Date.parse(provider.importProgress.verificationExpiresAt)<=Date.now());
}

function needsCredentialReconnect(provider: ProviderConnectionItem) {
  return provider.syncFailureReason === "credential_invalid";
}

function isRetrieving(provider: ProviderConnectionItem) {
  if (provider.connectionStatus === "disconnected" || provider.disconnectPending) return false;
  if(provider.importProgress)return ["preparing","queued","running"].includes(provider.importProgress.status);
  return (
    ["syncing", "connecting"].includes(provider.connectionStatus) ||
    ["queued", "running"].includes(provider.latestRun?.status ?? "")
  );
}

function statusLabel(provider: ProviderConnectionItem) {
  if (provider.disconnectPending) return "Disconnect needs finishing";
  if (provider.connectionStatus === "disconnected") return "Disconnected";
  if (provider.importProgress?.phase === "authenticate" && isRetrieving(provider)) return "Signing in to your provider";
  if (provider.importProgress?.phase === "history" && isRetrieving(provider)) return "Saving your bill history";
  if (isVerificationExpired(provider)) return "Verification expired";
  if (provider.requiresUserAction && provider.latestRun?.interaction) {
    return "Verification needed";
  }
  if (needsCredentialReconnect(provider)) return "Sign-in needs attention";
  if (isRetrieving(provider)) {
    return provider.syncMode === "balance"
      ? "Refreshing account balance"
      : "Fetching latest bill";
  }
  if (["connected", "healthy"].includes(provider.connectionStatus)) return "Connected";
  if (provider.connectionStatus === "sync_failed") {
    if (provider.syncFailureReason === "timeout") {
      return "Provider took longer than expected";
    }
    return provider.syncMode === "balance"
      ? "Couldn’t refresh account balance"
      : "Couldn’t fetch latest bill";
  }
  if (provider.disconnectPending) return "Disconnect needs finishing";
  if (provider.connectionStatus === "disconnected") return "Disconnected";
  return "Needs attention";
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasInteractionValue(
  field: ProviderInteractionField,
  value: string | boolean | undefined,
) {
  if (field.type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && value.trim().length > 0;
}

type CustomerPhase =
  | "starting"
  | "verifying"
  | "continuing"
  | "retrieving"
  | null;

function interactionSignature(
  interaction: ProviderInteraction | null | undefined,
) {
  if (!interaction) return null;
  try {
    return JSON.stringify(interaction);
  } catch {
    return null;
  }
}

function formatCurrentBalance(provider: ProviderConnectionItem) {
  if (provider.currentBalance === null || provider.currentBalance === undefined) {
    return null;
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: provider.balanceCurrency || "CAD",
  }).format(provider.currentBalance);
}

function formatBillAmount(provider: ProviderConnectionItem) {
  const bill = provider.latestBill;
  if (!bill || bill.amount === null || bill.amount === undefined) return null;
  const numeric = Number(bill.amount);
  if (!Number.isFinite(numeric)) return null;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: bill.currency || "CAD",
  }).format(numeric);
}

function formatBillDueDate(provider: ProviderConnectionItem) {
  const value = provider.latestBill?.due_date;
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function latestRunBillCount(provider: ProviderConnectionItem) {
  const count = provider.latestRun?.metadata?.billCount;
  return typeof count === "number" ? count : null;
}

function customerStatusLabel(
  provider: ProviderConnectionItem,
  phase: CustomerPhase,
) {
  if (phase === "starting") return "Connecting to provider";
  if (phase === "verifying") return "Verifying your answer";
  if (phase === "continuing") return "Answer submitted";
  if (phase === "retrieving" && provider.importProgress) return provider.importProgress.authenticated ? "Saving your bill history" : "Confirming your sign-in";
  if (phase === "retrieving") {
    return provider.syncMode === "balance"
      ? "Refreshing account balance"
      : "Fetching latest bill";
  }
  if (["connected", "healthy"].includes(provider.connectionStatus)) {
    if (provider.syncMode === "balance" && provider.currentBalance !== null) {
      return "Balance updated";
    }
    const billCount = latestRunBillCount(provider);
    if (provider.latestRun?.status === "success" && billCount === 0) {
      return "Connected — no new bill found";
    }
    if (provider.latestRun?.status === "success" && billCount && billCount > 0) {
      return "Bill updated";
    }
  }
  return statusLabel(provider);
}

function statusMessage(provider: ProviderConnectionItem, phase: CustomerPhase) {
  if (provider.disconnectPending) return "Bill importing is stopped. Finish disconnecting to confirm provider access has ended. Your saved bills remain.";
  if (provider.connectionStatus === "disconnected") return "Your saved bills are still available. Reconnect when you want to retrieve another update.";
  if (provider.importProgress && isRetrieving(provider) && (!phase || phase === "retrieving")) return provider.importProgress.authenticated ? "Sign-in is confirmed. Your available bills are being saved in the background." : "Stay here while your provider checks your sign-in. Complete any verification when prompted.";
  if (phase === "starting") {
    return "Opening a secure connection to your provider.";
  }
  if (phase === "verifying") {
    return "Sending your answer securely to the provider and checking it now.";
  }
  if (phase === "continuing") {
    return "Your answer was submitted. Rezlee is continuing automatically.";
  }
  if (phase === "retrieving" && provider.importProgress) return provider.importProgress.authenticated ? "Saving your bill history" : "Confirming your sign-in";
  if (phase === "retrieving") {
    return provider.syncMode === "balance"
      ? "Sign-in is complete. Rezlee is reading your current account balance now."
      : "Sign-in is complete. Rezlee is updating your latest bill now.";
  }
  if (isVerificationExpired(provider)) {
    return "The verification step expired before it was completed. Start again and Rezlee will pick up from your saved connection.";
  }
  if (provider.requiresUserAction && provider.latestRun?.interaction) {
    return "Your provider needs one more step before Rezlee can continue.";
  }
  if (needsCredentialReconnect(provider)) {
    return "The provider rejected the saved login. Re-enter your provider credentials to reconnect.";
  }
  if (isRetrieving(provider)) {
    return provider.syncMode === "balance"
      ? "Rezlee is updating your current account balance. This screen will update automatically."
      : "Rezlee is updating your latest bill. This screen will update automatically.";
  }
  if (["connected", "healthy"].includes(provider.connectionStatus)) {
    if (provider.syncMode === "balance" && provider.currentBalance !== null) {
      const balance = formatCurrentBalance(provider);
      return balance
        ? `${balance} current account balance.`
        : "Current account balance updated.";
    }

    const billCount = latestRunBillCount(provider);
    if (provider.latestRun?.status === "success" && billCount === 0) {
      return (
        provider.userActionMessage ??
        "The connection worked, but there isn’t a new bill to add right now."
      );
    }

    const amount = formatBillAmount(provider);
    const dueDate = formatBillDueDate(provider);
    if (
      provider.latestRun?.status === "success" &&
      billCount !== null &&
      billCount > 0 &&
      provider.latestBill &&
      amount
    ) {
      return dueDate
        ? `${amount} was updated. Due ${dueDate}.`
        : `${amount} was updated successfully.`;
    }

    return provider.userActionMessage ??
      "Your connection is saved. Check for an update when you need one.";
  }
  if (provider.connectionStatus === "sync_failed") {
    return (
      provider.userActionMessage ??
      "The last update didn’t finish, but your connection is still saved. You can try again."
    );
  }
  if (provider.disconnectPending) return "Bill importing is stopped. Finish disconnecting to confirm provider access has ended. Your saved bills remain.";
  if (provider.connectionStatus === "disconnected") {
    return "Your saved bills are still available. Reconnect when you want to retrieve another update.";
  }
  return provider.userActionMessage ?? "Review this provider connection.";
}

type ProgressState = "done" | "active" | "pending";

function ProgressRow({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: ProgressState;
}) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: state === "done" ? colors.primary : colors.secondary,
          borderWidth: state === "pending" ? 1 : 0,
          borderColor: colors.border,
        }}
      >
        {state === "done" ? (
          <Feather name="check" size={14} color={colors.primaryForeground} />
        ) : state === "active" ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: radii.full,
              backgroundColor: colors.mutedForeground,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: state === "active" ? "700" : "600",
            color: colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export default function ProviderDetailScreen() {
  const { colors } = useTheme();

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderConnectionItem | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [customerPhase, setCustomerPhase] = useState<CustomerPhase>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySinceDate, setHistorySinceDate] = useState("");
  const [historyUntilDate, setHistoryUntilDate] = useState("");
  const submittedInteractionSignature = useRef<string | null>(null);
  const displayedChallenge = useRef<string | null>(null);
  const verificationSubmitting = useRef(false);
  const livePollingStartedAt = useRef<number | null>(null);
  const [livePollingEnded, setLivePollingEnded] = useState(false);
  const [focused,setFocused]=useState(false);
  const [appActive,setAppActive]=useState(AppState.currentState==="active");
  useEffect(()=>{const sub=AppState.addEventListener("change",s=>{setAppActive(s==="active");});return()=>sub.remove();},[]);

  const load = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setError(null);

      try {
        const payload = await fetchProviderConnection(id);
        const nextProvider = payload.provider;
        const nextChallenge = nextProvider.latestRun?.challengeId ??
          interactionSignature(nextProvider.latestRun?.interaction);
        if (displayedChallenge.current !== nextChallenge) {
          displayedChallenge.current = nextChallenge;
          setValues({});
        }
        setProvider(nextProvider);

        setCustomerPhase((current) => {
          if (!current) return null;

          if (
            ["completed","partial","failed","canceled"].includes(nextProvider.importProgress?.status??"") ||
            ["connected", "healthy", "sync_failed", "disconnected"].includes(
              nextProvider.connectionStatus,
            ) ||
            isVerificationExpired(nextProvider) ||
            needsCredentialReconnect(nextProvider)
          ) {
            submittedInteractionSignature.current = null;
            return null;
          }

          const nextInteraction = nextProvider.latestRun?.interaction ?? null;
          const nextSignature = nextProvider.latestRun?.challengeId ?? interactionSignature(nextInteraction);

          if (
            nextProvider.requiresUserAction &&
            nextInteraction &&
            nextSignature &&
            nextSignature !== submittedInteractionSignature.current
          ) {
            submittedInteractionSignature.current = null;
            return null;
          }

          if (
            !nextProvider.requiresUserAction &&
            isRetrieving(nextProvider) &&
            ["starting", "continuing"].includes(current)
          ) {
            return "retrieving";
          }

          return current;
        });
      } catch (loadError) {
        if (!silent) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "Could not load this provider.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setLoading(true);
      livePollingStartedAt.current = null;
      setLivePollingEnded(false);
      load();
      return()=>setFocused(false);
    }, [load]),
  );

  useEffect(() => {
    if(!focused||!appActive||!provider||provider.adapter==="ezgb")return;
    const pending=customerPhase!==null||isRetrieving(provider)||provider.requiresUserAction;
    if(!pending)return;
    let canceled=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{await load(true);if(!canceled)timer=setTimeout(poll,4000);};
    timer=setTimeout(poll,2000);
    return()=>{canceled=true;clearTimeout(timer);};
  },[focused,appActive,provider,customerPhase,load]);

  useEffect(() => {
    if (customerPhase !== "continuing") return;

    const timer = setTimeout(() => {
      setCustomerPhase((current) =>
        current === "continuing" ? "retrieving" : current,
      );
    }, 1200);

    return () => clearTimeout(timer);
  }, [customerPhase]);

  const interaction = provider?.latestRun?.interaction ?? null;
  const fields = useMemo(
    () => (Array.isArray(interaction?.fields) ? interaction.fields : []),
    [interaction],
  );
  const verificationExpired = provider ? isVerificationExpired(provider) : false;
  const credentialReconnectNeeded = provider
    ? needsCredentialReconnect(provider)
    : false;
  const retrieving = provider ? isRetrieving(provider) : false;
  const busy = customerPhase !== null;
  const activeVerification =
    !busy &&
    !provider?.disconnectPending && provider?.connectionStatus !== "disconnected" && Boolean(provider?.requiresUserAction) &&
    fields.length > 0 &&
    !verificationExpired;
  const retryWithoutLogin =
    !provider?.disconnectPending && !busy &&
    Boolean(provider) &&
    !credentialReconnectNeeded &&
    (verificationExpired || provider?.connectionStatus === "sync_failed" || ["failed","partial","canceled","cancelled"].includes(provider?.importProgress?.status??""));
  const reconnectNeeded =
    !provider?.disconnectPending && !busy &&
    Boolean(provider) &&
    !activeVerification &&
    !retryWithoutLogin &&
    (credentialReconnectNeeded ||
      provider?.connectionStatus === "disconnected" ||
      (Boolean(provider?.requiresUserAction) && fields.length === 0));

  const connected =
    Boolean(provider) &&
    ["connected", "healthy"].includes(provider?.connectionStatus ?? "");
  const showJourney =
    Boolean(provider) && !provider?.importProgress &&
    !livePollingEnded &&
    (busy || retrieving || activeVerification);

  const connectProgress: ProgressState =
    customerPhase === "starting" ? "active" : "done";
  const verificationProgress: ProgressState =
    activeVerification || customerPhase === "verifying"
      ? "active"
      : customerPhase === "starting"
        ? "pending"
        : "done";
  const currentRunBillCount = provider ? latestRunBillCount(provider) : null;
  const currentRunFoundBill =
    connected &&
    provider?.latestRun?.status === "success" &&
    currentRunBillCount !== null &&
    currentRunBillCount > 0;

  const retrievalProgress: ProgressState = connected
    ? "done"
    : customerPhase === "retrieving" ||
        customerPhase === "continuing" ||
        (retrieving && !activeVerification)
      ? "active"
      : "pending";

  async function refresh() {
    if (!provider) return;
    livePollingStartedAt.current = null;
    setLivePollingEnded(false);
    setWorking(true);
    setCustomerPhase("starting");
    submittedInteractionSignature.current = null;
    setError(null);
    setNotice(null);

    try {
      const result = await refreshProviderRequest(provider.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.status === "requires_user_action") {
        setCustomerPhase(null);
        setNotice("One more verification step is needed.");
      } else {
        setCustomerPhase("retrieving");
      }

      await load(true);
    } catch (refreshError) {
      setCustomerPhase(null);
      setError(
        refreshError instanceof ApiError
          ? refreshError.message
          : "Could not start a provider refresh.",
      );
      await load(true);
    } finally {
      setWorking(false);
    }
  }

  async function importHistory() {
    if (!provider) return;

    if (!validDateInput(historySinceDate)) {
      setError("Enter a valid start date in YYYY-MM-DD format.");
      return;
    }
    if (historyUntilDate && !validDateInput(historyUntilDate)) {
      setError("Enter a valid end date in YYYY-MM-DD format.");
      return;
    }
    if (historyUntilDate && historyUntilDate < historySinceDate) {
      setError("The end date must be on or after the start date.");
      return;
    }

    livePollingStartedAt.current = null;
    setLivePollingEnded(false);
    setWorking(true);
    setCustomerPhase("starting");
    setError(null);
    setNotice(null);

    try {
      await backfillProviderBillsRequest(provider.id, {
        sinceDate: historySinceDate,
        ...(historyUntilDate ? { untilDate: historyUntilDate } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHistoryOpen(false);
      setNotice(
        "Bill history import started. You can leave this screen while Rezlee works in the background.",
      );
      setCustomerPhase("retrieving");
      await load(true);
    } catch (historyError) {
      setCustomerPhase(null);
      setError(
        historyError instanceof ApiError
          ? historyError.message
          : "Could not start the bill history import.",
      );
      await load(true);
    } finally {
      setWorking(false);
    }
  }

  async function submitVerification() {
    if (!provider || !fields.length || verificationSubmitting.current) return;
    if(isVerificationExpired(provider)){setError("This verification request expired. Tap Try again to continue.");return;}
    if (
      fields.some((field) => !hasInteractionValue(field, values[field.name]))
    ) {
      setError("Complete the requested verification step.");
      return;
    }

    verificationSubmitting.current = true;
    submittedInteractionSignature.current = provider.latestRun?.challengeId ?? interactionSignature(interaction);
    livePollingStartedAt.current = null;
    setLivePollingEnded(false);
    setWorking(true);
    setCustomerPhase("verifying");
    setError(null);
    setNotice(null);

    try {
      const result = await submitProviderInteractionRequest(provider.id, values, provider.latestRun?.challengeId ?? undefined);
      setValues({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.status === "requires_user_action") {
        submittedInteractionSignature.current = null;
        setCustomerPhase(null);
        setNotice("The provider needs one more verification step.");
      } else {
        setCustomerPhase("continuing");
      }

      await load(true);
    } catch (submitError) {
      setCustomerPhase(null);
      submittedInteractionSignature.current = null;
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Could not submit provider verification.",
      );
      await load(true);
    } finally {
      verificationSubmitting.current = false;
      setWorking(false);
    }
  }

  function disconnect() {
    if (!provider) return;
    Alert.alert(
      "Disconnect provider?",
      "Stop bill importing and disconnect provider access. Your saved bills stay in Rezlee. This does not cancel your service or change payments.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setWorking(true);
            setError(null);
            try {
              await disconnectProviderRequest(provider.id);
              await load();
            } catch (disconnectError) {
              await load();
              setError(
                disconnectError instanceof ApiError
                  ? disconnectError.message
                  : "Could not disconnect this provider.",
              );
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  }
  if (provider?.adapter === "ezgb") return <EzgbConnectionPanel providerId={provider.id} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ flex: 1 }}
        
      >
      <FormScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingHorizontal: layout.screenHorizontal,
          paddingBottom: spacing["4xl"],
          gap: spacing.xl,
        }}
      >
        <View
          style={{
            minHeight: 52,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <NavigationButton onPress={() => safeBack(router, "/provider")} label="Go back"/>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
            Provider connection
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={{ minHeight: 220, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : provider ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <ProviderBrand provider={provider.name} category={provider.category} logoUrl={provider.logoUrl}/>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.heading, { color: colors.foreground }]}>
                    {provider.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    {provider.category}
                  </Text>
                </View>
              </View>
            </View>
            {provider.importProgress && !provider.disconnectPending && provider.connectionStatus !== "disconnected" ? <TelecomImportProgress progress={provider.importProgress} onLeave={()=>router.replace("/(tabs)/bills")} onViewBill={provider.latestBill ? ()=>router.push(`/bill/${provider.latestBill!.id}`) : undefined}/> : <Surface
              tone={provider.requiresUserAction || busy ? "accent" : "raised"}
              style={{ gap: spacing.sm }}
            >
              <Text style={[typography.section, { color: colors.foreground }]}>
                {customerStatusLabel(provider, customerPhase)}
              </Text>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>
                {statusMessage(provider, customerPhase)}
              </Text>
              {busy || (retrieving && !livePollingEnded) ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    You can leave this screen. Rezlee will keep working and update your Bills view when it’s ready.
                  </Text>
                </View>
              ) : null}
              {retrieving && livePollingEnded ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    This is taking longer than the live update window. Rezlee is still working in the background.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace("/(tabs)/bills")}
                    style={{ minHeight: 42, justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                      Back to Bills
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {provider.lastSuccessfulSyncAt && !busy ? (
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  Last updated:{" "}
                  {new Date(provider.lastSuccessfulSyncAt).toLocaleString("en-CA")}
                </Text>
              ) : null}
            </Surface>}

            {showJourney ? (
              <Surface tone="subtle" style={{ gap: spacing.lg }}>
                <Text style={[typography.section, { color: colors.foreground }]}>
                  What’s happening
                </Text>
                <ProgressRow
                  label="Sign in securely"
                  detail={
                    connectProgress === "active"
                      ? "Opening a secure sign-in…"
                      : "Secure sign-in ready"
                  }
                  state={connectProgress}
                />
                <ProgressRow
                  label="Verify sign-in"
                  detail={
                    verificationProgress === "active"
                      ? activeVerification
                        ? "Action needed from you"
                        : "Checking your verification response…"
                      : verificationProgress === "done"
                        ? "Verified or no extra action needed"
                        : "Waiting for sign-in"
                  }
                  state={verificationProgress}
                />
                <ProgressRow
                  label={
                    provider.syncMode === "balance"
                      ? "Update account balance"
                      : "Update latest bill"
                  }
                  detail={
                    provider.syncMode === "balance"
                      ? retrievalProgress === "active"
                        ? "Updating the current balance from your provider…"
                        : retrievalProgress === "done"
                          ? "Current balance updated"
                          : "Starts after sign-in is complete"
                      : retrievalProgress === "active"
                        ? "Updating amount, due date and bill details…"
                        : retrievalProgress === "done"
                          ? currentRunBillCount === 0
                            ? "Up to date; no new bill was found"
                            : "Latest bill updated"
                          : "Starts after sign-in is complete"
                  }
                  state={retrievalProgress}
                />
              </Surface>
            ) : null}

            {error ? (
              <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
                <Text style={{ fontSize: 13, color: colors.criticalForeground }}>
                  {error}
                </Text>
              </Surface>
            ) : null}

            {activeVerification ? (
              <Surface style={{ gap: spacing.lg }}>
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>
                    Verification needed
                  </Text>
                  <Text style={[typography.body, { color: colors.mutedForeground }]}>
                    {interaction?.message ?? "Complete this step so Rezlee can continue."}
                  </Text>
                </View>
                {fields.map((field: ProviderInteractionField) => (
                  <View key={field.name} style={{ gap: spacing.sm }}>
                    {field.type === "select" && field.options?.length ? (
                      <>
                        <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                          {field.label || "Choose an option"}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                          {field.options.map((option) => {
                            const selected = values[field.name] === option.value;
                            return (
                              <Pressable
                                key={option.value}
                                accessibilityRole="button"
                                onPress={() =>
                                  setValues((current) => ({
                                    ...current,
                                    [field.name]: option.value,
                                  }))
                                }
                                style={{
                                  minHeight: 42,
                                  justifyContent: "center",
                                  paddingHorizontal: spacing.md,
                                  borderRadius: radii.md,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : colors.border,
                                  backgroundColor: selected ? colors.accent : colors.card,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: "600",
                                    color: colors.foreground,
                                  }}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : field.type === "boolean" ? (
                      <>
                        <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                          {field.label || "Confirm"}
                        </Text>
                        <View style={{ flexDirection: "row", gap: spacing.sm }}>
                          {[
                            { label: "Yes", value: true },
                            { label: "No", value: false },
                          ].map((option) => {
                            const selected = values[field.name] === option.value;
                            return (
                              <Pressable
                                key={option.label}
                                accessibilityRole="button"
                                onPress={() =>
                                  setValues((current) => ({
                                    ...current,
                                    [field.name]: option.value,
                                  }))
                                }
                                style={{
                                  minHeight: 42,
                                  minWidth: 84,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: radii.md,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : colors.border,
                                  backgroundColor: selected ? colors.accent : colors.card,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: "600",
                                    color: colors.foreground,
                                  }}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : (
                      <TextField
                        label={field.label || "Verification value"}
                        value={
                          typeof values[field.name] === "string"
                            ? (values[field.name] as string)
                            : ""
                        }
                        onChangeText={(value) =>
                          setValues((current) => ({ ...current, [field.name]: value }))
                        }
                        secureTextEntry={field.type === "password"}
                        autoCapitalize="none"
                        keyboardType={field.type === "number" ? "number-pad" : "default"}
                      />
                    )}
                  </View>
                ))}
                <Button
                  label="Submit verification"
                  onPress={submitVerification}
                  loading={working}
                />
              </Surface>
            ) : null}

            {provider.syncMode === "balance" &&
            provider.currentBalance !== null &&
            !busy ? (
              <Surface tone="accent" style={{ gap: spacing.sm }}>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  CURRENT BALANCE
                </Text>
                <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>
                  {formatCurrentBalance(provider)}
                </Text>
                {provider.balanceUpdatedAt ? (
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    Updated {new Date(provider.balanceUpdatedAt).toLocaleString("en-CA")}
                  </Text>
                ) : null}
              </Surface>
            ) : null}

            {provider.syncMode !== "balance" &&
            currentRunFoundBill &&
            provider.latestBill &&
            !busy ? (
              <Surface tone="accent" style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>
                    Latest bill updated
                  </Text>
                  <Text style={[typography.heading, { color: colors.foreground }]}>
                    {formatBillAmount(provider) ?? provider.latestBill.name}
                  </Text>
                  <Text style={[typography.body, { color: colors.mutedForeground }]}>
                    {formatBillDueDate(provider)
                      ? `Due ${formatBillDueDate(provider)}`
                      : "Bill details are saved in Rezlee."}
                  </Text>
                </View>
                <Button
                  label="View bill"
                  onPress={() => router.push(`/bill/${provider.latestBill!.id}`)}
                />
              </Surface>
            ) : null}

            {provider.connectionPaused ? <Surface tone="subtle" style={{ gap: spacing.md }}><Text style={[typography.section, { color: colors.foreground }]}>Rogers connection coming soon</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>We’re finishing sign-in testing. Your saved bills are here; upload a statement to add new history.</Text><Button label="Upload a statement" onPress={() => router.push("/bill/batch")} /></Surface> : null}
            {retryWithoutLogin && !provider.connectionPaused ? (
              <Button
                label={working ? "Starting fresh attempt..." : "Try again"}
                onPress={refresh}
                loading={working}
              />
            ) : null}

            {reconnectNeeded && !provider.connectionPaused ? (
              <Button
                label="Sign in again"
                onPress={() =>
                  router.push(
                    (`/provider/connect?providerId=${encodeURIComponent(provider.id)}`) as never,
                  )
                }
                disabled={working}
              />
            ) : null}

            {!busy && (retryWithoutLogin || reconnectNeeded) ? (
              <Button
                label="Add this bill manually instead"
                variant="secondary"
                onPress={() =>
                  router.push(
                    (`/bill/add?providerName=${encodeURIComponent(provider.name)}&category=${encodeURIComponent(provider.category)}`) as never,
                  )
                }
                disabled={working}
              />
            ) : null}

            {!busy &&
            !provider.connectionPaused &&
            !provider.requiresUserAction &&
            !retrieving &&
            !retryWithoutLogin &&
            !reconnectNeeded &&
            provider.connectionStatus !== "disconnected" ? (
              <>
                <Button
                  label={provider.importProgress ? "Check my bills again" : provider.syncMode === "balance" ? "Refresh balance" : "Update latest bill"}
                  onPress={refresh}
                  loading={working}
                />

                {provider.syncMode !== "balance" && !provider.importProgress ? (
                  <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHistoryOpen((current) => {
                      const next = !current;
                      if (next && !historySinceDate) {
                        const today = new Date();
                        const yearAgo = new Date(today);
                        yearAgo.setFullYear(today.getFullYear() - 1);
                        setHistorySinceDate(dateInputValue(yearAgo));
                        setHistoryUntilDate(dateInputValue(today));
                      }
                      return next;
                    });
                  }}
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      Import bill history
                    </Text>
                    <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                      Pull previous statements for a date range
                    </Text>
                  </View>
                  <Feather
                    name={historyOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>

                {historyOpen ? (
                  <Surface tone="subtle" style={{ gap: spacing.md }}>
                    <View style={{ gap: spacing.xs }}>
                      <Text style={[typography.section, { color: colors.foreground }]}>
                        Import previous bills
                      </Text>
                      <Text style={[typography.body, { color: colors.mutedForeground }]}>
                        Rezlee will look for previous bills in this range in the background. Your provider may still ask you to verify the sign-in.
                      </Text>
                    </View>
                    <DateField
                      label="From"
                      value={historySinceDate}
                      onChange={setHistorySinceDate}
                    />
                    <DateField
                      label="To"
                      value={historyUntilDate}
                      onChange={setHistoryUntilDate}
                      optional
                    />
                    <Button
                      label="Import bill history"
                      onPress={importHistory}
                      loading={working}
                    />
                  </Surface>
                ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {notice ? (
              <Surface tone="subtle">
                <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                  {notice}
                </Text>
              </Surface>
            ) : null}

            <Surface tone="subtle" style={{ flexDirection: "row", gap: spacing.md }}>
              <Feather name="shield" size={18} color={colors.mutedForeground} />
              <Text style={[typography.meta, { color: colors.mutedForeground, flex: 1 }]}>
                Your provider login is handled by Rezlee’s secure connection service. Rezlee keeps
                the connection reference and the bill information needed for your account.
              </Text>
            </Surface>

            {provider.disconnectPending || provider.connectionStatus !== "disconnected" ? (
              <Pressable
                accessibilityRole="button"
                onPress={disconnect}
                disabled={working}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.criticalForeground }}>
                  {provider.disconnectPending ? "Finish disconnecting" : "Disconnect provider"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : error ? (
          <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
            <Text style={{ fontSize: 13, color: colors.criticalForeground }}>
              {error}
            </Text>
          </Surface>
        ) : null}

      </FormScrollView>
      </View>
    </SafeAreaView>
  );
}

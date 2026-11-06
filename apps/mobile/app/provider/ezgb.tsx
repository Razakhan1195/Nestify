import { ConnectionElapsed } from "@/components/ConnectionElapsed";
import { UtilityAttemptRemoval } from "@/components/UtilityAttemptRemoval";
import { ezgbSystemBrowserAvailable, startEzgbBrowser, canResumeEzgbBrowserConnection, resumeEzgbBrowserConnection, checkEzgbExistingConnection } from "@/lib/ezgb-browser";
import { ezgbEmbeddedCallback } from "@/lib/ezgb-browser-contract";
import { useAuth } from "@/auth/AuthProvider";
import { ConnectionIntroduction } from "@/components/ConnectionIntroduction";
import {ConnectionBrand} from "@/components/ConnectionBrand";
import {ezgbBillsAvailable,ezgbProgress,ezgbConnectionConfirmed} from "@/lib/ezgb-progress";
import { UtilityConnectionOutcome } from "@/components/UtilityConnectionOutcome";
import {NavigationButton} from "@/components/NavigationButton";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { QuietAction } from "@/components/Brief";
import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import {
  fetchEzgbAuthorization,
  fetchEzgbSyncStatus,
  syncEzgb,
  retryEzgbConnection,
  type EzgbAuthorizationPayload,
  type EzgbSyncPayload,
} from "@/lib/ezgb-data";
import { colors, layout, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

type Stage =
  | "removed"
  | "intro"
  | "loading"
  | "authorizing"
  | "browser"
  | "syncing"
  | "complete"
  | "authorized_pending"
  | "error";

const MAX_STATUS_ATTEMPTS = 60;
const STATUS_INTERVAL_MS = 5_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function EzgbConnectionScreen() {
  const { session } = useAuth();
  const { resume, utilityName, job, returnHome } = useLocalSearchParams<{ resume?: string; utilityName?: string; job?: string; returnHome?: string }>();
  return <EzgbConnectionFlow key={JSON.stringify([session?.user.id, resume, utilityName, job, returnHome])}/>;
}
function EzgbConnectionFlow() {
  const router = useRouter();
  const { resume, utilityName, job, returnHome } = useLocalSearchParams<{ resume?: string; utilityName?: string; job?: string; returnHome?: string }>();
  const [authorization, setAuthorization] =
    useState<EzgbAuthorizationPayload | null>(null);
  const [stage, setStage] = useState<Stage>(resume ? "loading" : "intro");
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<EzgbSyncPayload | null>(null);
  const syncInFlight = useRef(false);
  const requestVersion = useRef(0);
  const cancelled = useRef(false);

  const [started, setStarted] = useState(false);
  const [browserRecovery, setBrowserRecovery] = useState(false);
  useEffect(() => {
    if (!started) return;
    cancelled.current = false;
    fetchEzgbAuthorization({ connect: true, utilityName })
      .then((payload) => {
        if (cancelled.current) return;
        if (!payload.connectionIntent) throw Error("The connection is being updated. Try again shortly.");
        setAuthorization(payload);
        setStage("authorizing");
      })
      .catch((loadError) => {
        if (cancelled.current) return;
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "Could not start the utility connection.",
        );
        setStage("error");
      });

    return () => {
      cancelled.current = true;
    };
  }, [started, utilityName]);

  const runSync = useCallback(async (restore = false, jobId?: string, retry = false) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    const version = requestVersion.current;
    const isCancelled = () => cancelled.current || version !== requestVersion.current;
    setError(null);
    setStage("syncing");

    try {
      const started = retry && jobId ? await retryEzgbConnection(jobId) : restore ? await fetchEzgbSyncStatus(jobId) : await syncEzgb(undefined, authorization?.connectionIntent);
      if (isCancelled()) return;

      setSyncResult(started);
      if ((!resume || returnHome === "1") && ezgbConnectionConfirmed(started)) {
        router.replace("/(tabs)/home"); return;
      }
      if (started.cancelled) { setStage("removed"); return; }
      if (started.ready || ezgbBillsAvailable(started)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStage("complete");
        return;
      }

      if (started.status === "idle") { setStage(restore ? "removed" : "intro"); return; }
      if (started.status === "failed") { setError(started.error ?? "The import could not finish. Your saved bills remain available."); setStage("error"); return; }
      if (started.status === "waiting") { setStage("authorized_pending"); return; }
      if (!started.jobId) {
        setStage("authorized_pending");
        return;
      }

      for (let attempt = 0; attempt < MAX_STATUS_ATTEMPTS; attempt += 1) {
        await delay(STATUS_INTERVAL_MS);
        if (isCancelled()) return;

        const result = await fetchEzgbSyncStatus(started.jobId);
        if (isCancelled()) return;
        setSyncResult(result);
        if ((!resume || returnHome === "1") && ezgbConnectionConfirmed(result)) {
          router.replace("/(tabs)/home"); return;
        }

        if (result.cancelled || result.status === "idle") { setStage("removed"); return; }
        if (result.ready || ezgbBillsAvailable(result)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setStage("complete");
          return;
        }

        if (result.status === "failed") {
          setError(result.error ?? "The utility connection needs another try.");
          setStage("error");
          return;
        }

        if (result.status === "waiting") {
          setStage("authorized_pending");
          return;
        }
      }

      if (!isCancelled()) setStage("authorized_pending");
    } catch (syncError) {
      if (!isCancelled()) {
        setError(
          syncError instanceof ApiError
            ? syncError.message
            : "Rezlee could not retrieve this utility’s data yet. Check again if you already approved sharing.",
        );
        setStage("authorized_pending");
      }
    } finally {
      syncInFlight.current = false;
    }
  }, [authorization, resume, returnHome, router]);

  useEffect(() => {
    cancelled.current = false;
    const timer = resume ? setTimeout(() => void runSync(true, job), 0) : undefined;
    return () => { cancelled.current = true; clearTimeout(timer); };
  }, [resume, job, runSync]);

  async function openSystemBrowser(recover = false) {
    setError(null);
    setStage(recover ? "loading" : "browser");
    try {
      const result = recover ? await resumeEzgbBrowserConnection() : await startEzgbBrowser(utilityName);
      setBrowserRecovery(false);
      if (cancelled.current) return;
      if (result) await runSync(true, result.jobId ?? undefined);
      else {
        setError("The browser closed before Rezlee received confirmation. If you approved sharing, check your connection below before starting again.");
        setStage("error");
      }
    } catch (browserError) {
      if (cancelled.current) return;
      setBrowserRecovery(await canResumeEzgbBrowserConnection());
      setError(browserError instanceof Error ? browserError.message : "Couldn’t open the connection. Please try again.");
      setStage("error");
    }
  }

  async function checkExistingConnection() {
    if (!utilityName) return;
    setError(null);
    setSyncResult(null);
    setStage("loading");
    try {
      const result = await checkEzgbExistingConnection(utilityName);
      if (cancelled.current) return;
      setBrowserRecovery(false);
      await runSync(true, result.jobId ?? undefined);
    } catch (checkError) {
      if (cancelled.current) return;
      setBrowserRecovery(await canResumeEzgbBrowserConnection());
      setError(checkError instanceof ApiError || checkError instanceof Error ? checkError.message : "Couldn’t check your connection. Please try again.");
      setStage("error");
    }
  }

  function handleNavigation(url: string) {
    if (!authorization) return;
    const outcome = ezgbEmbeddedCallback(url, authorization.successUrl, authorization.errorUrl);
    if (outcome === "success") void runSync();
    else if (outcome === "error") {
      setError("The utility authorization was not completed.");
      setStage("error");
    }
  }

  function handleMessage(event: WebViewMessageEvent) {
    // A message's claimed type is insufficient. Only the configured callback page can finish.
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (payload.type === "ezgb_authorized" || payload.type === "ezgb_error") handleNavigation(event.nativeEvent.url);
    } catch { /* Ignore unrelated provider messages. */ }
  }

  function webViewFailed() {
    setError("The utility page couldn’t load. Check your connection and start again. Your saved bills are still available.");
    setStage("error");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          minHeight: 54,
          paddingHorizontal: layout.screenHorizontal,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <NavigationButton onPress={() => safeBack(router, "/provider/connect")} label="Close" close/>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
          Connect a utility
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {stage === "removed" ? (
        <View style={{ flex: 1, padding: layout.screenHorizontal, justifyContent: "center", gap: spacing.lg }}>
          <Text style={typography.heading}>Attempt removed</Text>
          <Text style={typography.body}>This check has stopped. Your saved bills and other connections are unchanged.</Text>
          <Button label="Back to Bills" onPress={() => router.replace("/(tabs)/bills")} />
          <QuietAction label="Find your provider" onPress={() => router.replace("/provider/connect")} />
        </View>
      ) : stage === "intro" ? (
        <ScrollView contentContainerStyle={{ padding: layout.screenHorizontal, gap: spacing.lg }}>
          <ConnectionBrand kind="green"/>
          <Text style={[typography.meta, { color: colors.primary }]}>Powered by EZGB</Text>
          <ConnectionIntroduction
            title={utilityName ? `Your ${utilityName} bills, together` : "Your energy bills, in one place"}
            description="Bring your energy bills and usage together. See what changed, with the history your utility provides."
            steps={[
              { title: utilityName ? `Choose ${utilityName}` : "Choose your Ontario utility", detail: "The recommended route for supported Ontario electricity and gas. Sign in with your utility and review its consent terms." },
              { title: "Approve sharing, then return here", detail: "Your phone opens a secure browser. After you approve, the utility may take a few minutes to confirm. Keep that page open until it returns to Rezlee. Once the account is confirmed, we’ll take you Home while bills arrive." },
            ]}
            access="EZGB / Screaming Power retrieves the data you authorize. Review its terms before approving. Your utility sign-in is separate from your Rezlee login."
            accessNote="You can revoke sharing through your utility. Bills already saved in Rezlee stay."
          />
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>Automatic monthly updates aren’t enabled yet.</Text>
          <Button label="Continue with Green Button" onPress={() => { if (ezgbSystemBrowserAvailable) { void openSystemBrowser(); } else { setError(null); setStage("loading"); setStarted(true); } }} />
          <View style={{ gap: spacing.xs }}>
            {utilityName ? <QuietAction label="Already approved sharing? Check connection" onPress={() => void checkExistingConnection()} /> : null}
            <QuietAction label="Find another provider" onPress={() => router.replace("/provider/connect")} />
            <QuietAction label="Upload a bill instead" onPress={() => router.replace("/bill/batch")} />
            <QuietAction label="Read the Ontario Energy Board’s Green Button guide" onPress={() => {
              void Linking.openURL("https://www.oeb.ca/consumer-information-and-protection/green-button").catch(() => setError("Couldn’t open the guide. You can try again."));
            }} />
            {error ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.criticalForeground }]}>{error}</Text> : null}
          </View>
        </ScrollView>
      ) : stage === "loading" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            Preparing secure connection…
          </Text>
        </View>
      ) : stage === "browser" ? (
        <View style={{ flex: 1, justifyContent: "center", padding: layout.screenHorizontal, gap: spacing.lg }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={typography.heading}>Continue in your browser</Text>
          <ConnectionElapsed label="Connection started" />
          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            Complete your utility’s sign-in and consent steps. The browser will bring you back to Rezlee.
            After approval, confirmation can take a few minutes. Keep the browser open until it returns to Rezlee.
            If you already closed it, use “Already approved sharing? Check connection” to recover without starting consent again.
          </Text>
        </View>
      ) : stage === "authorizing" && authorization ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: layout.screenHorizontal, paddingBottom: spacing.md }}>
            <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 18 }]}>
              Choose a supported Ontario electricity or natural gas utility. Review the utility and EZGB consent terms before approving data sharing.
            </Text>
          </View>
          <WebView
            source={{ uri: authorization.authorizationUrl }}
            onMessage={handleMessage}
            onError={webViewFailed}
            onHttpError={webViewFailed}
            onContentProcessDidTerminate={webViewFailed}
            onRenderProcessGone={webViewFailed}
            onNavigationStateChange={(nav) => handleNavigation(nav.url)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => (
              <View
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.background,
                }}
              >
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: layout.screenHorizontal,
            paddingTop: spacing["2xl"],
            paddingBottom: spacing.xl,
            gap: spacing.lg,
          }}
        >
          {stage === "syncing" ? (
            <>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <ActivityIndicator color={colors.primary} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>
                  {syncResult?.connection ? ezgbProgress(syncResult)?.title : "Retrieving your utility data"}
                </Text>
                <Text style={[typography.body, { color: colors.mutedForeground, lineHeight: 22 }]}>
                  {syncResult?.connection ? ezgbProgress(syncResult)?.detail : "Authorization returned. Rezlee is checking which utility data is available."}
                </Text>
              </View>
              <ConnectionElapsed label="Checking connection" />
              <Surface tone="subtle">
                <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 18 }]}>
                  We’ll return you Home once this utility’s account is confirmed. Bills will continue arriving there; allow around 10 minutes, though some providers take longer. Until confirmation, this remains a connection check.
                </Text>
              </Surface>
            </>
          ) : stage === "complete" ? (
            <>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.successBg,
                }}
              >
                <Feather name="check" size={22} color={colors.successForeground} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>
                  {syncResult?.connection ? ezgbProgress(syncResult)?.title : "Utility connected"}
                </Text>
                <Text style={[typography.body, { color: colors.mutedForeground, lineHeight: 22 }]}>
                  This retrieval saved or updated {syncResult?.stats.billsImported ?? 0} bill record{(syncResult?.stats.billsImported ?? 0) === 1 ? "" : "s"}.
                </Text>
              </View>
              <UtilityConnectionOutcome providerIds={syncResult?.connection?.providerIds} />
              <Button
                label="View bills"
                onPress={() => router.replace("/(tabs)/bills")}
              />
            </>
          ) : stage === "authorized_pending" ? (
            <>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.infoBg,
                }}
              >
                <Feather name="clock" size={21} color={colors.infoForeground} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>
                  {syncResult ? ezgbProgress(syncResult)?.title : "Your bills aren’t ready yet"}
                </Text>
                <Text style={[typography.body, { color: colors.mutedForeground, lineHeight: 22 }]}>
                  {syncResult ? ezgbProgress(syncResult)?.detail : "Check the saved import status to see whether your statements have arrived."}
                </Text>
              </View>
              {error ? (
                <Surface tone="subtle">
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    {error}
                  </Text>
                </Surface>
              ) : null}
              {syncResult?.connection?.phase === "awaiting_account" ? <Button label="Connect this utility" onPress={() => router.replace({ pathname: "/provider/ezgb", params: { utilityName: syncResult.connection?.expectedUtility ?? utilityName ?? "" } })} /> : null}
              {(!syncResult?.connection || syncResult.connection.canRetry) ? <Button variant={syncResult?.connection?.phase === "awaiting_account" ? "secondary" : "primary"} label={syncResult?.connection?.phase === "awaiting_account" ? "Already approved? Check again" : syncResult?.connection ? "Check connection again" : "Try import again"} onPress={() => void runSync(false, syncResult?.jobId ?? undefined, Boolean(syncResult?.connection))} /> : null}
              {syncResult?.connection && (syncResult.connection.phase === "different_utility" || !syncResult.connection.canRetry) ? <QuietAction label="Choose utility again" onPress={() => router.replace("/provider/connect" as never)} /> : null}
              {!syncResult?.connection ? <QuietAction label="Check status" onPress={() => void runSync(true, syncResult?.jobId ?? job)} /> : null}
              <QuietAction label="Go back to Bills" onPress={() => router.replace("/(tabs)/bills")} />
            </>
          ) : (
            <>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.criticalBg,
                }}
              >
                <Feather name="alert-circle" size={21} color={colors.criticalForeground} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>
                  {syncResult ? "Your bill import didn’t finish" : "Connection not finished"}
                </Text>
                <Text style={[typography.body, { color: colors.mutedForeground, lineHeight: 22 }]}>
                  {error ?? "Return to Bills and try the connection again."}
                </Text>
              </View>
              {browserRecovery ? <Button label="Check connection again" onPress={() => void openSystemBrowser(true)} /> : null}
              {!browserRecovery && !syncResult && utilityName ? <Button label="Check connection" onPress={() => void checkExistingConnection()} /> : null}
              {syncResult ? <Button variant={syncResult?.connection?.phase === "awaiting_account" ? "secondary" : "primary"} label={syncResult?.connection?.phase === "awaiting_account" ? "Already approved? Check again" : syncResult?.connection ? "Check connection again" : "Try import again"} onPress={() => void runSync(false, syncResult?.jobId ?? undefined, Boolean(syncResult?.connection))} /> : <Button label="Back to connection details" onPress={() => { setStarted(false); setAuthorization(null); setError(null); setStage("intro"); }} />}
              <Button
                variant="secondary"
                label="Back to Bills"
                onPress={() => router.replace("/(tabs)/bills")}
              />
            </>
          )}
          {syncResult?.jobId && stage !== "complete" ? <UtilityAttemptRemoval key={syncResult.jobId} jobId={syncResult.jobId} active={stage === "syncing"}
            onStart={() => { requestVersion.current += 1; }}
            onRemoved={() => { cancelled.current = true; setSyncResult(null); router.replace("/(tabs)/bills"); }}
            onFailure={() => { setStage("authorized_pending"); }} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

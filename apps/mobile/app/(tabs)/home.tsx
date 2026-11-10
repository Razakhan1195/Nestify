import { useTheme } from "@/theme/useTheme";
import { createSerializedImportRefresh } from "@/lib/import-refresh";
import { useHomeImportRefresh } from "@/lib/use-home-import-refresh";
import { screenEpoch } from "@/lib/screen-state";
import { CareFeedback } from "@/components/CareFeedback";
import { ApiError, renewApiSession } from "@/lib/api";
import { QuietAction } from "@/components/Brief";
import { homeScreen, careScreen, billsScreen, vaultScreen } from "@/lib/screen-state";
import { useTabScrollTop } from "@/lib/use-tab-scroll-top";
import {useIsFocused} from "expo-router/react-navigation";
import { EmptyHomeActions } from "@/components/EmptyHomeActions";
import { useAuth } from "@/auth/AuthProvider";
import { useAccountSwitch } from "@/auth/useAccountSwitch";
import { HomeBrief } from "@/components/HomeBrief";
import { billAccountOverview } from "@/lib/bill-account-overview";
import { HomeUtilityProgress } from "@/components/HomeUtilityProgress";
import { HomeSharedExpenses } from "@/components/HomeSharedExpenses";
import { RecallWatchSummary } from "@/components/RecallWatchSummary";
import { Feather } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BriefRow, ReadNotice } from "@/components/Brief";
import { HomeQuickActions, SectionHeading, HomeGreeting, HomeSection } from "@/components/WorkspaceUI";
import { HomeHelp } from "@/components/HomeHelp";
import { HomeBillBrief } from "@/components/BillAccountBrief";
import { homeUpcomingHref, homeUpcomingItems } from "@/lib/home-overview";
import { historyDate } from "@/lib/manual-history-insights";
import { isStartingGoal, localDay, readStartingGoal, orderStartingGoals, startingContent, type StartingGoal } from "@/lib/home-start";
import { fetchVault, formatVaultDate } from "@/lib/vault-data";
import { fetchCare } from "@/lib/care-data";
import { homeTaskStates, remainingHomeTasks, type HomeTaskStates } from "@/lib/home-task-state";
import { loadHomeSources } from "@/lib/home-source-loading";
import { fetchBills } from "@/lib/bills-data";
import { fetchHome } from "@/lib/home-data";
import { layout, typography } from "@/theme/tokens";

export default function HomeScreen() {
  const { colors } = useTheme();

  const router = useRouter();
  const focused=useIsFocused();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const { begin } = useLocalSearchParams<{ begin?: string }>();
  const beginHandled = useRef<string | null>(null);
  const vaultPayload = useSyncExternalStore(vaultScreen.subscribe, vaultScreen.getSnapshot);
  const itemCount = vaultPayload && !vaultPayload.needsOnboarding ? vaultPayload.items.length : 0;
  const recentRecords = vaultPayload && !vaultPayload.needsOnboarding ? vaultPayload.documents.filter(record => record.document_type !== "Statement").sort((a,b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0,2) : [];
  const dataScope = useRef<string | null>(null);
  const [taskStates, setTaskStates] = useState<HomeTaskStates | null>(null);
  const [taskReadError, setTaskReadError] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const request = useRef(0);
  const currentLoad = useRef<Promise<boolean | undefined> | null>(null);
  const activeHome = useRef(focused);
  useEffect(() => { activeHome.current = focused; }, [focused]);
  const payload = useSyncExternalStore(homeScreen.subscribe, homeScreen.getSnapshot);
  const carePayload = useSyncExternalStore(careScreen.subscribe, careScreen.getSnapshot);
  const bills = useSyncExternalStore(billsScreen.subscribe, billsScreen.getSnapshot);
  const [insightError, setInsightError] = useState(false);
  const [error, setError] = useState<{message:string;status:number} | null>(null);
  const [sessionRejected, setSessionRejected] = useState(false);
  const [busy, setBusy] = useState(true);
  const recovery = useRef(false);
  const account = useAccountSwitch(() => !recovery.current, "/(auth)/login");
  const [summaryLoaded, setSummaryLoaded] = useState(() => Boolean(careScreen.getSnapshot() && billsScreen.getSnapshot() && vaultScreen.getSnapshot()));
  const careDueCount = carePayload && !carePayload.needsOnboarding ? carePayload.tasks.filter(task => task.displayStatus === "overdue" || task.displayStatus === "due_soon").length : 0;
  const [refreshing, setRefreshing] = useState(false);
  const readHome = useCallback(async (pull = false, importOnly = false) => {
    const version = ++request.current;
    setBusy(true);
    if (pull && !importOnly) setRefreshing(true);
    try {
      const next = await fetchHome(pull);
      if (version !== request.current) return;
      const scope = next.needsOnboarding ? "onboarding" : `${next.home.id}:${next.accessRole}`;
      if (scope !== dataScope.current) {
        dataScope.current = scope; setSummaryLoaded(false); setTaskStates(null);
      }
      setError(null);
      setSessionRejected(false);
      if (!next.needsOnboarding && next.accessRole === "owner") {
        const [billResult, vaultResult, careResult] = await loadHomeSources(
          { bills: () => fetchBills(undefined, pull),
            vault: () => importOnly && vaultScreen.getSnapshot() ? Promise.resolve(vaultScreen.getSnapshot()!) : fetchVault(pull),
            care: () => importOnly && careScreen.getSnapshot() ? Promise.resolve(careScreen.getSnapshot()!) : fetchCare(pull) },
          {
            isCurrent: () => version === request.current,
            bills: result => {
              if (result.status === "fulfilled" && !result.value.needsOnboarding) {
                setInsightError(false);
              } else setInsightError(true);
            },

          },
        );
        if (version !== request.current) return;
        // A secondary request may revoke the shared Home snapshot. Preserve its
        // actionable denial instead of falling through to a generic empty error.
        const failures = [billResult, vaultResult, careResult].flatMap(result => result.status === "rejected" ? [result.reason] : []);
        const accessFailure = failures.find(failure => failure instanceof ApiError && [401, 423].includes(failure.status))
          ?? failures.find(failure => failure instanceof ApiError && failure.status === 403);
        if (accessFailure) throw accessFailure;
        const sources = {
          bills: billResult.status === "fulfilled" ? billResult.value : null,
          vault: vaultResult.status === "fulfilled" ? vaultResult.value : null,
          care: careResult.status === "fulfilled" ? careResult.value : null,
        };
        const states = homeTaskStates(sources);
        setTaskStates(previous => previous ? { bills: states.bills === "unknown" ? previous.bills === "saved" ? "saved" : "unknown" : states.bills, records: states.records === "unknown" ? previous.records === "saved" ? "saved" : "unknown" : states.records, care: states.care === "unknown" ? previous.care === "saved" ? "saved" : "unknown" : states.care } : states);
        setTaskReadError(states.records === "unknown" || states.care === "unknown");
        return billResult.status === "fulfilled" && vaultResult.status === "fulfilled" && careResult.status === "fulfilled";
      } else { setInsightError(false); setTaskStates(null); setTaskReadError(false); return true; }
    }
    catch (failure) { if (version === request.current) {
      if (failure instanceof ApiError && failure.status === 401) setSessionRejected(true);
      setError({ status: failure instanceof ApiError ? failure.status : 500,
        message: failure instanceof ApiError ? failure.message : "Home could not be loaded. Try again." });
    } return false; }
    finally { if (version === request.current) { setSummaryLoaded(true); setBusy(false); setRefreshing(false); } }
  }, []);
  const load = useCallback((pull = false, importOnly = false) => {
    const job = readHome(pull, importOnly); currentLoad.current = job;
    void job.finally(() => { if (currentLoad.current === job) currentLoad.current = null; }).catch(() => {});
    return job;
  }, [readHome]);
  const importRefresh = useRef<ReturnType<typeof createSerializedImportRefresh> | null>(null);
  const refreshImportedBills = useCallback(() => {
    if (!importRefresh.current) importRefresh.current = createSerializedImportRefresh({
      scope: screenEpoch,
      isActive: () => activeHome.current && AppState.currentState === "active",
      waitForCurrent: () => currentLoad.current,
      refresh: async () => { if (!await load(true, true)) throw new Error("Imported bills could not be refreshed."); },
    });
    return importRefresh.current();
  }, [load]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; setRefreshing(false); }; }, [load]));
  useTabScrollTop("home", scroll);
  useEffect(() => {
    let previous = AppState.currentState;
    const listener = AppState.addEventListener("change", state => {
      if (state === "active" && previous !== "active" && focused) void load();
      previous = state;
    });
    return () => listener.remove();
  }, [focused, load]);
  async function recoverHome() {
    if (recovery.current || account.switching.current) return;
    recovery.current = true;
    const version = request.current;
    try {
      if (sessionRejected) {
        setBusy(true);
        try { await renewApiSession(); }
        catch (failure) {
          if (version === request.current) {
            setBusy(false);
            setError({
              status: failure instanceof ApiError ? failure.status : 503,
              message: failure instanceof ApiError ? failure.message : "Your session could not be renewed. Check your connection and try again.",
            });
          }
          return;
        }
      }
      if (version === request.current) await load(true);
    } finally { recovery.current = false; }
  }
  useEffect(() => {
    if (!begin) { beginHandled.current = null; return; }
    if (!focused || !session?.user.id) return;
    if (!isStartingGoal(begin) || !payload || payload.needsOnboarding || payload.accessRole !== "owner" || beginHandled.current === begin) return;
    beginHandled.current = begin;
    router.setParams({ begin: "" });
    router.push(startingContent[begin].route as never);
  }, [begin, payload, router,focused,session?.user.id]);
  function startTask(goal: StartingGoal) {
    if (!payload || payload.needsOnboarding || payload.accessRole !== "owner") return;
    router.push(startingContent[goal].route as never);
  }

  const home = payload && !payload.needsOnboarding ? payload : null;
  const owner = home?.accessRole === "owner";
  const utilityData = bills && !bills.needsOnboarding ? bills : null;
  const today = localDay(), billDataFresh = !insightError && !error;
  const billAccounts = useMemo(() => utilityData ? billAccountOverview(utilityData, today, billDataFresh) : [], [utilityData, today, billDataFresh]);
  const importUpdates = useHomeImportRefresh({
    enabled: owner === true && !error,
    scope: (session?.user.id ?? "") + ":" + (home?.home.id ?? ""),
    activity: utilityData?.providerActivity ?? [],
    knownSaved: id => utilityData?.bills.filter(bill => bill.providerId === id).length ?? 0,
    refresh: refreshImportedBills,
  });
  if (payload?.needsOnboarding) return <Redirect href="/onboarding" />;
  const preferredGoal = home ? readStartingGoal(session?.user.user_metadata, home.home.id) : null;
  const remaining = orderStartingGoals(taskStates && !error ? remainingHomeTasks(taskStates) : [], preferredGoal);
  const upcoming = home ? homeUpcomingItems(home) : [];
  const providerActivity = utilityData?.providerActivity.filter(item => !home?.attentionItems.slice(0, 2).some(attention => attention.sourceType === "provider" && attention.providerId === item.providerId)) ?? [];
  const emptyHome = owner && home.dashboardState === "EMPTY" && !home.hasMeaningfulHouseholdData && !home.providerHealth.totalCount && !home.availability?.missing.length && !error && !taskReadError && !insightError;
  return <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
    <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      contentContainerStyle={{ padding: layout.screenHorizontal, paddingHorizontal: width < 360 ? 16 : layout.screenHorizontal, paddingTop: layout.screenTop, paddingBottom: 32, gap: layout.sectionGap }}>
      {!emptyHome ? <View style={{gap:16}}>
        <HomeGreeting household={home ? home.home.nickname || "Your household" : undefined} canInvite={owner} />
      </View> : null}
      {!home ? <>{busy ? <ActivityIndicator accessibilityLabel="Loading your home" color={colors.primary} /> : <View style={{gap:12}}><ReadNotice message={account.error ?? error?.message ?? "Home could not be loaded. Try again."} busy={busy || account.busy} onRetry={() => void recoverHome()} />{sessionRejected ? <QuietAction label="Sign in again" disabled={busy || account.busy} onPress={() => void account.switchAccount()} /> : null}</View>}</> : <>
        {error || home.availability?.missing.length ? <ReadNotice message={error ? (error.status === 0 ? "Connection unavailable. Showing the last loaded information." : "Updates could not be loaded. Showing the last loaded information.") : "Some information is unavailable. Your household summary may be incomplete."} busy={busy} onRetry={() => void load()} /> : null}
        {emptyHome ? <EmptyHomeActions onBill={() => startTask("bills")} onRecord={() => startTask("records")} onReminder={() => startTask("care")} onSplit={() => router.push("/shared/edit")} /> : <>
        <HomeBrief home={home} accounts={billAccounts} failed={Boolean(error)||taskReadError||insightError} loading={busy && !summaryLoaded && (!bills || !carePayload)} updating={busy && summaryLoaded} careDueCount={careDueCount} providerBusy={providerActivity.some(item=>item.state==="syncing")} startingGoal={preferredGoal ?? remaining[0] ?? "bills"} />
        {owner ? <HomeQuickActions onBill={() => startTask("bills")} onRecord={() => startTask("records")} onReminder={() => startTask("care")} onSplit={() => router.push("/shared/edit")} /> : null}
        {owner ? <HomeUtilityProgress accountsLoaded={summaryLoaded} key={"utility-progress:" + home.home.id} hasAccounts={Boolean(utilityData?.utilityInsights.length) && !insightError} onComplete={refreshImportedBills} /> : null}
        {owner && importUpdates.failed ? <ReadNotice message="Connection progress couldn’t be checked. Your saved bills are still available." onRetry={importUpdates.retry} /> : null}
        {owner && providerActivity.length ? <HomeSection>
          <SectionHeading title="Connections" />
          {providerActivity.slice(0, 2).map(item => <BriefRow key={item.providerId} title={`${item.providerName} · ${item.state === "syncing" ? "Updating" : "Connection needs attention"}`} detail={item.message} onPress={() => router.push(item.mobileHref as never)} />)}
          {providerActivity.length > 2 ? <BriefRow title={`Review all ${providerActivity.length} connection updates`} onPress={() => router.push("/provider")} /> : null}
        </HomeSection> : null}
        {upcoming.length ? <HomeSection><SectionHeading title="Coming up" />
          {upcoming.slice(0, 3).map(item => {
            const date = historyDate(item.date) ? new Date(item.date + "T12:00:00Z") : null;
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.detail}. ${item.timing}`} onPress={() => router.push(homeUpcomingHref(item) as never)} style={({ pressed }) => ({ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfaceSubtle : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
              <View accessible={false} style={{ minWidth: 46, borderRadius: 10, padding: 7, backgroundColor: colors.surfaceSubtle, alignItems: "center", gap: 2 }}>
                {date ? <><Text style={[typography.caption, { color: colors.mutedForeground }]}>{new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" }).format(date).toUpperCase()}</Text><Text style={[typography.title, { color: colors.foreground }]}>{date.getUTCDate()}</Text></> : <Feather name="calendar" size={23} color={colors.primary} />}
              </View>
              <View style={{ flex: 1, gap: 4 }}><Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>{item.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{item.type === "Vault" ? "Record" : item.type} · {item.detail} · {item.timing}</Text></View><Feather name="chevron-right" size={17} color={colors.primary} />
            </Pressable>;
          })}
        </HomeSection> : null}
        {owner && insightError ? <ReadNotice message={utilityData ? "Couldn’t check for newer bills. Showing previously loaded records." : "Your bill information couldn’t be loaded."} busy={busy} onRetry={() => void load()} /> : null}
        {owner && utilityData ? <HomeBillBrief bills={utilityData} accounts={billAccounts} fresh={billDataFresh} showChange={false} /> : null}
        {taskReadError ? <ReadNotice message="Some records or care tasks couldn’t be checked. Previously loaded items may be out of date." busy={busy} onRetry={() => void load()} /> : null}
        {owner && itemCount>0 ? <RecallWatchSummary key={"recall-watch:" + home.home.id} itemCount={itemCount} onlyActionable/>:null}
        {owner && recentRecords.length ? <HomeSection><SectionHeading title="Recently saved" />
          {recentRecords.map(record => <BriefRow key={record.id} title={record.title} detail={`${record.category}${record.expires_on ? ` · Expiry ${formatVaultDate(record.expires_on)}` : ""}`} onPress={() => router.push({ pathname: "/vault-record", params: { id: record.id } })} />)}
        </HomeSection> : null}
        {owner && busy && !taskStates ? <ActivityIndicator accessibilityLabel="Checking your saved bills, records and care tasks" color={colors.primary} /> : null}
        {owner ? <HomeHelp hasBills={insightError || busy || !utilityData ? null : Boolean(utilityData.bills.length || utilityData.utilityInsights.length)} /> : null}
        </>}
        <HomeSharedExpenses key={home.home.id + home.accessRole} homeId={home.home.id} hideEmpty={emptyHome} />
      </>}
    </ScrollView>
    <CareFeedback/>
  </SafeAreaView>;
}


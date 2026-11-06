import { billsScreen } from "@/lib/screen-state";
import { BillGettingStarted } from "@/components/BillGettingStarted";
import { useTabScrollTop } from "@/lib/use-tab-scroll-top";
import { CollectionIntro } from "@/components/CollectionIntro";
import {HomeUtilityProgress} from "@/components/HomeUtilityProgress";
import {EmailImportEntry,useEmailImport} from "@/components/EmailImportEntry";
import SharedExpenses from "../shared";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import { targetNeedsFollowUp } from "@/lib/bill-outcome";
import {ProviderConnectionChoices} from "@/components/ProviderConnectionChoices";
import {BillInsights} from "@/components/BillInsights";
import {openLegacyBillHistory,billCollectionDestination,isHistoryDestination,collectionBillRecords} from "@/lib/collection-navigation";
import { CollectionPages, CollectionFilter } from "@/components/CollectionPages";
import { CollectionToolbar, CollectionAddSheet, CollectionSearch } from "@/components/CollectionUI";
import {billFollowUpLabel,needsBillFollowUp} from "@/lib/bill-review";
import { statementBatches } from "@/lib/statement-batch";
import { useAuth } from "@/auth/AuthProvider";
import { statementDrafts } from "@/lib/statement-draft";
import { pendingBillUpload } from "@/lib/bill-upload-pending";
import { useIsFocused } from "expo-router/react-navigation";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BriefRow, QuietAction, ReadNotice } from "@/components/Brief";
import { SectionHeading } from "@/components/WorkspaceUI";
import { fetchBills, formatDueDate, billFilters, type BillFilterValue, type BillListItem } from "@/lib/bills-data";
import { BillsAccountList } from "@/components/BillAccountBrief";
import { ApiError } from "@/lib/api";
import { colors, layout, typography } from "@/theme/tokens";

const views = [{value:"insights",label:"Insights"},{value:"accounts",label:"Accounts"},{value:"shared",label:"Expenses"}] as const;
export default function BillsScreen({historyOnly=false}:{historyOnly?:boolean}={}) {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  useTabScrollTop("bills", scroll, !historyOnly);
  const emailImport=useEmailImport();
  const [adding,setAdding]=useState(false);
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unfinished, setUnfinished] = useState<{ userId: string; kind: "draft" | "save" } | null>(null);
  const [batchOwner, setBatchOwner] = useState<string|null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (userId) void Promise.all([statementDrafts.read(userId), pendingBillUpload(), statementBatches.read(userId)])
      .then(([draft, pending, batch]) => { if (active) { setBatchOwner(batch ? userId : null); setUnfinished(pending ? { userId, kind: "save" } : draft ? { userId, kind: "draft" } : null); setDraftError(null); } })
      .catch(() => { if (active) setDraftError(userId); });
    return () => { active = false; };
  }, [userId]));
  const version = useRef(0), polls = useRef(0);
  const focused = useIsFocused();
  const payload = useSyncExternalStore(billsScreen.subscribe, billsScreen.getSnapshot);
  const [busy, setBusy] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState<string | null>(null);
  const view = historyOnly?"history":billCollectionDestination(section);
  const setView = (value: typeof views[number]["value"]) => router.setParams({ section: value });
  const [allFollowUps,setAllFollowUps]=useState(false);
  const [query, setQuery] = useState("");
  const [recordFilter,setRecordFilter]=useState<BillFilterValue>(isHistoryDestination(section)?"archived":"all");
  const filter=recordFilter;
  function setFilter(value:BillFilterValue){setRecordFilter(value);}
  const [category, setCategory] = useState("all");
  const [allStatements, setAllStatements] = useState(false), [summary, setSummary] = useState(false);
  const load = useCallback(async (pull = false, force = pull) => {
    const id = ++version.current; setBusy(true); if (pull) setRefreshing(true);
    try { await fetchBills(undefined, force); if (id === version.current) { setError(null); } }
    catch (failure) { if (id === version.current) setError(failure instanceof ApiError ? failure.message : "Your bills could not be loaded. Try again."); }
    if (id !== version.current) return;
    setBusy(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { polls.current = 0; void load(); return () => { version.current++; setRefreshing(false); }; }, [load]));
  useEffect(() => {
    if (!focused || error || busy || !payload || payload.needsOnboarding || polls.current >= 20 || !payload.providerActivity.some(item => item.state === "syncing")) return;
    const timer = setTimeout(() => { polls.current++; void load(false, true); }, 5000);
    return () => clearTimeout(timer);
  }, [focused, error, busy, payload, load]);
  useEffect(() => {
    const access=!payload?"loading":payload.needsOnboarding?(payload.sharedHousehold?"shared-only":"onboarding"):"private";
    openLegacyBillHistory(router,section,access,historyOnly);
  }, [historyOnly, section, payload, router]);

  if (payload?.needsOnboarding && payload.sharedHousehold) return historyOnly?<Redirect href="/(tabs)/bills?section=shared"/>:<SharedExpenses embedded />;
  if (payload?.needsOnboarding) return <Redirect href="/onboarding" />;

  const data = payload && !payload.needsOnboarding ? payload : null;
  const money = (value: number | null, currency = "CAD") => value === null ? "Amount unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
  const matches = (bill: NonNullable<typeof data>["bills"][number]) => (category === "all" || bill.categoryId === category) && [bill.label, bill.name, bill.providerName, bill.category, bill.accountNumber].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const allHistory = data?.bills.filter(bill => bill.isHistoricalStatement) ?? [];
  const records = collectionBillRecords(data?.bills ?? [],filter,matches);
  const manualHistoryCount = allHistory.filter(bill => bill.source === "manual").length;
  const today = new Date().toLocaleDateString("en-CA");
  const followUpMap=new Map<string,Pick<BillListItem,"id"|"label"|"providerName"|"accountNumber"|"reviewSummary"|"outcomeSummary">>((data?.bills??[]).map(b=>[b.id,b]));
  for(const row of [...(data?.outcomeFollowUps??[]),...(data?.reviewFollowUps??[])])followUpMap.set(row.id,{...followUpMap.get(row.id),...row});
  const followUpBills=[...followUpMap.values()];
  const followUps = followUpBills.flatMap(bill=>[
    ...(needsBillFollowUp(bill.reviewSummary) ? [{bill, key:bill.id+"-review", detail:billFollowUpLabel(bill.reviewSummary!), savedAt:bill.reviewSummary!.savedAt, path:bill.reviewSummary?.status==="offers"?"/bill/offer-comparison" as const:"/bill/review" as const}] : []),
    ...(targetNeedsFollowUp(bill.outcomeSummary,today) ? [{bill,key:bill.id+"-outcome",detail:bill.outcomeSummary!.title+(bill.outcomeSummary!.state==="planned"?" · Planned":" · Check a later statement"),savedAt:bill.outcomeSummary!.savedAt,path:"/bill/outcome" as const}] : []),
  ]).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.key.localeCompare(b.key));
  const empty = data && !data.bills.length && !data.utilityInsights.length && !data.providerActivity.length && !followUps.length;
  const renderPageBody=(page:"insights"|"accounts"|"shared"|"history")=>page==="shared"?(view==="shared"?<SharedExpenses inline/>:null):!data?null:empty?<View style={{gap:12}}>
          {page==="insights"?<>
            <BillGettingStarted firstBill/>
          </>:<>
            {page!=="accounts"?<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Your bill history starts here</Text>:null}
            <Text style={[typography.body,{color:colors.mutedForeground}]}>{page==="accounts"?"Add a bill to create an account overview. Connecting a provider is optional.":"Upload a statement to keep the original, review charges and build this account’s history."}</Text>
            <QuietAction label="Upload a statement" onPress={()=>router.push("/bill/batch")}/>
            {page==="accounts"?<BriefRow title="All statements" detail="History across all your providers" onPress={()=>router.push("/bill/statements")}/>:null}
          </>}
        </View>:page==="insights"?<View style={{gap:layout.sectionGap}}>
          <BillInsights bills={data} fresh={!error}/>
          <BillGettingStarted/>
          {(data.outcomeCoverageComplete===false||data.reviewCoverageComplete===false)?<ReadNotice message="Some saved follow-ups could not be loaded. Refresh before assuming there is nothing to check." busy={busy} onRetry={()=>void load()}/>:null}
          {!error && !data.utilityInsights.length && !data.providerActivity.length ? <ProviderConnectionChoices/> : null}
            {followUps.length?<View>
              <SectionHeading title="Your follow-ups" />
              {(allFollowUps?followUps:followUps.slice(0,3)).map(item=><BriefRow key={item.key} title={item.bill.providerName??item.bill.label} detail={[item.detail,item.bill.accountNumber].filter(Boolean).join(" · ")} onPress={()=>router.push({pathname:item.path,params:{billId:item.bill.id}})}/>)}
              {followUps.length>3?<QuietAction label={allFollowUps?"Show fewer follow-ups":"Show all saved follow-ups"} onPress={()=>setAllFollowUps(value=>!value)}/>:null}
              {data.historyCoverage?.complete===false?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Showing follow-ups from the statements loaded so far.</Text>:null}
            </View>:null}

        </View>:page==="accounts"?<View style={{gap:layout.sectionGap}}>
            <BriefRow title="All statements" detail="History across all your providers" onPress={()=>router.push("/bill/statements")}/>
            {data.providerActivity.filter(item => item.adapter !== "ezgb").map(item => <BriefRow key={item.providerId} title={`${item.providerName} · ${item.state === "syncing" ? "Updating" : "Connection needs attention"}`} detail={item.message} onPress={() => router.push(item.mobileHref as never)} />)}
            <BillsAccountList bills={data} fresh={!error} showConnectionsAction={false} />
            <View><SectionHeading title="Due next" action="View bills" onPress={() => router.push("/bill/statements")} />
              {data.dueNext.slice(0, 3).map(bill => <BriefRow key={bill.id} title={bill.label} detail={`Due ${formatDueDate(bill.dueDate)}`} value={money(bill.currentAmountDue ?? bill.amount, bill.currency)} onPress={() => router.push(`/bill/${bill.id}`)} />)}
              {!data.dueNext.length ? <Text style={[typography.body, { color: colors.mutedForeground }]}>No upcoming due dates in your saved bills. Statements alone don’t confirm a payment is due.</Text> : null}
            </View>


          </View>:<View style={{gap:16}}>
            <Text style={[typography.meta,{color:colors.mutedForeground}]}>All saved bills and statements. Open a record to view its original or correct its details.</Text>
            <CollectionSearch label="Search bills and statements" placeholder="Search bills or providers" value={query} onChangeText={setQuery}/>
            <View style={{flexDirection:"row",flexWrap:"wrap",columnGap:16}}>
              <CollectionFilter label="Show bills" options={billFilters.map(option=>({...option,label:option.value==="all"?"All records":option.value==="archived"?"Historical statements":option.label}))} selected={filter} onSelect={setFilter}/>
              {data.categories.length?<CollectionFilter label="Bill category" options={[{value:"all",label:"All categories"},...data.categories.map(c=>({value:c.id,label:c.label}))]} selected={category} onSelect={setCategory}/>:null}
            </View>
            {filter==="archived"?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Historical charges, not a live account balance.</Text>:null}
            {filter==="archived"&&manualHistoryCount>1?<QuietAction label="Compare recorded charges" onPress={()=>router.push("/bill/history-insights")}/>:null}
            <View>{(allStatements?records:records.slice(0,12)).map(bill=><BriefRow key={bill.id} title={bill.label} detail={bill.isHistoricalStatement?`Statement · ${bill.billingPeriodEnd?("Period ending "+formatDueDate(bill.billingPeriodEnd)):"Period unavailable"}${bill.accountNumber?(" · "+bill.accountNumber):""}`:`${bill.status==="paid"?"Recorded as paid":bill.status==="incomplete"?"Details needed":bill.status==="draft"?"Draft":bill.dueDate?"Due "+formatDueDate(bill.dueDate):"No due date recorded"} · ${bill.category}`} value={money(bill.amount,bill.currency)} onPress={()=>router.push(`/bill/${bill.id}`)}/>)}</View>
            {records.length>12?<QuietAction label={allStatements?"Show fewer":`Show all ${records.length} records`} onPress={()=>setAllStatements(value=>!value)}/>:null}
            {!records.length?<Text style={[typography.body,{color:colors.mutedForeground}]}>No bills match these filters. Choose All records or clear your search.</Text>:null}
            {filter!=="archived"?<View style={{gap:12}}>
              <QuietAction label={summary?"Hide monthly summary":"View monthly summary"} onPress={()=>setSummary(value=>!value)}/>
              {summary?<Text style={[typography.body,{color:colors.mutedForeground}]}>{data.bills.some(bill=>bill.currency!=="CAD")?"Amounts include multiple currencies. Review each bill separately.":`${data.overview.monthLabel} · Recorded bills: ${money(data.monthlyTotal)}
Paid: ${money(data.overview.paidThisMonth)}
Remaining: ${money(data.overview.remainingThisMonth)}
Scheduled: ${money(data.overview.scheduledThisMonth)}`}</Text>:null}
            </View>:null}
          </View>;
  const renderPage=(page:"insights"|"accounts"|"shared"|"history") => <View style={{gap:18}}>
    {!empty?renderPageBody(page):null}
    {data&&page!=="history"&&page!=="shared"?<CollectionIntro section={page} spacious={Boolean(empty)}
      actionLabel={page==="insights"?(empty?"Add your first bill":"Add a bill"):empty?"Find your provider":"Manage connections"}
      detail={page==="insights"?(empty?"Start with one bill. Keep the original and understand the charges.":"Add your latest bill to understand new charges and build a clearer history."):empty?undefined:"Check connection status and keep statements from your providers together."}
      onPress={()=>router.push(page==="insights"?"/bill/add":empty?"/provider/connect":"/provider")}/>:null}
    {empty?renderPageBody(page):null}
  </View>;
  return <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
    {historyOnly?<ScreenNavigation title="All statements" fallback="/(tabs)/bills?section=accounts" backLabel="Back to Accounts"/>:null}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      refreshControl={view==="shared"?undefined:<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      contentContainerStyle={{ padding: layout.screenHorizontal, paddingTop: layout.screenTop, paddingBottom: 32, gap: layout.sectionGap }}>
      <CollectionToolbar title={historyOnly?undefined:"Bills"} description={historyOnly?"Bill history across your providers.":view==="shared"?"Keep household costs and everyone’s share clear.":"Understand the charges. Keep the next step in view."} label="Add to Bills" onAdd={view==="shared"?undefined:() => setAdding(true)} />
      {view!=="shared" && batchOwner === userId && userId ? <BriefRow title="Continue statement uploads" detail="Review saved progress and finish individual files." onPress={() => router.push("/bill/batch")} /> : null}
      {view!=="shared" && unfinished && unfinished.userId === userId ? <BriefRow title={unfinished.kind === "save" ? "Finish statement save" : "Continue statement draft"} detail={unfinished.kind === "save" ? "Check and finish your previous upload." : "Your unfinished details are saved on this device. Bring the original file."} onPress={() => router.push("/bill/import")} /> : null}
      {view!=="shared" && draftError === userId && userId ? <ReadNotice message="We couldn’t check unfinished statement work on this device." onRetry={() => router.push("/bill/import")} /> : null}
      {view!=="shared" && error ? <ReadNotice message={data ? `${error} Showing the last loaded bills.` : error} busy={busy} onRetry={() => void load(true)} /> : null}
      {view!=="shared" && !data && busy ? <ActivityIndicator accessibilityLabel="Loading bills" color={colors.primary} /> : null}
      {!historyOnly&&view!=="shared"?<EmailImportEntry destination={emailImport}/>:null}
      {!historyOnly && view!=="shared" && data ? <HomeUtilityProgress accountsLoaded={Boolean(data)} hasAccounts={data.bills.some(bill=>bill.source==="ezgb")} onComplete={()=>void load()}/> : null}
      {historyOnly?renderPage("history"):<CollectionPages label="Bill views" options={views} selected={view==="history"?"accounts":view} onSelect={setView} renderPage={renderPage}/>}
    </ScrollView>
    <CollectionAddSheet title="Add to Bills" visible={adding} onClose={() => setAdding(false)} choices={[
      ...(emailImport?[{key:"email",title:"Import from email",detail:"Review bills, receipts and warranties from email.",icon:"mail" as const,onPress:()=>router.push(emailImport)}]:[]),
      {key:"bill",title:"Add a bill",detail:"Scan or enter bill details.",icon:"file-text",onPress:()=>router.push("/bill/add")},
      {key:"receipt",title:"Scan a receipt",detail:"Keep a purchase receipt in Vault.",icon:"camera",onPress:()=>router.push({pathname:"/vault-record",params:{kind:"receipt"}})},
      {key:"statements",title:"Upload statements",detail:"Add one or several past statements.",icon:"upload",onPress:()=>router.push("/bill/batch")},
      {key:"utility",title:"Connect an Ontario utility",detail:"Electricity and natural gas through Green Button / EZGB.",icon:"zap",onPress:()=>router.push("/provider/ezgb")},
      {key:"provider",title:"Other provider connections",detail:"Review the providers being tested with Deck.",icon:"link",onPress:()=>router.push("/provider/connect")},
    ]} />
  </SafeAreaView>;
}


import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel,JourneySteps} from "@/components/JourneyUI";
import { useAuth } from "@/auth/AuthProvider";
import { moneyCents } from "@/lib/statement-evidence";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { QuietAction } from "@/components/Brief";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import { comparableOutcomeStatements, sameBillTargetDetails, outcomeHasComparison, type BillOutcomeKind, type BillTarget, type OutcomeStatement, type evaluateBillTarget } from "@/lib/bill-outcome";
import { editorialType, spacing, typography } from "@/theme/tokens";

type Payload = { kind?: BillOutcomeKind; baselineActive?: boolean; version: string; baseline: OutcomeStatement; evidence: OutcomeStatement | null; candidateCount: number; baselineChanged: boolean; target: BillTarget | null; result: ReturnType<typeof evaluateBillTarget> | null; candidates: OutcomeStatement[]; coverageComplete: boolean };
type Fields = Pick<BillTarget, "kind" | "title" | "expectedAmount" | "effectiveDate" | "cost" | "notes" | "state" | "evidenceBillId" | "snoozedUntil">;
type SaveBody = Fields & {version:string;agreementConfirmed:boolean;confirmBaseline:boolean};
const defaults: Fields = { title: "Agreed bill amount", expectedAmount: "", effectiveDate: "", cost: "", notes: "", state: "planned", evidenceBillId: null, snoozedUntil: null };
const money = (amount: number | null) => amount === null ? "Amount unavailable" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
function fieldsOf(target: BillTarget | null, kind: BillOutcomeKind = "agreed_amount"): Fields {
  if (!target) return { ...defaults, kind, title: kind === "usage_change" ? "Usage change" : defaults.title };
  const { title, expectedAmount, effectiveDate, cost, notes, state, evidenceBillId, snoozedUntil } = target;
  return { kind: target.kind ?? kind, title, expectedAmount, effectiveDate, cost, notes, state, evidenceBillId, snoozedUntil };
}
function Confirmation({label,checked,disabled,onPress}:{label:string;checked:boolean;disabled:boolean;onPress:()=>void}) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked,disabled}} disabled={disabled} onPress={onPress} style={{minHeight:48,justifyContent:"center",paddingVertical:8}}><Text style={[typography.body,{color:colors.primary}]}>{checked ? "✓ " : "○ "}{label}</Text></Pressable>;
}
export default function OutcomeScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const {session}=useAuth();
  return <Outcome key={(session?.user.id??"signed-out")+":"+billId} id={billId} />;
}
function Outcome({ id }: { id: string }) {
  const { colors } = useTheme();

  const router = useRouter(), navigation = useNavigation();
  const [data, setData] = useState<Payload | null>(null), [fields, setFields] = useState<Fields>({ ...defaults });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false), [choosing, setChoosing] = useState(false), [details, setDetails] = useState(false);
  const [managing,setManaging]=useState(false);
  const [confirmed, setConfirmed] = useState(false), [confirmBaseline, setConfirmBaseline] = useState(false);
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const lock = useRef(false), dirtyRef = useRef(false), generation = useRef(0);
  const pending = useRef<SaveBody | null>(null);
  const [recovery,setRecovery] = useState<"check"|"retry"|"conflict"|null>(null);
  const endpoint = `/api/mobile/v1/bills/${encodeURIComponent(id ?? "")}/outcome`;
  const apply = useCallback((payload: Payload) => {
    setData(payload); setFields(fieldsOf(payload.target, payload.kind)); setConfirmed(Boolean(payload.target));
    setConfirmBaseline(false); setDirty(false); dirtyRef.current = false;
    setEditing(!payload.target); setChoosing(false); setError(null); pending.current=null; setRecovery(null);
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    try { const payload = await apiGet<Payload>(endpoint); if (current === generation.current) apply(payload); }
    catch (e) { if (current === generation.current) setError(e instanceof ApiError ? e.message : "Could not load this action. Your saved work is unchanged."); }
    finally { if (current === generation.current) setLoading(false); }
  }, [endpoint, apply]);
  useFocusEffect(useCallback(() => { if (!dirtyRef.current) void load(); return () => { generation.current++; }; }, [load]));
  usePreventRemove(dirty || busy, ({ data: event }) => {
    if (lock.current) { Alert.alert("Saving your action", "Wait for this save to finish."); return; }
    Alert.alert(pending.current ? "Leave before checking the save?" : "Leave without saving?", pending.current ? "The change may already be saved. Reopen this action to review the saved version before entering it again." : "Your last saved action will remain.", [{ text: pending.current ? "Stay and check" : "Keep editing", style: "cancel" }, { text: pending.current ? "Leave and check later" : "Discard edits", style: "destructive", onPress: () => navigation.dispatch(event.action) }]);
  });
  function edit(patch: Partial<Fields>) { if (lock.current || pending.current) return; setFields(v => ({ ...v, ...patch })); setDirty(true); dirtyRef.current = true; setSaved(false); }
  function reload() {
    if (dirtyRef.current) Alert.alert("Load the saved action?", "This replaces your unsaved changes.", [{ text: "Keep editing", style: "cancel" }, { text: "Reload", onPress: () => void load() }]);
    else void load();
  }
  async function submit(body:SaveBody) {
    if(lock.current)return;
    lock.current=true;generation.current++;setLoading(false);setBusy(true);setError(null);setSaved(false);
    try { const payload=await apiPatch<Payload>(endpoint,body,{timeoutMs:15000}); apply(payload);setSaved(true); }
    catch(e){
      if(!(e instanceof ApiError)||e.status===408||e.status>=500){
        pending.current=body;setRecovery("check");setDirty(true);dirtyRef.current=true;
        setError("We couldn’t confirm the save. Your details are kept. Check the saved change before trying again.");
      }else{
        pending.current=null;setRecovery(null);setError(e.message);
      }
    } finally {lock.current=false;setBusy(false);}
  }
  async function save(patch:Partial<Fields>={}) {
    if(!data||lock.current||pending.current)return;
    await submit({...fields,...patch,version:data.version,agreementConfirmed:confirmed,confirmBaseline});
  }
  async function checkSaved() {
    const attempt=pending.current;if(!attempt||lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    try {
      const payload=await apiGet<Payload>(endpoint,{timeoutMs:15000});
      if(sameBillTargetDetails(payload.target,attempt)&&(!attempt.confirmBaseline||!payload.baselineChanged)){
        apply(payload);setSaved(true);
      }else if(payload.version===attempt.version){
        setRecovery("retry");setError("The saved version is unchanged. You can retry the same change safely.");
      }else{
        setRecovery("conflict");setError("This action changed elsewhere. Review the saved version before replacing your entered details.");
      }
    }catch{setRecovery("check");setError("We couldn’t check the saved change. Your entered details are still kept. Try again when you’re connected.");}
    finally{lock.current=false;setBusy(false);}
  }
  const text = (value: string) => <Text style={[typography.body, { color: colors.mutedForeground }]}>{value}</Text>;
  const evidence = data?.evidence;
  const usage = (data?.kind ?? data?.target?.kind) === "usage_change";
  const expectedCents=data?.target?moneyCents(data.target.expectedAmount):null;
  const evidenceCents=evidence?.amount!==null&&evidence?.amount!==undefined?moneyCents(String(evidence.amount)):null;
  const agreementDifference=!usage&&data?.result?.state==="different"&&expectedCents!==null&&evidenceCents!==null?evidenceCents-expectedCents:null;
  const connected = Boolean(data?.baseline.source && data.baseline.source !== "manual");
  const number = (value:number) => new Intl.NumberFormat("en-CA", {maximumFractionDigits:3}).format(value);
  const statementValue = (bill:OutcomeStatement) => usage ? bill.usageAmount === null || bill.usageAmount === undefined ? "Usage unavailable" : number(bill.usageAmount) + " " + (bill.usageUnit ?? "") : money(bill.amount);
  const openNext = () => connected && data?.baseline.providerId ? router.push(("/provider/" + data.baseline.providerId) as never) : router.push({pathname:"/bill/add",params:{recordKind:"historical",providerName:data?.baseline.provider,accountName:data?.baseline.account,category:data?.baseline.category}});
  const disabled=busy||recovery!==null;
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Toronto"});
  const candidates=data?.target?comparableOutcomeStatements(data.target,data.baseline,data.candidates,today):[];
  const closed = data?.target?.state === "abandoned" || data?.target?.state === "completed";

  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Track a bill change" fallback={`/bill/${id}`} />
    <View style={{ flex: 1 }} >
      <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 }}>
        {loading ? <ActivityIndicator accessibilityLabel="Loading bill action" /> : null}
        {error ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text>{recovery ? <Button label={recovery==="retry"?"Retry save":recovery==="conflict"?"Review saved version":"Check saved change"} disabled={busy} loading={busy} onPress={()=>{if(recovery==="retry"&&pending.current)void submit(pending.current);else if(recovery==="conflict")reload();else void checkSaved();}}/> : <QuietAction label="Reload saved action" disabled={busy} onPress={reload} />}</View> : null}
        {data && !loading ? <>
          <JourneyHeading eyebrow={data.baseline.provider} title="Did the change help?" detail={data.baseline.account + " · " + data.baseline.category}/>
          <JourneySteps labels={["Baseline","Your change","Later evidence"]} current={!data.target?0:data.target.state==="planned"?1:2}/>
          <Text style={[typography.meta,{color:colors.mutedForeground}]}>A saved action is a starting point. Later statements show what actually changed.</Text>
          <View style={{ padding: spacing.lg, borderRadius: 22, backgroundColor: colors.surface, gap: 8 }}>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>Baseline statement</Text>
            <Text style={[editorialType, { fontSize:30,lineHeight:37,color: colors.foreground }]}>{statementValue(data.baseline)}</Text>
            {text(usage ? "Recorded consumption for this service period" : data.baseline.amountBasis === "statement_total" ? "Imported statement total · review the original for prior balances and adjustments" : "Charges for this service period")}
            {text(`${data.baseline.start ?? "Start missing"} – ${data.baseline.end ?? "End missing"}`)}
            <QuietAction label={data.baseline.hasOriginal ? "Review baseline and original" : "Review baseline statement"} disabled={disabled} onPress={() => router.push(`/bill/${id}`)} />
          </View>
          {data.target?.state === "completed" ? text("Tracking completed. This checks saved evidence, not future bills.") : null}
          {data.result ? <JourneyPanel tone="soft">
            <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{data.result.title}</Text>
            {agreementDifference!==null&&agreementDifference!==0?text(`${data.baseline.amountBasis==="statement_total"?"Saved statement total":"Recorded charges"} ${data.baseline.amountBasis==="statement_total"?"is":"are"} ${money(Math.abs(agreementDifference)/100)} ${agreementDifference>0?"above":"below"} your agreed ${money(expectedCents!/100)}.`):null}
            {text(data.result.detail)}
            {evidence ? <><Text style={[typography.body, { color: colors.foreground }]}>Selected statement · {statementValue(evidence)}</Text>{text(`${evidence.start} – ${evidence.end}`)}<QuietAction label={evidence.hasOriginal ? "Review evidence and original" : "Review evidence statement"} disabled={disabled} onPress={() => router.push(`/bill/${evidence.id}`)} /></> : null}
            {data.result.usageComparison ? <View style={{gap:6}}>
              {text(number(data.result.usageComparison.beforePerDay) + " → " + number(data.result.usageComparison.afterPerDay) + " " + data.result.usageComparison.unit + " per day")}
              {text(data.result.usageComparison.beforeDays + " baseline days · " + data.result.usageComparison.afterDays + " later days")}
              {data.result.usageComparison.percent !== null ? text(Math.abs(data.result.usageComparison.percent) + "% " + (data.result.usageComparison.percent < 0 ? "lower" : data.result.usageComparison.percent > 0 ? "higher" : "change") + " in recorded daily usage.") : text("The baseline is zero, so a percentage change cannot be calculated.")}
              {data.result.usageComparison.gapDays ? text(data.result.usageComparison.gapDays + " days between these periods. Missing days are not filled in.") : null}
            </View> : null}
            {data.result.differenceCents !== null ? text(`Change in recorded bill total: ${money(data.result.differenceCents / 100)}. This is not savings attributed to your action.`) : null}
          </JourneyPanel> : text(usage ? "Record a change you plan to make, then compare a later full period’s daily usage. This checks what happened, without promising savings or assuming the change caused it." : "Have a confirmed new telecom price? Save the agreed total, then check it against a later bill. A provider connection is optional.")}
          {data.target && !editing ? <View style={{ gap: 10 }}>
            {text(usage ? `${data.target.title} · Effective ${data.target.effectiveDate}` : `Agreed total: ${money(Number(data.target.expectedAmount))} including tax · Effective ${data.target.effectiveDate}`)}
            {data.target.notes ? text(data.target.notes) : null}
            {data.target.cost !== "" ? text(`Recorded change cost: ${money(Number(data.target.cost))}. Kept separate from the bill comparison.`) : null}
            {data.target.snoozedUntil ? text(`Hidden from follow-ups until ${data.target.snoozedUntil}. No push reminder is scheduled.`) : null}
            {data.baselineChanged && !closed ? <QuietAction label="Review and update this action" disabled={disabled} onPress={() => setEditing(true)} /> : <>
              {data.target.state === "planned" ? <Button label="Mark change implemented" disabled={disabled} loading={busy} onPress={() => void save({ state: "implemented" })} /> : null}
              {data.target.state === "implemented" && candidates.length && !outcomeHasComparison(data.result?.state) ? <Button label={choosing?"Hide statements":"Check a saved statement"} disabled={disabled} onPress={()=>setChoosing(v=>!v)}/> : null}
              {data.target.state === "implemented" && !candidates.length && !outcomeHasComparison(data.result?.state) ? <View style={{gap:8}}><Button label={connected ? "Check provider connection" : "Add the next bill"} disabled={disabled} onPress={openNext}/>{data.candidates.length ? <><Text style={[typography.body,{color:colors.mutedForeground}]}>Saved statements do not yet provide a completed, comparable period after this change. Dates, units or reading quality may need review.</Text><QuietAction label="Review latest saved statement" disabled={disabled} onPress={()=>router.push(("/bill/"+data.candidates[0].id) as never)}/></> : null}</View> : null}
            </>}
            {choosing ? <View style={{ gap: 12 }}>
              {text(usage ? "Choose a full service period after the change. Daily usage accounts for different billing lengths; weather and occupancy are not adjusted." : "Choose the first full billing period after the change. Transition bills may contain partial charges.")}
              {candidates.length ? candidates.map(b => <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Check ${b.start} to ${b.end}, ${statementValue(b)}`} disabled={disabled} onPress={()=>void save({evidenceBillId:b.id,snoozedUntil:null})} style={{minHeight:64,padding:spacing.md,gap:4,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,opacity:disabled?0.5:1}}><Text style={[typography.body,{color:colors.foreground,fontWeight:"600"}]}>{statementValue(b)}</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>{b.start} – {b.end}</Text></Pressable>) : text("No completed, comparable statement is saved for this change yet.")}
              {data.candidates.length>candidates.length?text("Earlier, unfinished or non-comparable periods are left out of this check. They remain in your bill history."):null}
              {data.candidateCount > data.candidates.length ? text(`Showing the newest ${data.candidates.length} of ${data.candidateCount} matching statements.`) : null}
              {!data.coverageComplete ? text("Some older history is outside this check’s coverage. A result will not be verified from an incomplete set.") : null}
            </View> : null}
            {!closed ? <>
              {data.result && outcomeHasComparison(data.result.state) ? <Button label="Finish this check" disabled={disabled} loading={busy} onPress={() => void save({state:"completed",snoozedUntil:null})} /> : null}
              <QuietAction label={managing?"Hide options":"Manage this change"} disabled={disabled} onPress={()=>setManaging(v=>!v)}/>
              {managing ? <>
              <QuietAction label={connected ? "Manage provider connection" : "Upload another statement"} disabled={disabled} onPress={openNext} />
              <QuietAction label="Choose another saved statement" disabled={disabled || !candidates.length} onPress={() => setChoosing(true)} />
              <QuietAction label="Edit action" disabled={disabled} onPress={() => setEditing(true)} />
              <QuietAction label={data.target.snoozedUntil ? "Show in follow-ups now" : "Snooze follow-up for 30 days"} disabled={disabled} onPress={() => { const date = new Date(); date.setDate(date.getDate() + 30); void save({ snoozedUntil: data.target?.snoozedUntil ? null : date.toISOString().slice(0, 10) }); }} />
              <QuietAction label="Stop tracking" disabled={disabled} onPress={() => Alert.alert("Stop tracking this change?", "Your action and statements stay saved. You can reopen it later.", [{ text: "Cancel", style: "cancel" }, { text: "Stop tracking", onPress: () => void save({ state: "abandoned" }) }])} />
              </> : null}
            </> : <QuietAction label="Reopen action" disabled={disabled} onPress={() => { setEditing(true); edit({ state: data.target?.state === "completed" ? "implemented" : "planned", evidenceBillId:null, snoozedUntil: null }); }} />}
          </View> : null}
          {editing ? <JourneyPanel><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Record your change</Text>
            <TextField label="What changed?" value={fields.title} maxLength={120} editable={!disabled} onChangeText={v => edit({ title: v })} />
            {!usage ? <TextField label="Agreed period total, including tax (CAD)" value={fields.expectedAmount} keyboardType="decimal-pad" editable={!disabled} onChangeText={v => edit({ expectedAmount: v })} /> : null}
            <DateField label="Effective date" value={fields.effectiveDate} disabled={disabled} onChange={v => edit({ effectiveDate: v })} />
            {usage ? text("Describe the change in your own words, such as a thermostat schedule or how you use an appliance. Use a baseline period that ended before the change.") : <>{text("Use a confirmed price for the same service and billing cycle, including tax. This is not a market-price estimate.")}<Confirmation label="I have a confirmed price from the provider" checked={confirmed} disabled={disabled} onPress={() => {setConfirmed(v=>!v);edit({});}}/></>}
            <QuietAction label={details ? "Hide optional details" : "Add cost or notes (optional)"} disabled={disabled} onPress={() => setDetails(v => !v)} />
            {details ? <><TextField label="One-time change cost (CAD)" value={fields.cost} keyboardType="decimal-pad" editable={!disabled} onChangeText={v => edit({ cost: v })} /><TextField label={usage ? "Change details or notes" : "Agreement reference or notes"} value={fields.notes} multiline maxLength={2000} editable={!disabled} onChangeText={v => edit({ notes: v })} /></> : null}
            {data.baselineChanged ? <Confirmation label="I reviewed the corrected baseline" checked={confirmBaseline} disabled={disabled} onPress={() => {setConfirmBaseline(v=>!v);edit({});}}/> : null}
            <Button label="Save action" loading={busy} disabled={disabled || (!usage && (!confirmed || !fields.expectedAmount)) || !fields.title.trim() || !fields.effectiveDate || (data.baselineChanged && !confirmBaseline)} onPress={() => void save()} />
            {data.target ? <QuietAction label="Cancel edits" disabled={disabled} onPress={() => { apply(data); }} /> : null}
          </JourneyPanel> : null}
          {saved ? <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.foreground }]}>{closed || data.target?.snoozedUntil ? "Saved. This action stays available from its baseline statement." : "Saved. Find this action in Bills → Insights → Your follow-ups."}</Text> : null}
        </> : null}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}


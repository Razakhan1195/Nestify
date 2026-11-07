import { useTheme } from "@/theme/useTheme";
import { ActionFeedback } from "@/components/ActionFeedback";
import { FormScrollView } from "@/components/FormScrollView";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { QuietAction } from "@/components/Brief";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import { billEnquiryDraft, billReview, isTelecomCategory, reviewStatuses, statusLabels, type BillReviewAction, type ReviewStatus } from "@/lib/bill-review";
import { editorialType, spacing, typography } from "@/theme/tokens";
type Payload = { readOnly?:boolean;canReviewEvidence?:boolean;source?:string;providerId?:string|null;outcomeKind?:"agreed_amount"|"usage_change"|null;category: string; id: string; title: string; version: string; baseline: string; changed: boolean; action: BillReviewAction | null; analysis: ReturnType<typeof billReview> };
export default function Review() {
 const { billId } = useLocalSearchParams<{ billId: string }>(), { session } = useAuth();
 return <ReviewContent key={(session?.user.id ?? "") + billId} id={billId} />;
}
function ReviewContent({ id }: { id: string }) {
  const { colors, premium } = useTheme();

 const router = useRouter(), navigation = useNavigation(), lock = useRef(false), dirtyRef = useRef(false), request = useRef(0);
 const [data, setData] = useState<Payload | null>(null), [draft, setDraft] = useState(""), [notes, setNotes] = useState(""), [status, setStatus] = useState<ReviewStatus>("planned");
 const [showStatuses, setShowStatuses] = useState(false), [showAction, setShowAction] = useState(false), [showFacts, setShowFacts] = useState(false);
 const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
 const endpoint = "/api/mobile/v1/bills/" + encodeURIComponent(id ?? "") + "/review";
 const apply = useCallback((result: Payload) => {
  setData(result); setDraft(result.action?.draft ?? ""); setNotes(result.action?.notes ?? ""); setStatus(result.action?.status ?? "planned");
  setDirty(false); dirtyRef.current = false; setError(null); setLoading(false);
 }, []);
 const load = useCallback(async () => {
  const version = ++request.current; setLoading(true);
  try { const result = await apiGet<Payload>(endpoint, { timeoutMs: 15000 }); if (request.current === version) apply(result); }
  catch (e) { if (request.current === version) { setError(e instanceof ApiError ? e.message : "Could not load your review. Check your connection and retry."); setLoading(false); } }
 }, [apply, endpoint]);
 useFocusEffect(useCallback(() => { if (!dirtyRef.current) void load(); return () => { request.current++; }; }, [load]));
 usePreventRemove(dirty || busy, ({ data: event }) => {
  if (busy) { Alert.alert("Saving your review", "Wait for this save to finish."); return; }
  Alert.alert("Leave without saving?", "Your last saved review will remain.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard edits", style: "destructive", onPress: () => navigation.dispatch(event.action) }]);
 });
 function edit() { setDirty(true); dirtyRef.current = true; setSaved(false); }
 async function save() {
  if (!data || lock.current) return; lock.current = true; setBusy(true); setError(null);
  try { apply(await apiPatch<Payload>(endpoint, { operation: "enquiry", version: data.version, baseline: data.baseline, draft, notes, status }, { timeoutMs: 20000 })); setSaved(true); }
  catch (e) { setError(e instanceof ApiError ? e.message : "The save could not be confirmed. Your edits remain here. Reload to check before retrying."); }
  finally { lock.current = false; setBusy(false); }
 }
 function reload() { if (dirty) Alert.alert("Load the saved review?", "This replaces unsaved edits with the last saved version.", [{ text: "Keep editing", style: "cancel" }, { text: "Reload", onPress: () => void load() }]); else void load(); }
 function prepare() { if (!data) return; if (!data.action && !draft) { setDraft(billEnquiryDraft(data.title, data.analysis.hasFinding)); edit(); } setShowAction(true); }
 const copy = (text: string) => <Text style={[typography.body, { color: colors.mutedForeground }]}>{text}</Text>;
 return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
  <ScreenNavigation title="Bill review" fallback={"/bill/" + id} />
  <View style={{ flex: 1 }} >
   <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, gap: 24, paddingBottom: 48 }}>
    {loading ? <ActivityIndicator accessibilityLabel="Loading bill review" color={colors.primary} /> : null}
    {error ? <View style={{ gap: 8, padding: 16, borderRadius: 16, backgroundColor: colors.criticalBg }}><Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text><QuietAction label="Reload saved review" disabled={busy} onPress={reload} /></View> : null}
    {data && !loading ? <>
     {data.readOnly?copy("This bill’s details changed. Your saved enquiry remains available to read; editing is unavailable for this statement."):null}
     <View style={{ gap: 14 }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>{data.title}</Text>
      <Text accessibilityRole="header" style={[editorialType, { fontSize: 32, lineHeight: 39, color: colors.foreground }]}>{data.analysis.hasFinding ? "Charges to check" : "Statement summary"}</Text>
      {copy(data.analysis.coverage)}
     </View>
     <View style={{ gap: 12, backgroundColor: colors.surfaceRaised, borderRadius: 22, padding: 20 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Feather accessible={false} name={data.analysis.hasFinding ? "search" : "file-text"} size={20} color={colors.primary} /><Text style={[typography.section, { color: colors.foreground, flex: 1 }]}>{data.analysis.headline}</Text></View>
      {data.analysis.checks.map((check, i) => <View key={i}>{copy(check)}</View>)}
      {data.analysis.hasFinding ? copy(data.analysis.next) : copy("You can still ask your provider to explain the charges or confirm your options. This check is not a verdict on whether your plan is good value.")}
      {data.analysis.facts.length ? <QuietAction label={showFacts ? "Hide statement facts" : "View statement facts"} onPress={() => setShowFacts(v => !v)} /> : null}
      {showFacts ? data.analysis.facts.map((fact, i) => <View key={i}>{copy(fact)}</View>) : null}
      <QuietAction label={data.canReviewEvidence===false?"View saved bill and original":"Review charges against the original"} disabled={busy} onPress={() => data.canReviewEvidence===false?router.push(("/bill/"+id) as never):router.push({ pathname: "/bill/statement-details", params: { billId: id } })} />
     </View>
     {!showAction ? <View style={{ gap: 12 }}>
      <Button label={data.action ? "Open saved enquiry" : "Draft a provider enquiry"} onPress={prepare} />
      {copy("An editable starting point. You choose whether to use it; nothing is sent from Rezlee.")}
     </View> : <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}><Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>Provider enquiry</Text>{copy("Make this sound like you. Check the details before sharing it through your provider’s secure support channel.")}</View>
      {data.changed ? <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.warningBg }}>{copy("This statement changed since you saved the enquiry. Review it again; the previous outcome does not establish what happened on the corrected bill.")}</View> : null}
      <TextField label="Your message" value={draft} multiline textAlignVertical="top" style={{ minHeight: 210, paddingVertical: 14 }} maxLength={6000} editable={!busy&&!data.readOnly} onChangeText={v => { setDraft(v); edit(); }} />
      <QuietAction label="Share or copy enquiry" disabled={busy || !draft.trim()} onPress={() => Alert.alert("Use this enquiry?", "Check the message and personal information. You choose where to share it. Sharing does not mark it as sent or save your edits.", [{ text: "Cancel", style: "cancel" }, { text: "Continue", onPress: () => void Share.share({ message: draft }).catch(() => setError("Could not open sharing. You can select and copy the message instead.")) }])} />
      <View style={{ gap: 12, padding: 20, borderRadius: 22, backgroundColor: premium.apricotSurface }}>
       <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>Enquiry status</Text>
       <QuietAction label={"Status: " + statusLabels[status]} disabled={busy||data.readOnly} onPress={() => setShowStatuses(v => !v)} />
       {showStatuses ? reviewStatuses.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: status === value, disabled: busy }} disabled={busy} onPress={() => { setStatus(value); setShowStatuses(false); edit(); }} style={{ minHeight: 46, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}><Feather name={status === value ? "check-circle" : "circle"} size={18} color={colors.primary} /><Text style={[typography.body, { color: colors.foreground, flex: 1 }]}>{statusLabels[value]}</Text></Pressable>) : null}
       <TextField label="What happened or what you’ll check next" value={notes} multiline textAlignVertical="top" style={{ minHeight: 100, paddingVertical: 12 }} maxLength={2000} editable={!busy&&!data.readOnly} onChangeText={v => { setNotes(v); edit(); }} />
       {copy(status === "awaiting_evidence" ? "Add the next relevant statement when it arrives. This account is not being automatically monitored." : "Keep the provider’s written response. Reporting a resolution does not establish savings; check the next applicable bill.")}
      </View>
      <Button label={busy ? "Saving…" : data.changed ? "Save after reviewing changed details" : "Save enquiry and next step"} disabled={busy || data.readOnly || !dirty || !draft.trim()} loading={busy} onPress={() => void save()} />

     </View>}
     <View style={{ gap: 4, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 }}>
      <Text style={[typography.section, { color: colors.foreground }]}>Related information</Text>
      {(data.source!=="deck"||isTelecomCategory(data.category))?<QuietAction label="Compare this account’s history" disabled={busy} onPress={() => data.source==="ezgb"&&data.providerId?router.push(("/utility/"+data.providerId) as never):data.source==="deck"?router.push({pathname:"/bill/telecom-insights",params:{billId:id}}):router.push({ pathname: "/bill/history-insights", params: { billId: id } })} />:null}
      {data.outcomeKind?<QuietAction label={data.outcomeKind==="usage_change"?"Track a household usage change":"Track an agreed price against the next bill"} disabled={busy} onPress={()=>router.push({pathname:"/bill/outcome",params:{billId:id}})}/>:null}
      {!data.readOnly&&isTelecomCategory(data.category) ? <QuietAction label="Compare written internet or mobile offers" disabled={busy} onPress={() => router.push({ pathname: "/bill/offer-comparison", params: { billId: id } })} /> : null}
     </View>
    </> : null}
   </FormScrollView>
   {saved ? <ActionFeedback message="Enquiry saved with this bill." actionLabel="View bill" onAction={() => router.replace(("/bill/" + id) as never)} onClose={() => setSaved(false)}/> : null}
  </View>
 </SafeAreaView>;
}

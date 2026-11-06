import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneySteps,JourneyDisclosure} from "@/components/JourneyUI";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {energyEvidenceError} from "@/lib/energy-evidence";
import { StatementIntakeDetails } from "@/components/StatementIntakeDetails";
import { emptyIntakeEvidence, extractedIntakeEvidence, intakeEvidencePayload, hasIntakeEvidence, type IntakeEvidence } from "@/lib/statement-intake-evidence";
import { evidenceError } from "@/lib/statement-evidence";
import {savedBillDestination} from "@/lib/collection-navigation";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import { settleStatementSave } from "@/lib/statement-save-completion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { statementDrafts } from "@/lib/statement-draft";
import { fetchOnboarding } from "@/lib/onboarding-data";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { QuietAction } from "@/components/Brief";
import { apiFormPost, apiGet, apiPatch, ApiError } from "@/lib/api";
import { fetchBillCapabilities, fetchBills, type ManualBillInput } from "@/lib/bills-data";
import { pendingBillUpload, rememberBillUpload, forgetBillUpload } from "@/lib/bill-upload-pending";
import { statementSuggestions, statementReviewHints, statementDuplicate, type StatementDuplicate } from "@/lib/statement-review";
import { newVaultSaveRequestId } from "@/lib/vault-save-intent";
import { RECORD_PICKER_TYPES, RECORD_FILE_TYPES, uploadMimeType, uploadValidationError } from "@/lib/upload-validation";
import { colors, layout, spacing, typography } from "@/theme/tokens";

type Original = { uri: string; name: string; type: string; size?: number };
type Saved = { ok: true; billId: string };
type Recovery = { fields: ManualBillInput & {supporting_details?: IntakeEvidence}; fileName: string; status: string; existingBillId: string | null; expectedVersion: string | null };
const endpoint = "/api/mobile/v1/bills/history/upload";
const empty: ManualBillInput = { record_kind: "historical", bill_title: "", category: "", provider_name: "", account_number: "", amount: "", due_date: "", issue_date: "", billing_period_start: "", billing_period_end: "", notes: "" };

export default function ImportStatementScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [draftHome, setDraftHome] = useState<{ id: string; name: string } | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const router = useRouter(), navigation = useNavigation();
  const { billId } = useLocalSearchParams<{ billId?: string }>();
  const [fields, setFields] = useState<ManualBillInput>(empty);
  const [energyEnabled,setEnergyEnabled]=useState(false);
  const [supporting, setSupporting] = useState<IntakeEvidence>(emptyIntakeEvidence);
  const [evidenceEnabled, setEvidenceEnabled] = useState(false);
  const [file, setFile] = useState<Original | null>(null);
  const [readerCapability, setReaderCapability] = useState<{ userId: string | undefined; enabled: boolean } | null>(null);
  const readerReady = Boolean(userId && readerCapability?.userId === userId && readerCapability.enabled);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [available, setAvailable] = useState(false), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"read" | "save" | "draft" | "prepare" | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null), [hints, setHints] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false), [readAttempted, setReadAttempted] = useState(false);
  const [exitToHistory, setExitToHistory] = useState(false);
  const [dirty, setDirty] = useState(false), [savedId, setSavedId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [restored, setRestored] = useState(false), [needsFile, setNeedsFile] = useState(false);
  const [duplicate, setDuplicate] = useState<StatementDuplicate | null>(null);
  const [attachment, setAttachment] = useState<{ existingBillId?: string; expectedVersion?: string }>({});
  const locked = Boolean(busy || requestId || draftBlocked);

  // The existing scan capability uses the same server AI gate for all scan kinds.
  // Fail closed on older/unreachable servers; manual entry remains available.
  useEffect(() => {
    let active = true;
    void apiGet<{ receiptExtraction?: boolean; statementExtraction?: boolean }>("/api/mobile/v1/ai/scan", { timeoutMs: 10000 })
      .then(result => { if (active) setReaderCapability({ userId, enabled: (result.statementExtraction ?? result.receiptExtraction) === true }); })
      .catch(() => { if (active) setReaderCapability({ userId, enabled: false }); });
    return () => { active = false; };
  }, [userId]);

  const initialize = useCallback(async () => {
    const state: { energyEnabled: boolean; evidenceEnabled: boolean; supporting: IntakeEvidence; available: boolean; pending: string | null; recovery: Recovery | null; fields: ManualBillInput | null; error: string | null; home: { id: string; name: string } | null; draftName: string | null; hasDraft: boolean; blocked: boolean } = { energyEnabled:false, evidenceEnabled: false, supporting: emptyIntakeEvidence(), home: null, draftName: null, hasDraft: false, blocked: false, available: false, pending: null, recovery: null, fields: null, error: null };
    try {
      const [capabilities, pending, setup] = await Promise.all([fetchBillCapabilities(), pendingBillUpload(), fetchOnboarding().catch(() => null)]);
      if (setup?.home && setup.accessRole !== "member") state.home = { id: setup.home.id, name: setup.home.nickname };
      state.evidenceEnabled = capabilities.statementIntakeEvidence === true;
      state.energyEnabled=capabilities.statementEnergyEvidence === true;
      state.available = capabilities.originalUpload === true; state.pending = pending;
      if (pending) {
        state.recovery = await apiGet<Recovery>(`${endpoint}?requestId=${pending}`, { timeoutMs: 15000 });
        const {supporting_details, ...core} = state.recovery.fields;
        state.fields = { ...empty, ...core };
        state.supporting = supporting_details ?? emptyIntakeEvidence();
      } else if (billId) {
        const payload = await fetchBills();
        const bill = !payload.needsOnboarding ? payload.bills.find(row => row.id === billId && row.source === "manual" && row.isHistoricalStatement) : null;
        if (!bill) throw new ApiError("That statement is unavailable. Return to History to choose it again.", 404);
        state.fields = { ...empty, bill_title: bill.name, provider_name: bill.providerName ?? "", category: bill.category, account_number: bill.accountNumber ?? "", amount: String(bill.amount ?? ""), due_date: bill.dueDate ?? "", issue_date: bill.issueDate ?? "", billing_period_start: bill.billingPeriodStart ?? "", billing_period_end: bill.billingPeriodEnd ?? "", notes: bill.notes ?? "" };
      } else if (userId) {
        const draft = await statementDrafts.read(userId);
        if (draft) {
          if (!state.home || draft.homeId !== state.home.id) {
            state.blocked = true;
            state.error = "We couldn’t match your draft to this home. Check your connection and reopen this screen, or discard the draft to start again.";
          } else {
            state.fields = { ...empty, ...draft.fields };
            state.supporting = draft.evidence ?? emptyIntakeEvidence();
            state.draftName = draft.fileName; state.hasDraft = true;
          }
        }
      }
    } catch (e) { state.blocked = !state.pending; state.error = e instanceof ApiError ? e.message : "Could not check unfinished statement saves on this device. Try again."; }
    return state;
  }, [billId, userId]);
  const applyInitial = useCallback((state: Awaited<ReturnType<typeof initialize>>) => {
    setSupporting(state.supporting); setEvidenceEnabled(state.evidenceEnabled); setEnergyEnabled(state.energyEnabled);
    setDraftHome(state.home); setDraftRestored(state.hasDraft); setDraftBlocked(state.blocked);
    if (state.hasDraft) { setPendingName(state.draftName); setDirty(true); setReviewed(false); }
    setAvailable(state.available); setRequestId(state.pending); setError(state.error);
    setRestored(Boolean(state.recovery));
    if (state.fields) setFields(state.fields);
    if (state.recovery) {
      setPendingName(state.recovery.fileName); setReviewed(true);
      setAttachment({ existingBillId: state.recovery.existingBillId ?? undefined, expectedVersion: state.recovery.expectedVersion ?? undefined });
    }
    setLoading(false);
  }, []);
  function retryInitialization() { setLoading(true); setError(null); void initialize().then(applyInitial); }
  useEffect(() => {
    let active = true;
    void initialize().then(state => { if (active) applyInitial(state); });
    return () => { active = false; };
  }, [initialize, applyInitial]);
  useEffect(() => { if (savedId) router.replace(savedBillDestination(savedId,true,saveConfirmed)); else if (exitToHistory) router.replace({pathname:"/(tabs)/bills",params:{section:"history"}}); }, [savedId, saveConfirmed, exitToHistory, router]);
  usePreventRemove((dirty || Boolean(busy) || Boolean(requestId)) && !savedId && !exitToHistory, ({ data }) => {
    if (busy) { Alert.alert("Please wait", "Let this step finish before leaving."); return; }
    Alert.alert(requestId ? "Leave this save?" : "Discard this entry?", requestId ? "You can return to Upload statement to check and finish this save. Keep the original file available in case it is needed again." : "The file and your unsaved details will not be kept.", [
      { text: "Stay here", style: "cancel" },
      ...(!requestId && !billId && draftHome && !draftBlocked ? [{ text: "Save draft and leave", onPress: () => void keepDraft() }] : []),
      { text: requestId ? "Leave" : "Discard", style: requestId ? "default" : "destructive", onPress: () => {
        if (requestId || billId) navigation.dispatch(data.action);
        else void discardDraft(() => navigation.dispatch(data.action));
      } },
    ]);
  });
  async function keepDraft() {
    if (!userId || !draftHome || billId || requestId || inFlight.current || draftBlocked) return;
    inFlight.current = true; setBusy("draft"); setError(null);
    try {
      await statementDrafts.write(userId, { version: 1, updatedAt: Date.now(), homeId: draftHome.id, fields, evidence: supporting, fileName: (file?.name ?? pendingName)?.slice(0, 250) ?? null });
      setDirty(false); setExitToHistory(true);
    } catch { setError("We couldn’t save this draft on your device. Your details are still here. Shorten unusually long fields or notes and try again."); }
    finally { inFlight.current = false; setBusy(null); }
  }
  async function discardDraft(after?: () => void) {
    if (!userId || inFlight.current) return;
    inFlight.current = true; setBusy("draft");
    try {
      await statementDrafts.clear(userId);
      setDraftRestored(false); setDraftBlocked(false); setPendingName(null);
      setError(null); setFields(empty); setSupporting(emptyIntakeEvidence()); setFile(null); setReviewed(false); setDirty(false);
      if (after) after();
    } catch { setError("Could not discard the saved draft. Try again."); }
    finally { inFlight.current = false; setBusy(null); }
  }
  function update(key: keyof ManualBillInput, value: string) {
    if (locked) return;
    setFields(current => ({ ...current, [key]: value })); setReviewed(false); setDirty(true); setDuplicate(null);
  }
  function selectFile(selected: Original) {
    const invalid = uploadValidationError(selected.size, selected.type, RECORD_FILE_TYPES);
    if (invalid) { setError(invalid); return; }
    const apply = () => {
      setFile(selected); setDirty(true); setError(null); setDuplicate(null);
      if (!requestId) { if(file || (draftRestored && selected.name!==pendingName)) setSupporting(emptyIntakeEvidence()); setReadAttempted(false); setReviewed(false); setHints([]); }
    };
    if ((file || draftRestored) && !requestId) Alert.alert("Use a different original?", "Check every field against the new file before saving. Previously entered details will stay here.", [{ text: "Cancel", style: "cancel" }, { text: "Use file", onPress: apply }]);
    else apply();
  }
  async function chooseFile() {
    if (inFlight.current || (requestId && !needsFile)) return;
    inFlight.current=true; setBusy("prepare"); setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: requestId ? RECORD_FILE_TYPES : RECORD_PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const original = { uri: asset.uri, name: asset.name, type: uploadMimeType(asset.name, asset.mimeType), size: asset.size };
      // Recovery must reuse the exact uploaded bytes, not encode a new photo.
      selectFile(requestId ? original : await prepareAttachment(original));
    } catch(e) { setError(e instanceof Error ? e.message : "Could not prepare that file. Choose it again."); } finally {inFlight.current=false;setBusy(null);}
  }
  async function takePhoto() {
    if (inFlight.current || requestId) return;
    inFlight.current=true; setBusy("prepare"); setError(null);
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) { Alert.alert("Camera access needed", "Allow camera access in Settings, or choose a saved file.", [{ text: "Choose file", onPress: () => void chooseFile() }, { text: "Settings", onPress: () => void Linking.openSettings() }, { text: "Cancel", style: "cancel" }]); return; }
      const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (!picked.canceled) { const asset = picked.assets[0]; selectFile(await prepareAttachment({ uri: asset.uri, name: asset.fileName ?? "statement.jpg", type: uploadMimeType(asset.fileName ?? "statement.jpg", asset.mimeType), size: asset.fileSize,width:asset.width,height:asset.height })); }
    } catch(e) { setError(e instanceof Error ? e.message : "Could not prepare that photo. Try again."); } finally {inFlight.current=false;setBusy(null);}
  }
  async function readFile() {
    if (!readerReady || !file || inFlight.current || requestId || readAttempted) return;
    inFlight.current = true; setBusy("read"); setReadAttempted(true); setError(null);
    try {
      const form = new FormData(); form.append("kind", "bill_history"); form.append("file", file as unknown as Blob);
      const result = await apiFormPost<{ data: Record<string, unknown> }>("/api/mobile/v1/ai/scan", form, { timeoutMs: 55000 });
      setFields(statementSuggestions(result.data, fields.account_number ?? "")); setReviewed(false); setDirty(true);
      setHints(statementReviewHints(result.data));
      setSupporting(evidenceEnabled && !billId ? extractedIntakeEvidence(result.data) : emptyIntakeEvidence());
    } catch (e) { setError(e instanceof ApiError ? `${e.message} You can enter the details below without reading the file again.` : "Reading could not be confirmed. Enter the details below; we won’t retry AI automatically."); }
    finally { inFlight.current = false; setBusy(null); }
  }
  function confirmRead() {
    if (fields.amount || fields.billing_period_start || fields.bill_title) Alert.alert("Read details from the file?", "Suggested details will replace the fields below. Your account nickname will stay. Review the suggestions before saving.", [{ text: "Cancel", style: "cancel" }, { text: "Read details", onPress: () => void readFile() }]);
    else void readFile();
  }
  async function finish(result: Saved, key: string) {
    await settleStatementSave(
      async () => { if (userId && !billId) await statementDrafts.clear(userId); },
      () => forgetBillUpload(key),
    );
    setSaveConfirmed(true);
    setSavedId(result.billId);
  }
  async function save(target = attachment) {
    if (draftBlocked || !file || inFlight.current || !reviewed || !available || (requestId && !restored)) return;
    if (!target.existingBillId && hasIntakeEvidence(supporting) && (!evidenceEnabled || evidenceError(supporting.fields))) { setError(!evidenceEnabled ? "We couldn’t confirm that statement details can be saved. Keep your draft and try again shortly." : "Check the supporting details before saving."); return; }
    if(!target.existingBillId&&supporting.energy&&energyEvidenceError(supporting.energy)){setError(energyEvidenceError(supporting.energy));return;}
    if(!target.existingBillId&&supporting.energy&&!energyEnabled){setError("Energy details cannot be saved right now. Your draft is kept; try again shortly.");return;}
    inFlight.current = true; setBusy("save"); setError(null);
    const key = requestId ?? newVaultSaveRequestId();
    try {
      await rememberBillUpload(key); setRequestId(key); setRestored(true); setPendingName(file.name); setAttachment(target);
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) if (value !== undefined) body.append(name, value);
      const details = !target.existingBillId ? intakeEvidencePayload(supporting) : undefined;
      if (details) body.append("supporting_details", JSON.stringify(details));
      body.append("requestId", key); body.append("reviewed", "true"); body.append("currency", "CAD");
      for (const [name, value] of Object.entries(target)) if (value) body.append(name, value);
      body.append("file", file as unknown as Blob);
      await finish(await apiFormPost<Saved>(endpoint, body, { timeoutMs: 45000 }), key);
    } catch (e) {
      const match = e instanceof ApiError ? statementDuplicate(e.details) : null;
      if (match) {
        try { await forgetBillUpload(key); setRequestId(null); } catch { /* Keep the recovery pointer rather than overwriting it. */ }
        setDuplicate(match);
      }
      if (!requestId && e instanceof ApiError && [400, 413].includes(e.status)) {
        // Validation occurs before any server receipt/upload. Keep the file and
        // unlock corrections; retries of an existing intent stay immutable.
        try { await forgetBillUpload(key); setRequestId(null); setRestored(false); setReviewed(false); } catch { /* Keep recovery pointer if local storage is unavailable. */ }
      }
      if (e instanceof ApiError && e.status === 428) setNeedsFile(true);
      setError(e instanceof ApiError ? e.message : "Could not confirm this save. Retry to check and finish it.");
    } finally { inFlight.current = false; setBusy(null); }
  }
  async function resume() {
    if (!requestId || inFlight.current) return;
    inFlight.current = true; setBusy("save"); setError(null);
    try { await finish(await apiPatch<Saved>(`${endpoint}?requestId=${requestId}`, undefined, { timeoutMs: 45000 }), requestId); }
    catch (e) {
      if (e instanceof ApiError && e.status === 428) setNeedsFile(true);
      setError(e instanceof ApiError ? e.message : "Could not check the save. Try again.");
    } finally { inFlight.current = false; setBusy(null); }
  }
  async function leaveForHistory(id?: string) {
    // Explicitly release this device pointer. Prepared uploads still expire via
    // the server's existing cleanup queue; uncertain completed bills are kept.
    if (requestId) { try { await forgetBillUpload(requestId); } catch { setError("Could not clear this device’s recovery pointer. Try again."); return; } }
    setDirty(false); setRequestId(null);
    if (id) {
      if (userId && !billId) { try { await statementDrafts.clear(userId); } catch { setError("Could not clear this device’s draft. Try again."); return; } }
      setSavedId(id);
    } else setExitToHistory(true);
  }
  const [extraDates,setExtraDates]=useState(false);
  const ready = Boolean((!supporting.energy||!energyEvidenceError(supporting.energy))&&!evidenceError(supporting.fields) && !draftBlocked && file && reviewed && fields.bill_title.trim() && fields.provider_name?.trim() && fields.account_number?.trim() && fields.category.trim() && fields.amount.trim() && fields.billing_period_start && fields.billing_period_end);
  return <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Upload statement" fallback="/(tabs)/bills"/>
    <View style={{ flex: 1 }} >
      <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: spacing.xl }}>
        {loading ? <ActivityIndicator accessibilityLabel="Checking unfinished saves" color={colors.primary} /> : null}
        {busy === "prepare" ? <Text accessibilityRole="text" style={{color:colors.foreground}}>Preparing your photo…</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[typography.body, { color: colors.criticalForeground }]}>{error}</Text> : null}
        {!loading && !available ? <View style={{ gap: 8 }}><Text style={[typography.body, { color: colors.mutedForeground }]}>Statement uploads aren’t available right now. You can still enter a past statement manually when that option is available.</Text><QuietAction label="Check again" onPress={retryInitialization} /></View> : null}
        {!loading && available ? <>
          {!dirty&&!requestId&&!billId?<QuietAction label="Upload several statements" onPress={()=>router.replace("/bill/batch")}/>:null}
<JourneyHeading title="Your statement, kept and understood." detail="Keep the original with your bill history. Review the period’s charges before saving."/><JourneySteps labels={["Choose original","Review details","Save"]} current={file||requestId?1:0}/>
          {draftHome ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Saving to {draftHome.name}</Text> : null}
          {draftRestored && !requestId ? <View style={{ gap: 8 }}>
            <Text style={[typography.section, { color: colors.foreground }]}>Continue your statement draft</Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>Your details are restored on this device. Choose the original again and check the fields before saving. This draft is not in your bill history.</Text>
          </View> : null}
          {draftBlocked ? <QuietAction label="Discard unmatched draft" disabled={Boolean(busy)} onPress={() => Alert.alert("Discard saved draft?", "This removes the unfinished details from this device, not any saved bills.", [{ text: "Keep draft", style: "cancel" }, { text: "Discard draft", style: "destructive", onPress: () => void discardDraft() }])} /> : null}
          {requestId ? <View style={{ gap: 8 }}><Text style={[typography.section, { color: colors.foreground }]}>Finish your previous save</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>{pendingName ?? "Your statement"} · Your reviewed details are locked while we confirm the save.</Text><Button label="Check and finish save" loading={busy === "save"} disabled={Boolean(busy)} onPress={() => void resume()} />{!restored ? <QuietAction label="Reload saved details" onPress={retryInitialization} /> : null}{needsFile ? <QuietAction label="Choose the same original again" onPress={() => void chooseFile()} /> : null}<QuietAction label="Review History instead" onPress={() => Alert.alert("Review History?", "Check whether this statement was saved before starting another upload. Unfinished staged files expire after 24 hours and are queued for cleanup.", [{ text: "Stay here", style: "cancel" }, { text: "Review History", onPress: () => void leaveForHistory() }])} /></View> : null}
          <View style={{ gap:12,padding:20,borderWidth:1,borderRadius:22,backgroundColor:colors.surface,borderColor:colors.border }}>
            <Text style={[typography.section, { color: colors.foreground }]}>{file?.name ?? pendingName ?? "Choose the original"}</Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>One PDF, JPG, PNG or WebP · up to 4 MB. The saved file is private and also appears in Vault.</Text>
            {!locked ? <><QuietAction label={file ? "Choose a different file" : "Choose file"} onPress={() => void chooseFile()} /><QuietAction label="Take a photo" onPress={() => void takePhoto()} /></> : null}
            {file && !locked ? <QuietAction label="Open selected file" onPress={() => void Linking.openURL(file.uri).catch(() => setError("This device couldn’t preview the file. Open it in Files to check the statement."))} /> : null}
            {file && !requestId && readerReady ? <><Text style={[typography.caption, { color: colors.mutedForeground }]}>Optional: send this file to Rezlee’s AI service to suggest the details. You can enter them yourself instead.</Text><Button label={readAttempted ? "Reading attempted · review below" : "Read details with Rezlee"} variant="secondary" disabled={Boolean(busy) || readAttempted} loading={busy === "read"} onPress={confirmRead} /></> : null}
          </View>
          {hints.length ? <View style={{ gap: 6 }}><Text style={[typography.section, { color: colors.foreground }]}>Check against the original</Text>{hints.map((hint, index) => <Text key={index} style={[typography.body, { color: colors.mutedForeground }]}>{hint}</Text>)}</View> : null}
          <View pointerEvents={locked ? "none" : "auto"} accessibilityElementsHidden={locked} style={{ gap: spacing.lg, opacity: locked ? 0.7 : 1 }}>
            <TextField editable={!locked} label="Statement name" value={fields.bill_title} onChangeText={v => update("bill_title", v)} />
            <TextField editable={!locked} label="Provider" value={fields.provider_name ?? ""} onChangeText={v => update("provider_name", v)} />
            <TextField editable={!locked} label="Category" placeholder="Electricity, gas, water, internet…" value={fields.category} onChangeText={v => update("category", v)} />
            <TextField editable={!locked} label="Account nickname" placeholder="Home electricity" value={fields.account_number ?? ""} onChangeText={v => update("account_number", v)} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Reuse the nickname for this account. No full account number needed.</Text>
            <DateField label="Period start" value={fields.billing_period_start ?? ""} onChange={v => update("billing_period_start", v)} />
            <DateField label="Period end" value={fields.billing_period_end ?? ""} onChange={v => update("billing_period_end", v)} />
            <TextField editable={!locked} label="Charges for this period (CAD)" keyboardType="numbers-and-punctuation" value={fields.amount} onChangeText={v => update("amount", v)} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Include this period’s tax. Exclude old balances and payments. Use a minus sign for a credit. Do not enter a converted foreign-currency amount.</Text>
            <JourneyDisclosure label="Issue date, due date and notes (optional)" open={extraDates} onToggle={()=>setExtraDates(v=>!v)} disabled={locked}>
            <DateField label="Issue date" optional value={fields.issue_date ?? ""} onChange={v => update("issue_date", v)} />
            <DateField label="Original due date" optional value={fields.due_date} onChange={v => update("due_date", v)} />
            <TextField editable={!locked} label="Notes (optional)" value={fields.notes ?? ""} onChangeText={v => update("notes", v)} multiline />
            </JourneyDisclosure>
          </View>
          {!billId ? <StatementIntakeDetails value={supporting} disabled={locked} onChange={value=>{setSupporting(value);setDirty(true);setReviewed(false);}} /> : null}
          {!requestId ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: reviewed, disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={() => setReviewed(value => !value)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}><Feather name={reviewed ? "check-square" : "square"} size={22} color={colors.primary} /><Text style={[typography.body, { color: colors.foreground, flex: 1 }]}>I checked these details and CAD currency against the original.</Text></Pressable> : null}
          {duplicate ? <View style={{ gap: 8 }}><Text style={[typography.body, { color: colors.mutedForeground }]}>This period is already saved. Attaching a missing original will keep its existing details.</Text><QuietAction label="Open saved statement" onPress={() => void leaveForHistory(duplicate.billId)} />{duplicate.canAttach && duplicate.version && !requestId ? <Button label="Attach original to saved statement" disabled={Boolean(busy) || !ready} onPress={() => void save({ existingBillId: duplicate.billId, expectedVersion: duplicate.version! })} /> : null}</View> : null}
          {!billId && !requestId && !draftBlocked && draftHome ? <View style={{ gap: 6 }}>
            <QuietAction label={busy === "draft" ? "Saving draft…" : "Save draft and leave"} disabled={Boolean(busy) || !dirty} onPress={() => void keepDraft()} />
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Drafts are private to this account on this device and can be resumed for 7 days. Keep your original file to finish later.</Text>
          </View> : null}
          {!duplicate && (!requestId || (needsFile && file && restored)) ? <Button label={requestId ? "Retry with original" : "Save statement and original"} disabled={!ready || Boolean(busy)} loading={busy === "save"} onPress={() => void save()} /> : null}
        </> : null}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

import { JourneyHeading, JourneyDisclosure } from "@/components/JourneyUI";
import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {EmailImportEntry,useEmailImport} from "@/components/EmailImportEntry";
import {prepareAttachment} from "@/lib/prepare-attachment";
import {savedBillDestination} from "@/lib/collection-navigation";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import { SCAN_FILE_TYPES, uploadMimeType, uploadValidationError } from "@/lib/upload-validation";
import { createBillRequest, fetchBillCapabilities, scanBillRequest, type ManualBillInput } from "@/lib/bills-data";
import { editorialType, layout, radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

type Mode = "choose" | "scan" | "manual";
type Fields = ManualBillInput;

const EMPTY: Fields = {
  record_kind: "current",
  billing_period_start: "",
  billing_period_end: "",
  bill_title: "",
  category: "",
  provider_name: "",
  amount: "",
  due_date: "",
  issue_date: "",
  frequency: "one_time",
  account_number: "",
  notes: "",
  payment_status: "unpaid",
};
const categories = ["Electricity", "Gas", "Water", "Internet", "Insurance", "Property tax"];
const frequencies = [
  { label: "One-time", value: "one_time" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Annual", value: "annual" },
];

function clean(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function mapScan(data: Record<string, unknown>): Fields {
  return {
    bill_title: clean(data.bill_title) || clean(data.provider),
    category: clean(data.category),
    provider_name: clean(data.provider),
    amount: clean(data.amount),
    due_date: clean(data.due_date),
    issue_date: clean(data.issue_date),
    frequency: clean(data.billing_cycle),
    account_number: clean(data.account_number),
    notes: clean(data.notes),
    payment_status: "unpaid",
  };
}
function ChoiceCard({
  icon,
  title,
  body,
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  badge?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      <View style={{ padding: 18, borderWidth: 1, borderRadius: 20, backgroundColor: colors.surfaceRaised, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View accessible={false} style={{ width: 42, height: 46, borderRadius: 14, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Feather name={icon} size={20} color={colors.primary} /></View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[typography.section, { color: colors.foreground }]}>{title}</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>{body}</Text>
          {badge ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>{badge}</Text> : null}
        </View><Feather accessible={false} name="chevron-right" size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}

export default function AddBillScreen() {
  const { colors } = useTheme();

  const router = useRouter();
  const emailImport=useEmailImport();
  const navigation = useNavigation();
  const { providerName: providerNameParam, category: categoryParam, recordKind, accountName } =
    useLocalSearchParams<{ providerName?: string; category?: string; recordKind?: string; accountName?: string }>();
  const fallbackProviderName =
    typeof providerNameParam === "string" ? providerNameParam : "";
  const fallbackCategory = typeof categoryParam === "string" ? categoryParam : "";
  const fallbackFields: Fields = {
    ...EMPTY,
    provider_name: fallbackProviderName,
    bill_title: fallbackProviderName ? `${fallbackProviderName} bill` : "",
    category: fallbackCategory,
    record_kind: recordKind === "historical" ? "historical" : "current",
    account_number: typeof accountName === "string" ? accountName : "",
  };
  const [moreWays, setMoreWays] = useState(false);
  const [mode, setMode] = useState<Mode>(recordKind === "historical" ? "manual" : "choose");
  const [fields, setFields] = useState<Fields>(fallbackFields);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scanInFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scanSource, setScanSource] = useState<string | null>(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const historical = fields.record_kind === "historical";
  const [historyAvailable, setHistoryAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (mode !== "manual") return;
    let active = true;
    fetchBillCapabilities().then(result => { if (active) setHistoryAvailable(result.manualHistory); }).catch(() => { if (active) setHistoryAvailable(false); });
    return () => { active = false; };
  }, [mode]);
  usePreventRemove((dirty || isSaving || isScanning) && !savedId, ({ data }) => {
    if (isSaving || isScanning) { Alert.alert("Please wait", "Let this step finish before leaving."); return; }
    Alert.alert("Discard this entry?", "Your unsaved details will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => {
    if (savedId) router.replace(savedBillDestination(savedId,historical));
  }, [savedId, historical, router]);

  function changeKind(kind: "current" | "historical") {
    if ((fields.record_kind ?? "current") === kind || isSaving || (kind === "historical" && historyAvailable !== true)) return;
    const apply = () => {
      setFields(current => ({ ...current, record_kind: kind, amount: "", payment_status: "unpaid" }));
      setDirty(true);
      setError(null);
    };
    if (fields.amount) Alert.alert("Check the amount again", "A past statement uses charges for that period, not the balance due. Re-enter the amount after switching.", [{ text: "Cancel", style: "cancel" }, { text: "Switch", onPress: apply }]);
    else apply();
  }
  function startScan() {
    const apply = () => { setMode("scan"); setFields(fallbackFields); setDirty(false); setScanSource(null); };
    if (dirty) Alert.alert("Replace this entry?", "Starting a scan clears the details you entered.", [{ text: "Keep editing", style: "cancel" }, { text: "Replace", style: "destructive", onPress: apply }]);
    else apply();
  }

  const canSave = useMemo(
    () => Boolean((!historical || historyAvailable === true) && fields.bill_title.trim() && fields.category.trim() && fields.amount.trim() && (historical ? fields.provider_name?.trim() && fields.account_number?.trim() && fields.billing_period_start && fields.billing_period_end : fields.due_date.trim())),
    [fields, historical, historyAvailable],
  );

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    if (saveInFlight.current) return;
    setFields((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  async function scanAsset(input: { uri: string; name: string; type: string; size?: number }) {
    if (scanInFlight.current) return;
    scanInFlight.current = true;
    setError(null);
    setIsScanning(true);
    try {
      input = await prepareAttachment(input);
      const invalid=uploadValidationError(input.size,input.type);
      if(invalid)throw new Error(invalid);
      const body=new FormData();body.append("kind","bill");
      body.append("file",{uri:input.uri,name:input.name,type:input.type} as unknown as Blob);
      const result = await scanBillRequest(body);
      setFields(mapScan(result.data));
      setDirty(true);
      setScanSource(input.name);
      setMode("manual");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "We couldn't read that bill. Try a clearer photo or add it manually.",
      );
    } finally {
      scanInFlight.current = false;
      setIsScanning(false);
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera access needed", "Allow camera access to photograph a bill.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await scanAsset({
        uri: asset.uri,
        name: asset.fileName ?? "bill-photo.jpg",
        type: uploadMimeType(asset.fileName ?? "bill-photo.jpg", asset.mimeType),
        size: asset.fileSize,
      });
    } catch { setError("Could not open the camera. Choose a saved file or enter the bill manually."); }
  }

  async function chooseFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SCAN_FILE_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await scanAsset({
        uri: asset.uri,
        name: asset.name || "bill-upload",
        type: uploadMimeType(asset.name, asset.mimeType),
        size: asset.size,
      });
    } catch { setError("Could not open that file. Choose it again or enter the bill manually."); }
  }

  async function save() {
    if (!canSave || saveInFlight.current) return;
    saveInFlight.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const result = await createBillRequest(fields);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSavedId(result.billId);
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : "Could not save this bill. Please try again.",
      );
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["left","right","bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenNavigation title="Add a bill" fallback="/(tabs)/bills" close={mode==="choose"} disabled={isSaving||isScanning} backLabel={mode==="choose"?"Close add bill":"Back to ways to add"} onBack={()=>mode==="choose"?safeBack(router,"/(tabs)/bills"):setMode("choose")}/>
      <View
        
        style={{ flex: 1 }}
      >
        <FormScrollView keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: layout.screenHorizontal,
            paddingTop: layout.screenTop,
            paddingBottom: spacing["4xl"],
            gap: spacing.xl,
          }}
        >
          {mode === "choose" ? (
            <>
              <JourneyHeading title="How would you like to add it?" />
              <View style={{ gap: spacing.md }}>
                <ChoiceCard icon="upload" title="Upload a statement" body="Choose a PDF or photo." onPress={() => router.push("/bill/import")} />
                {!fallbackProviderName ? <ChoiceCard icon="link-2" title="Connect a provider" body="Import bills from a supported account." onPress={() => router.push("/provider/connect")} /> : null}
                <ChoiceCard icon="edit-3" title={dirty ? "Resume your entry" : "Enter details"} body="Add the amount and dates yourself." onPress={() => {
                  if (!dirty) { setFields(fallbackFields); setScanSource(null); setShowMoreDetails(false); }
                  setMode("manual");
                }} />
              </View>
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>You’ll review the details before saving.</Text>
              <JourneyDisclosure label="More ways to add" open={moreWays} onToggle={() => setMoreWays(!moreWays)}>
                <ChoiceCard icon="camera" title="Track a bill’s due date" body="Scan the amount and due date for a payment reminder. To keep the original, upload a statement." onPress={startScan} />
                <EmailImportEntry destination={emailImport} />
                <ChoiceCard icon="camera" title="Scan a receipt" body="Keep a purchase receipt in Vault. Review its details and save the original." onPress={() => router.push({pathname:"/vault-record",params:{kind:"receipt"}})} />
              </JourneyDisclosure>
            </>
          ) : null}
          {mode === "scan" ? (
            <View style={{ gap: spacing.xl }}>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>Scan your bill</Text>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>Take a clear photo or choose a file. Photos are prepared automatically; PDFs can be up to 4 MB. Review the extracted details before saving.</Text>
              </View>

              <Surface tone="accent" style={{ gap: spacing.lg }}>
                <View style={{ width: 54, height: 54, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  {isScanning ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="star" size={23} color={colors.primaryForeground} />}
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>{isScanning ? "Reading your bill…" : "Rezlee fills the boring parts"}</Text>
                  <Text style={[typography.body, { color: colors.mutedForeground }]}>{isScanning ? "Extracting provider, amount and due date." : "You’ll review everything before anything is saved."}</Text>
                </View>
              </Surface>

              {!isScanning ? (
                <View style={{ gap: spacing.md }}>
                  <Button label="Take a photo" onPress={takePhoto} />
                  <Button label="Choose photo or PDF" variant="secondary" onPress={chooseFile} />
                  <Pressable onPress={() => { setShowMoreDetails(false); setMode("manual"); }} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>Enter it manually instead</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          {mode === "manual" ? (
            <View style={{ gap: spacing.xl }}>
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.heading, { color: colors.foreground }]}>{scanSource ? "Review bill details" : "Bill details"}</Text>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>{scanSource ? "Rezlee filled what it could. Check the details before saving." : "Add the essentials now. You can connect the provider later."}</Text>
              </View>

              {scanSource ? (
                <Surface tone="accent" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Feather name="check-circle" size={20} color={colors.successForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Read from {scanSource}</Text>
                    <Text style={[typography.meta, { color: colors.mutedForeground }]}>Nothing saves until you confirm below.</Text>
                  </View>
                </Surface>
              ) : null}

              <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {([{ value: "current", label: "Bill to track" }, { value: "historical", label: "Past statement" }] as const).map(option => {
                  const active = (fields.record_kind ?? "current") === option.value;
                  const disabled = isSaving || (option.value === "historical" && historyAvailable !== true);
                  return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} disabled={disabled} onPress={() => changeKind(option.value)} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.full, opacity: disabled ? 0.5 : 1, backgroundColor: active ? colors.primary : colors.secondary }}><Text style={[typography.meta, { color: active ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text></Pressable>;
                })}
              </View>
              {historyAvailable === false ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Past statements aren’t available right now. You can still add a bill to track. Leave and reopen this form to check again.</Text> : historyAvailable === null ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Checking ways to save…</Text> : null}
              {historical ? <Text style={[typography.body, { color: colors.mutedForeground }]}>Save the charges from an issued statement. This goes into History, with no payment reminder or assumption about what you owe.</Text> : null}
              <View style={{ gap: spacing.lg }}>
                <TextField label="Bill name" placeholder="Hydro bill" value={fields.bill_title} onChangeText={(v) => update("bill_title", v)} />
                <TextField label={historical ? "Provider" : "Provider (optional)"} placeholder="Toronto Hydro" value={fields.provider_name ?? ""} onChangeText={(v) => update("provider_name", v)} />
                <TextField label={historical ? "Charges for this period (CAD)" : "Amount (CAD)"} placeholder="126.40" keyboardType={historical ? "numbers-and-punctuation" : "decimal-pad"} value={fields.amount} onChangeText={(v) => update("amount", v)} />
                {historical ? <>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>Use this period’s charges including tax. Leave out previous balances and payments. Enter a minus sign for a credit.</Text>
                  <DateField label="Period start" value={fields.billing_period_start ?? ""} onChange={v => update("billing_period_start", v)} />
                  <DateField label="Period end" value={fields.billing_period_end ?? ""} onChange={v => update("billing_period_end", v)} />
                  <TextField label="Account nickname" placeholder="Home electricity" value={fields.account_number ?? ""} onChangeText={v => update("account_number", v)} />
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>Use the same nickname for each statement from this account. No full account number needed.</Text>
                </> : <DateField label="Due date" value={fields.due_date} onChange={(v) => update("due_date", v)} />}
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Category</Text>
                <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {categories.map((category) => {
                    const active = fields.category === category;
                    return (
                      <Pressable
                        key={category}
                        onPress={() => update("category", category)}
                        style={{
                          minHeight: 40,
                          justifyContent: "center",
                          paddingHorizontal: spacing.md,
                          borderRadius: radii.full,
                          backgroundColor: active ? colors.primary : colors.secondary,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primaryForeground : colors.secondaryForeground }}>{category}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <TextField label="Or type a category" placeholder="Rent, condo fee, other" value={fields.category} onChangeText={(v) => update("category", v)} />
              </View>

              {!historical ? <View style={{ gap: spacing.sm }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Frequency</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {frequencies.map((item) => {
                    const active = fields.frequency === item.value;
                    return (
                      <Pressable
                        key={item.value}
                        onPress={() => update("frequency", item.value)}
                        style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.full, backgroundColor: active ? colors.primary : colors.secondary }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primaryForeground : colors.secondaryForeground }}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMoreDetails((current) => !current)}
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.md,
                  paddingVertical: spacing.xs,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                    More details
                  </Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    Bill date, account reference and notes
                  </Text>
                </View>
                <Feather
                  name={showMoreDetails ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>

              {showMoreDetails ? (
                <Surface tone="subtle" style={{ gap: spacing.lg }}>
                  <DateField label="Bill date" value={fields.issue_date ?? ""} onChange={(v) => update("issue_date", v)} optional />
                  {historical ? <DateField label="Original due date" value={fields.due_date} onChange={v => update("due_date", v)} optional /> : <TextField label="Account or nickname (optional)" placeholder="Last 4 digits or unit" value={fields.account_number ?? ""} onChangeText={(v) => update("account_number", v)} />}
                  <TextField
                    label="Notes (optional)"
                    placeholder="Anything useful to remember"
                    multiline
                    textAlignVertical="top"
                    value={fields.notes ?? ""}
                    onChangeText={(v) => update("notes", v)}
                    style={{ minHeight: 96, paddingTop: 14 }}
                  />
                </Surface>
              ) : null}

              {error ? (
                <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
                  <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text>
                </Surface>
              ) : null}

              <Button label={historical ? "Save to history" : "Save bill"} loading={isSaving} disabled={!canSave || isSaving} onPress={save} />
              <Text style={[typography.caption, { color: colors.mutedForeground, textAlign: "center" }]}>
                {historical ? "You can edit this later. Add another period for the same account to see recorded changes." : "You can edit this later. Rezlee will still track the bill even without a live provider connection."}
              </Text>
            </View>
          ) : null}

          {mode !== "manual" && error ? (
            <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
              <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text>
            </Surface>
          ) : null}
        </FormScrollView>
      </View>
    </SafeAreaView>
  );
}



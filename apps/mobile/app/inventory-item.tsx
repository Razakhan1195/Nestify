import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel} from "@/components/JourneyUI";
import {useAuth} from "@/auth/AuthProvider";
import {randomUUID} from "expo-crypto";
import {inventoryCreateStore} from "@/lib/inventory-create";
import type {InventoryCreateIntent} from "@/lib/inventory-create-store";
import { prepareAttachment } from "@/lib/prepare-attachment";
import { applianceSuggestions } from "@/lib/capture-review";
import { safeBack } from "@/lib/navigation";
import { DateField } from "@/components/DateField";
import { BarcodeLookup, type ProductSuggestion } from "@/components/BarcodeLookup";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { apiGet, apiPost, apiFormPost, apiDelete, ApiError } from "@/lib/api";
import { PHOTO_TYPES, uploadMimeType, uploadValidationError } from "@/lib/upload-validation";
import { spacing, typography } from "@/theme/tokens";
const empty = { name: "", brand: "", model_number: "", serial_number: "", room_or_area: "", category: "", product_barcode: "", warranty_expires_on: "" };
type Fields = typeof empty;
export default function InventoryItemScreen() {
  const {session}=useAuth();
  const params=useLocalSearchParams<{id?:string}>();
  return <InventoryItemForm key={(session?.user.id??"signed-out")+":"+(params.id??"new")} />;
}
function InventoryItemForm() {
  const { colors } = useTheme();

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : undefined;
  const {session}=useAuth();
  const userId=session?.user.id;
  const activeUser=useRef(userId);
  useEffect(()=>{activeUser.current=userId;return()=>{activeUser.current=undefined;};},[userId]);
  const [pendingCreate,setPendingCreate]=useState<InventoryCreateIntent|null>(null);
  const [createHome,setCreateHome]=useState<string|null>(null);
  const [createChecked,setCreateChecked]=useState(false);
  const [legacyCreate,setLegacyCreate]=useState(false);
  const router = useRouter();
  const navigation = useNavigation();
  const [fields, setFields] = useState<Fields>(empty);
  const scanInFlight = useRef(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [labelReading,setLabelReading]=useState<"checking"|"available"|"unavailable">("checking");
  useEffect(()=>{let active=true;void apiGet<{receiptExtraction:boolean}>("/api/mobile/v1/ai/scan",{timeoutMs:10000,expectedUserId:userId}).then(r=>{if(active)setLabelReading(r.receiptExtraction?"available":"unavailable");}).catch(()=>{if(active)setLabelReading("unavailable");});return()=>{active=false;};},[userId]);
  const [showCapture, setShowCapture] = useState(!id);
  const saveInFlight = useRef(false);
  const [showDetails, setShowDetails] = useState(Boolean(id));
  const [showOptional, setShowOptional] = useState(Boolean(id));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<"scan" | "save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const locked=Boolean(busy)||Boolean(pendingCreate)||(!id&&!createChecked);
  const restoreCreate=useCallback(async()=>{
    if(id)return;
    const account=userId;
    try{
      const pending=await inventoryCreateStore.load(account??"");
      if(!account||activeUser.current!==account)return;
      setPendingCreate(pending);
      if(pending){setFields(pending.fields);setDirty(true);setShowDetails(true);setShowCapture(false);}
      try{
        const caps=await apiGet<{homeId:string;createRecovery:boolean}>("/api/mobile/v1/inventory/create");
        if(activeUser.current!==account)return;
        if(!caps.createRecovery)throw Error("Unavailable");
        setCreateHome(caps.homeId);
        if(pending&&pending.homeId!==caps.homeId)throw Error("Return to the home where you started this save.");
      }catch(e){
        if(e instanceof ApiError&&e.status===404&&!pending){setLegacyCreate(true);}
        else throw e;
      }
      setCreateChecked(true);setLoadFailed(false);setError(null);
      if(pending)setNotice("A previous save needs checking. Your details are kept here; no new item has been submitted.");
    }catch(e){if(activeUser.current===account){setLoadFailed(true);setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Could not restore your save.");}}
    finally{if(activeUser.current===account)setLoading(false);}
  },[id,userId]);
  // Restore external SecureStore/API state once per account-scoped form; updates follow the awaited read.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void restoreCreate();},[restoreCreate]);
  async function completeCreate(account:string,intent:InventoryCreateIntent,itemId:string){
    await inventoryCreateStore.forget(account,intent.requestId).catch(()=>{});
    if(activeUser.current===account){setPendingCreate(null);setSavedId(itemId);}
  }
  async function recoverCreate(action:"check"|"retry"|"cancel"){
    const intent=pendingCreate,account=userId;
    if(!intent||!account||busy||saveInFlight.current)return;
    saveInFlight.current=true;setBusy("save");setError(null);
    try{
      if(activeUser.current!==account)throw Error("Account changed. Reopen your save.");
      if(action==="retry"){
        const result=await apiPost<{itemId:string}>("/api/mobile/v1/inventory/create",{...intent,action:"create"});
        await completeCreate(account,intent,result.itemId);
      }else{
        const result=action==="check"
          ?await apiGet<{state:string;itemId:string|null}>("/api/mobile/v1/inventory/create?requestId="+intent.requestId)
          :await apiPost<{state:string;itemId:string|null}>("/api/mobile/v1/inventory/create",{requestId:intent.requestId,homeId:intent.homeId,action:"cancel"});
        if(result.state==="saved"&&result.itemId){await completeCreate(account,intent,result.itemId);}
        else if(result.state==="cancelled"||result.state==="deleted"){
          await inventoryCreateStore.forget(account,intent.requestId);
          if(activeUser.current===account){setPendingCreate(null);setNotice(result.state==="deleted"?"The previously saved item was deleted. Nothing was recreated. Your details are here if you deliberately want to add a new item.":"Save cancelled. Your details are kept here for editing.");}
        }else if(activeUser.current===account)setNotice("No completed save was found yet. Retry the same save, or cancel it before editing. A delayed request may still be finishing.");
      }
    }catch(e){if(activeUser.current===account)setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Could not check the save. Try again.");}
    finally{saveInFlight.current=false;if(activeUser.current===account)setBusy(null);}
  }
  usePreventRemove((dirty || Boolean(busy)) && !savedId && !deleted, ({ data }) => {
    if (busy) { Alert.alert("Please wait", busy === "delete" ? "Your item is being deleted." : busy === "save" ? "Your item is being saved." : "Your label is being read."); return; }
    if(pendingCreate){Alert.alert("Leave this save?","Your save reference is kept on this device. Return to Add home item to check it before adding another copy.",[{text:"Stay here",style:"cancel"},{text:"Leave",onPress:()=>navigation.dispatch(data.action)}]);return;}
    Alert.alert("Discard unsaved changes?", "Your changes have not been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const load = useCallback(async () => {
    if (!id) return;
    const account=userId;
    try {
      const result = await apiGet<{ item: Partial<Fields> }>("/api/mobile/v1/inventory?id=" + encodeURIComponent(id));
      if(activeUser.current!==account)return;
      setLoadFailed(false); setError(null);
      setFields(Object.fromEntries(Object.keys(empty).map((key) => [key, result.item[key as keyof Fields] ?? ""])) as Fields);
    } catch (e) { if(activeUser.current===account){setLoadFailed(true); setError(e instanceof ApiError ? e.message : "Could not load your item.");} }
    finally { if(activeUser.current===account)setLoading(false); }
  }, [id,userId]);
  useFocusEffect(useCallback(() => { if (!dirty) void load(); }, [load, dirty]));
  useEffect(() => {
    if (deleted) safeBack(router, "/(tabs)/vault");
    else if (savedId) router.replace({ pathname: "/recalls", params: { itemId: savedId, saved: "1" } });
  }, [savedId, deleted, router]);
  async function scan(camera: boolean) {
    if (scanInFlight.current||locked) return;
    scanInFlight.current = true;
    setBusy("scan"); setError(null); setNotice(null);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setError("Camera access is off. Choose a saved photo or enter details manually."); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const prepared = await prepareAttachment({ uri: asset.uri, name: asset.fileName ?? "product-label.jpg", type: uploadMimeType(asset.fileName ?? "product-label.jpg", asset.mimeType), size: asset.fileSize, width: asset.width, height: asset.height });
      const type = prepared.type;
      const invalid = uploadValidationError(prepared.size, type, PHOTO_TYPES);
      if (invalid) { setError(invalid); return; }
      const form = new FormData();
      form.append("kind", "appliance");
      form.append("file", { uri: prepared.uri, name: prepared.name, type } as unknown as Blob);
      const extracted = await apiFormPost<{ data: Record<string, unknown> }>("/api/mobile/v1/ai/scan", form, { timeoutMs: 55000 });
      const values = applianceSuggestions(extracted.data);
      setShowDetails(true);
      if (!Object.values(values).some(Boolean)) { setError("The label wasn’t readable. Try a closer photo of the model label, or add just an item name for now."); return; }
      const conflict = (["brand", "model_number", "serial_number"] as const).some(key => fields[key] && values[key] && fields[key].toLowerCase() !== values[key].toLowerCase());
      const apply = (replace: boolean) => {
        setFields(current => replace ? values : Object.fromEntries(Object.keys(empty).map(key => [key, current[key as keyof Fields] || values[key as keyof Fields]])) as Fields);
        setDirty(true); setShowCapture(false);
        setNotice("Read from your photo. Check the exact model and any dates before confirming. Nothing is saved yet.");
      };
      if (conflict) Alert.alert("This label has different details", "Keep your current details, or replace them with this label’s suggestions. Replacement clears any old details the new label does not provide.", [
        { text: "Keep current details", style: "cancel" },
        { text: "Use this label", onPress: () => apply(true) },
      ]);
      else apply(false);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not read that label. Try another photo or enter details manually."); }
    finally { scanInFlight.current = false; setBusy(null); }
  }
  function applyProduct(product: ProductSuggestion) {
    const apply = () => {
      setFields(current => ({ ...current, name: product.name, brand: product.brand, model_number: product.model_number, product_barcode: product.product_barcode }));
      setDirty(true); setBarcodeOpen(false); setShowDetails(true); setShowCapture(false);
      setNotice("Product details added from UPCitemdb. Confirm the brand and exact model before saving. Your serial number, room and other details were kept.");
    };
    if (["name", "brand", "model_number", "product_barcode"].some(key => fields[key as keyof Fields] && fields[key as keyof Fields] !== product[key as keyof ProductSuggestion])) {
      Alert.alert("Replace product details?", "The selected product differs from the name, brand, model or barcode you entered. Replace those details with this suggestion? Brand or model fields not supplied by the directory will be cleared so an old value is not attached to a different product.", [{text:"Keep editing",style:"cancel"},{text:"Use suggestion",onPress:apply}]);
    } else apply();
  }
  async function remove() {
    if (!id || busy) return;
    setBusy("delete"); setError(null);
    try {
      await apiDelete("/api/mobile/v1/inventory?id=" + encodeURIComponent(id));
      setDeleted(true); Alert.alert("Home item deleted", "The item and its saved warranty details have been removed. Separately saved records are kept.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not confirm deletion. Please try again."); }
    finally { setBusy(null); }
  }
  function confirmDelete() {
    if (busy) return;
    Alert.alert("Delete this home item?", "This removes the item and its warranty details. Separately saved receipts and records are kept. Unsaved changes will be discarded.", [
      { text: "Keep item", style: "cancel" },
      { text: "Delete item", style: "destructive", onPress: () => void remove() },
    ]);
  }
  async function save() {
    if (saveInFlight.current || locked || !fields.name.trim()) return;
    const account=userId;
    saveInFlight.current = true;
    setBusy("save"); setError(null);
    try {
      if(!id&&!legacyCreate){
        if(!account||!createHome)throw Error("Check your home before saving.");
        const intent={requestId:randomUUID(),homeId:createHome,fields:{...fields}};
        await inventoryCreateStore.remember(account,intent);
        if(activeUser.current!==account)throw Error("Account changed. Return to this account to check its save.");
        setPendingCreate(intent);
        const result=await apiPost<{itemId:string}>("/api/mobile/v1/inventory/create",{...intent,action:"create"});
        await completeCreate(account,intent,result.itemId);
      }else{
        const result = await apiPost<{ itemId: string }>("/api/mobile/v1/inventory", { ...fields, ...(id ? { id } : {}) });
        if(activeUser.current===account)setSavedId(result.itemId);
      }
    } catch (e) { if(activeUser.current===account)setError(e instanceof ApiError ? e.message : "Could not save. Your details are still here."); }
    finally { saveInFlight.current = false; if(activeUser.current===account)setBusy(null); }
  }
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title={id ? "Edit home item" : "Add home item"} fallback="/(tabs)/vault" />
    <View style={{ flex: 1 }} >
      <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.criticalForeground }}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : loadFailed ? <Button label="Try again" onPress={() => { setLoading(true); void (id?load():restoreCreate()); }} /> : <>
          {pendingCreate?<View style={{gap:12}}><Text style={[typography.body,{color:colors.mutedForeground}]}>Check the previous save before changing these details. Retrying uses the same request.</Text>
          <Button label="Check saved item" disabled={Boolean(busy)} onPress={()=>void recoverCreate("check")}/>
          <Button label="Retry same save" variant="secondary" disabled={Boolean(busy)} onPress={()=>void recoverCreate("retry")}/>
          <Button label="Cancel pending save" variant="secondary" disabled={Boolean(busy)} onPress={()=>Alert.alert("Cancel this save?","If it already finished, we will open the saved item instead. Otherwise cancellation prevents a delayed request from creating it. Your details stay here.",[{text:"Keep checking",style:"cancel"},{text:"Check and cancel",onPress:()=>void recoverCreate("cancel")}])}/>
          </View>:null}
          <JourneyHeading title={id?fields.name||"Your home item":"Give your home a memory."} detail={id?"Keep the model, coverage and useful details up to date.":"Save an appliance or belonging so its details are ready for repairs, recalls and future questions."}/>
          {showCapture ? <JourneyPanel>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>{labelReading==="available"?"Photograph the model label and check the suggested details before saving. You can also use a barcode or enter the details yourself.":labelReading==="checking"?"Checking label reading. You can use a product barcode or enter the details yourself.":"Automatic label reading is temporarily unavailable. Find the product by barcode or enter the brand and model from its label."}</Text>
          <Button label={busy === "scan" ? "Reading label…" : "Scan product label"} disabled={locked||labelReading!=="available"} onPress={() => Alert.alert("Scan a product label", "Your selected photo is uploaded for AI extraction. Review the results before saving.", [
            { text: "Take photo", onPress: () => void scan(true) },
            { text: "Choose photo", onPress: () => void scan(false) },
            { text: "Cancel", style: "cancel" },
          ])} />
          <Button label="Find product by barcode" variant="secondary" disabled={locked} onPress={() => setBarcodeOpen(true)} />
          {barcodeOpen ? <BarcodeLookup onApply={applyProduct} onClose={() => setBarcodeOpen(false)} /> : null}
          </JourneyPanel> : <Button label="Use another label or barcode" variant="secondary" disabled={locked} onPress={() => setShowCapture(true)} />}
          {notice ? <Text style={[typography.body, { color: colors.mutedForeground }]}>{notice}</Text> : null}
          {!showDetails ? <Button label="Enter details myself" variant="secondary" disabled={locked} onPress={() => { setShowDetails(true); setShowCapture(false); }} /> : null}
          {showDetails ? <JourneyPanel>
          <Text style={[typography.section, { color: colors.foreground }]}>{id ? "Your saved details" : "Check your item"}</Text>
          <View style={{ gap: spacing.md }}>
            {([["name", "Item name"], ["brand", "Brand"], ["model_number", "Model number"], ["serial_number", "Serial number (optional)"], ["room_or_area", "Room or area (optional)"], ["category", "Category (optional)"], ["product_barcode", "Product barcode (optional)"]] as const).filter(([key]) => showOptional || ["name", "brand", "model_number"].includes(key) || Boolean(fields[key])).map(([key, label]) =>
              <TextField key={key} label={label} value={fields[key]} editable={!locked} maxLength={200} autoCorrect={false}
                onChangeText={(value) => { setFields((current) => ({ ...current, [key]: value })); setDirty(true); }} />)}
          </View>
          {!showOptional ? <Button label="More details (optional)" variant="secondary" disabled={locked} onPress={() => setShowOptional(true)} /> : null}
          {showOptional || fields.warranty_expires_on ? <DateField label="Warranty expires (optional)" value={fields.warranty_expires_on} optional onChange={value => { if (!locked) { setFields(current => ({...current,warranty_expires_on:value})); setDirty(true); } }} /> : null}
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>You can save incomplete details. Recall matching needs a brand and a model or descriptive item name.</Text>
          <Button label={busy === "save" ? "Saving…" : id ? "Save and check recalls" : "Confirm and check recalls"} disabled={locked || !fields.name.trim()} onPress={() => void save()} />
          </JourneyPanel> : null}
          {id ? <Button label="Review a quote for this item" variant="secondary" disabled={Boolean(busy)||dirty} onPress={()=>router.push({pathname:"/quotes",params:{itemId:id}})}/> : null}
          {id ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy), busy: busy === "delete" }} disabled={locked} onPress={confirmDelete} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.criticalForeground }}>{busy === "delete" ? "Deleting…" : "Delete home item"}</Text></Pressable> : null}
        </>}
      </FormScrollView>
    </View>
  </SafeAreaView>;
}

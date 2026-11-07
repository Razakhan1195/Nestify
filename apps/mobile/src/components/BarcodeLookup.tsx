import { useTheme } from "@/theme/useTheme";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { requireOptionalNativeModule } from "expo";
import { useIsFocused } from "expo-router/react-navigation";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { apiPost, ApiError } from "@/lib/api";
import { spacing, typography } from "@/theme/tokens";
export type ProductSuggestion={name:string;brand:string;model_number:string;product_barcode:string};
export function BarcodeLookup({onApply,onClose}:{onApply:(product:ProductSuggestion)=>void;onClose:()=>void}) {
  const { colors } = useTheme();

 const {session}=useAuth(),userId=session?.user.id;
 const [barcode,setBarcode]=useState(""),[camera,setCamera]=useState<typeof import("expo-camera")|null>(null);
 const [scanning,setScanning]=useState(false),[opening,setOpening]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null),[scannerHint,setScannerHint]=useState<string|null>(null),[denied,setDenied]=useState(false);
 const [result,setResult]=useState<{source:string;suggestions:ProductSuggestion[]}|null>(null);
 const locked=useRef(false),alive=useRef(true),cameraRequest=useRef(0),cameraStarting=useRef(false);
 const focused=useIsFocused(),isFocused=useRef(focused);
 useEffect(()=>{isFocused.current=focused;},[focused]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const listener=AppState.addEventListener("change",state=>{if(state!=="active"){cameraRequest.current++;setScanning(false);}});return()=>listener.remove();},[]);
 useEffect(()=>{if(!focused)cameraRequest.current++;},[focused]);
 function closeScanner(){cameraRequest.current++;setScanning(false);}
 async function lookup(raw:string,fromCamera=false) {
  if(locked.current)return;
  const code=raw.replace(/[\s-]/g,"");
  if(!/^\d{12,13}$/.test(code)){
   if(fromCamera)setScannerHint("Use the product’s 12-digit UPC or 13-digit EAN. A model label or QR code is different.");
   else setError("Enter the 12 or 13 digits printed under the product barcode.");
   return;
  }
  Keyboard.dismiss();locked.current=true;setBusy(true);setError(null);setResult(null);closeScanner();setBarcode(code);
  try {
   const response=await apiPost<{source:string;suggestions:ProductSuggestion[]}>("/api/mobile/v1/products/lookup",{barcode:code},{timeoutMs:20000,expectedUserId:userId});
   if(alive.current)setResult(response);
  } catch(e){if(alive.current)setError(e instanceof ApiError?e.message:"Product lookup failed. You can enter the item details manually.");}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 async function openScanner(){
  if(cameraStarting.current||locked.current)return;
  cameraStarting.current=true;setOpening(true);setError(null);setDenied(false);setScannerHint(null);Keyboard.dismiss();
  const request=++cameraRequest.current;
  try {
   if(!requireOptionalNativeModule("ExpoCamera"))throw Error("native-camera-missing");
   const cameraModule=await import("expo-camera");
   const permission=await cameraModule.Camera.requestCameraPermissionsAsync();
   if(!alive.current||!isFocused.current)return;
   if(!permission.granted){setDenied(true);setError("Camera access is off. Allow access in Settings or enter the barcode below.");return;}
   // Permission UI can temporarily background the app; opening is still safe only on the same visible screen.
   if(request!==cameraRequest.current&&AppState.currentState!=="active")return;
   setCamera(cameraModule);setScanning(true);setResult(null);
  }catch(e){if(alive.current)setError(e instanceof Error&&e.message==="native-camera-missing"?"Camera scanning needs the updated Rezlee app. You can enter the barcode below.":"The camera could not open. Try again or enter the barcode below.");}
  finally{cameraStarting.current=false;if(alive.current)setOpening(false);}
 }
 const CameraView=camera?.CameraView;
 return <Surface style={{gap:spacing.md}}>
  <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
   <Text style={[typography.section,{color:colors.foreground}]}>Find a product</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Close barcode lookup" onPress={()=>{closeScanner();onClose();}} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary}}>Close</Text></Pressable>
  </View>
  <Text style={[typography.caption,{color:colors.mutedForeground}]}>Scan or enter the barcode printed on the product or packaging. It is sent to UPCitemdb to find product details; no camera image is uploaded.</Text>
  {error?<Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text>:null}
  {denied?<Button label="Open camera settings" variant="secondary" onPress={()=>void Linking.openSettings()}/>:null}
  <Button label={opening?"Opening camera…":"Scan barcode"} variant="secondary" disabled={busy||opening} onPress={()=>void openScanner()}/>
  <TextField label="Product barcode" value={barcode} onChangeText={value=>{setBarcode(value);setResult(null);setError(null);}} keyboardType="number-pad" autoCorrect={false} editable={!busy} maxLength={20}/>
  <Button label={busy?"Looking up product…":"Look up barcode"} disabled={busy||opening||!barcode.trim()} onPress={()=>void lookup(barcode)}/>
  {result&&!result.suggestions.length?<Text style={[typography.body,{color:colors.mutedForeground}]}>No match in the product directory. You can enter the brand and model from the label yourself.</Text>:null}
  {result?.suggestions.map((product,index)=><View key={index} style={{gap:spacing.sm,paddingVertical:spacing.md}}>
   <Text style={[typography.section,{color:colors.foreground}]}>{product.name}</Text>
   <Text style={[typography.body,{color:colors.mutedForeground}]}>{[product.brand,product.model_number].filter(Boolean).join(" · ")||"Brand and model were not provided"}</Text>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>Source: {result.source}. Check this matches your exact product. A barcode does not identify its serial number or recall status.</Text>
   <Button label="Use these details" onPress={()=>onApply(product)}/>
  </View>)}
  <Modal visible={scanning&&focused} animationType="slide" onRequestClose={closeScanner}>
   <SafeAreaView style={{flex:1,backgroundColor:colors.canvas}}>
    <View style={{padding:20,gap:12}}>
     <Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>Scan the product barcode</Text>
     <Text style={[typography.body,{color:colors.mutedForeground}]}>Point the camera at the bars and numbers. Hold steady—it scans automatically. No photo button needed.</Text>
    </View>
    <View style={{flex:1,marginHorizontal:20,borderRadius:20,overflow:"hidden",backgroundColor:"#18251f"}}>
     {CameraView&&scanning&&focused?<CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:["ean13","upc_a"]}}
      onBarcodeScanned={({data})=>{void lookup(data,true);}}
      onMountError={()=>{closeScanner();setError("The camera could not start. Try again or enter the barcode manually.");}}/>:null}
     <View pointerEvents="none" style={{position:"absolute",top:"35%",left:"8%",right:"8%",height:"28%",borderWidth:2,borderColor:"#FFFFFF",borderRadius:14}}/>
    </View>
    <View style={{padding:20,gap:12}}>
     <Text accessibilityLiveRegion="polite" style={[typography.caption,{color:colors.mutedForeground}]}>{scannerHint??"Keep the whole barcode in view, with enough light and no glare."}</Text>
     <Button label="Enter barcode instead" variant="secondary" onPress={closeScanner}/>
     <Button label="Cancel scanning" variant="secondary" onPress={closeScanner}/>
    </View>
   </SafeAreaView>
  </Modal>
 </Surface>;
}

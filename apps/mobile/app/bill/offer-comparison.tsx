import { useTheme } from "@/theme/useTheme";
import { FormScrollView } from "@/components/FormScrollView";
import {OfferReader} from "@/components/OfferReader";
import {mergeOfferReading,validOfferSources,type OfferReading} from "@/lib/offer-reading";
import {JourneyHeading,JourneyPanel,JourneyDisclosure} from "@/components/JourneyUI";
import {CollectionPages} from "@/components/CollectionPages";
import {useEffect,useState,useRef,useCallback} from "react";
import {useNavigation,useLocalSearchParams} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {useAuth} from "@/auth/AuthProvider";
import {apiGet,apiPatch,ApiError} from "@/lib/api";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {QuietAction} from "@/components/Brief";
import {offerDefaults,priceWrittenOffer,type WrittenOffer} from "@/lib/bill-review";
import { spacing, typography } from "@/theme/tokens";
export default function Offers(){const {billId}=useLocalSearchParams<{billId:string}>();const {session}=useAuth();return <OfferContent key={(session?.user.id??"")+billId} billId={billId}/>;}
function OfferContent({billId}:{billId:string}){
  const { colors } = useTheme();

 const nav=useNavigation(),lock=useRef(false);
 const [selected,setSelected]=useState<"first"|"second">("first"),[help,setHelp]=useState(false);
 const [version,setVersion]=useState<string|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 const [offers,setOffers]=useState<WrittenOffer[]>([{...offerDefaults},{...offerDefaults}]),[confirmed,setConfirmed]=useState(false),[dirty,setDirty]=useState(false);
 const [readOnly,setReadOnly]=useState(false);
 const [sources,setSources]=useState<Array<OfferReading|null>>([null,null]);
 const endpoint="/api/mobile/v1/bills/"+encodeURIComponent(billId??"")+"/review";
 type Saved={readOnly?:boolean;version:string;offers:WrittenOffer[]|null;offerSources?:Array<OfferReading|null>};
 const apply=useCallback((data:Saved)=>{setReadOnly(data.readOnly===true);setVersion(data.version);setSources(validOfferSources(data.offerSources)?data.offerSources:[null,null]);setOffers(data.offers??[{...offerDefaults},{...offerDefaults}]);setDirty(false);setConfirmed(false);setError(null);},[]);
 async function reload(){setLoading(true);try{apply(await apiGet<Saved>(endpoint,{timeoutMs:15000}));}catch(e){setError(e instanceof ApiError?e.message:"Could not load these offers. Try again.");}finally{setLoading(false);}}
 useEffect(()=>{let active=true;void apiGet<Saved>(endpoint,{timeoutMs:15000}).then(data=>{if(active)apply(data);},e=>{if(active)setError(e instanceof ApiError?e.message:"Could not load these offers.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[endpoint,apply]);
 async function save(){if(!version||readOnly||lock.current)return;lock.current=true;setBusy(true);setError(null);try{const data=await apiPatch<Saved>(endpoint,{operation:"offers",version,offers,offerSources:sources},{timeoutMs:20000});setVersion(data.version);setDirty(false);setSaved(true);}catch(e){setError(e instanceof ApiError?e.message:"Could not confirm this save. Your edits remain here.");}finally{lock.current=false;setBusy(false);}}

 usePreventRemove(dirty||busy,({data})=>{
 if(busy){Alert.alert("Saving offers","Wait for the save to finish.");return;}
 Alert.alert("Leave without saving?","Your last saved offer details will remain.",[{text:"Keep comparing",style:"cancel"},{text:"Discard edits",style:"destructive",onPress:()=>nav.dispatch(data.action)}]);
 });
 const labels:Record<keyof WrittenOffer,string>={months:"Compare over how many months (1–36)",monthly:"Promotional monthly price (CAD)",promoMonths:"Months at that price (0 if none)",afterPromo:"Monthly price afterward (CAD)",upfront:"Setup and required equipment fees (CAD)",exitFee:"Cost to leave the current plan (CAD)",credit:"Confirmed one-time credit (CAD)"};
 const prices=offers.map(priceWrittenOffer),ready=!readOnly&&confirmed&&prices.every(Boolean)&&prices[0]!.months===prices[1]!.months;
 const money=(c:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(c/100);
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
 <ScreenNavigation title="Compare written offers" fallback="/(tabs)/bills"/>
 <View style={{flex:1}} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg,paddingBottom:48}}>
 <JourneyHeading eyebrow="Before you switch" title="See the whole cost." detail="Compare two written internet or mobile offers, including the price after a promotion and the cost of changing plans."/>
 <JourneyDisclosure label="What to check before comparing" open={help} onToggle={()=>setHelp(v=>!v)}><Text style={[typography.body,{color:colors.mutedForeground}]}>Use offers you have received for equivalent services and the same tax basis. This calculator does not find available offers. Leave unknown fees blank; enter 0 only when confirmed. Prices beyond the comparison period are not included.</Text></JourneyDisclosure>
 {loading?<ActivityIndicator accessibilityLabel="Loading saved offers"/>:null}
 {error?<View><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><QuietAction label="Reload saved offers" disabled={busy} onPress={()=>{if(dirty)Alert.alert("Replace unsaved edits?","Reload the last saved offers?",[{text:"Keep editing",style:"cancel"},{text:"Reload",onPress:()=>void reload()}]);else void reload();}}/></View>:null}
 {version&&!loading?<>
 {readOnly?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>This statement’s details changed and no longer support this comparison. Your saved offer terms are kept here for reference. Review the current bill before starting another comparison.</Text>:null}
 <CollectionPages label="Written offers" options={[{value:"first",label:"Offer 1"},{value:"second",label:"Offer 2"}]} selected={selected} onSelect={setSelected} renderPage={page=>{const index=page==="first"?0:1,offer=offers[index];return <View style={{gap:16}}><OfferReader billId={billId} source={sources[index]} disabled={busy||readOnly} onBusy={setBusy} onRead={reading=>{setSources(rows=>rows.map((v,i)=>i===index?reading:v));setConfirmed(false);setDirty(true);setSaved(false);}} onApply={()=>{const source=sources[index];if(source)setOffers(rows=>rows.map((v,i)=>i===index?mergeOfferReading(v,source):v));setConfirmed(false);setDirty(true);setSaved(false);}}/><JourneyPanel><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Offer {index+1} · written terms</Text>{(Object.keys(labels) as (keyof WrittenOffer)[]).map(key=><TextField key={key} label={labels[key]} value={offer[key]} keyboardType="decimal-pad" editable={!busy&&!readOnly} maxLength={14} onChangeText={v=>{setOffers(rows=>rows.map((row,i)=>i===index?{...row,[key]:v}:row));setConfirmed(false);setDirty(true);setSaved(false);}}/>)}{index===0?<Button label="Continue to offer 2" variant="secondary" onPress={()=>setSelected("second")}/>:null}</JourneyPanel></View>;}}/>
 <Pressable accessibilityRole="checkbox" accessibilityLabel="Eligibility, services, fees and tax basis checked" accessibilityState={{checked:confirmed,disabled:busy||readOnly}} disabled={busy||readOnly} onPress={()=>setConfirmed(v=>!v)} style={{minHeight:52,padding:16,borderRadius:16,backgroundColor:colors.surfaceSubtle}}><Text style={[typography.body,{color:colors.primary}]}>{confirmed?"✓ ":"○ "}I checked eligibility, equivalent services, all fees and matching tax basis.</Text></Pressable>
 {ready?<JourneyPanel tone="soft"><Text style={[typography.section,{color:colors.foreground}]}>Cost over {prices[0]!.months} months</Text>{prices.map((price,i)=><Text selectable key={i} style={[typography.body,{color:colors.foreground}]}>Offer {i+1}: {money(price!.totalCents)} total; {money(price!.averageCents)} per month on average.</Text>)}<Text selectable style={[typography.body,{color:colors.mutedForeground}]}>Difference: {money(Math.abs(prices[0]!.totalCents-prices[1]!.totalCents))}. This is a comparison of your entered terms, not verified savings or a recommendation to switch. Check contract and cancellation conditions before accepting.</Text></JourneyPanel>:<Text style={[typography.body,{color:colors.mutedForeground}]}>Complete both offers for the same number of months and confirm the terms to compare. If a price can change during this period, request a written clarification first.</Text>}
 <Button label="Save offer details" loading={busy} disabled={busy||readOnly||!dirty} onPress={()=>void save()}/>
 {saved?<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.foreground}]}>Offers saved with this statement. Return here to continue.</Text>:null}
 </>:null}
 </FormScrollView></View></SafeAreaView>;
}


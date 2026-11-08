import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import {withReadTimeout} from "@/lib/read-timeout";
import * as SecureStore from "expo-secure-store";
import {ProWelcome} from "@/components/ProWelcome";
import {acknowledgeProWelcome} from "@/lib/membership";
import {Feather} from "@expo/vector-icons";
import {membershipPresentation} from "@/lib/membership-presentation";
import {useCallback,useEffect,useRef,useState} from "react";
import {Redirect,useFocusEffect,useRouter} from "expo-router";
import {ActivityIndicator,AppState,Linking,Platform,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import type {PurchasesPackage} from "react-native-purchases";
import {useAuth} from "@/auth/AuthProvider";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {getMembershipSnapshot,loadMembership,restoreMembership,type MembershipPayload} from "@/lib/membership";
import {availablePlans,buyPlan,restorePlans,managePlans} from "@/lib/store-purchases";
import {storePurchaseFailure,type StorePurchaseFailure} from "@/lib/store-purchase-error";
import { editorialType, typography } from "@/theme/tokens";
export default function MembershipScreen(){const {session,isLoading}=useAuth();if(isLoading)return <ActivityIndicator/>;if(!session)return <Redirect href="/(auth)/login"/>;return <MembershipContent key={session.user.id} userId={session.user.id}/>;}
function MembershipContent({userId}:{userId:string}){
  const { colors, premium } = useTheme();
  const styles = useThemeMemo(() => makeStyles(colors), [colors, premium]);

 const router=useRouter();
 const [welcoming,setWelcoming]=useState(false);
 function closeWelcome(){setWelcoming(false);void acknowledgeProWelcome(userId).then(value=>{setData(value);return SecureStore.setItemAsync("rezlee-pro-welcome-v2-"+userId,"seen");}).catch(()=>{});}
 const [data,setData]=useState<MembershipPayload|null>(()=>getMembershipSnapshot(userId)),[packages,setPackages]=useState<PurchasesPackage[]>([]),[error,setError]=useState(""),[purchaseError,setPurchaseError]=useState<StorePurchaseFailure|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [plansState,setPlansState]=useState<"idle"|"loading"|"ready"|"empty"|"error">("idle");
 const [selectedPlan,setSelectedPlan]=useState<"free"|"pro"|null>(null),[detailsOpen,setDetailsOpen]=useState(false);
 const version=useRef(0),lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const load=useCallback(async()=>{
 const v=++version.current;const active=()=>v===version.current&&mounted.current;
 setPackages([]);setPlansState("idle");setError("");
 let r:MembershipPayload;
 try{r=await withReadTimeout(loadMembership(userId,true));if(!active())return;setData(r);}
 catch{if(active())setError("We couldn’t refresh your membership. Try again before making a purchase.");return;}
 if(!r.purchasesAvailable||r.membership?.plan==="pro")return;
 setPlansState("loading");
 try{const p=await withReadTimeout(availablePlans(userId,r.storeProductIds??[]));if(active()){setPackages(p);setPlansState(p.length?"ready":"empty");}}
 catch{if(active())setPlansState("error");}
 },[userId]);
 useFocusEffect(useCallback(()=>{
  void load();
  let previousState=AppState.currentState;
  const subscription=AppState.addEventListener("change",nextState=>{
   const returning=nextState==="active"&&previousState!=="active";
   previousState=nextState;
   // External store screens do not blur this route. Refresh when the app returns;
   // an in-flight purchase or native management sheet performs its own refresh.
   if(returning&&!lock.current)void load();
  });
  return()=>{subscription.remove();version.current++;};
 },[load]));
 async function purchase(plan?:PurchasesPackage){
 if(lock.current)return;lock.current=true;setBusy(true);setError("");setPurchaseError(null);setNotice("");const v=version.current;
 try{
 if(plan){const current=await loadMembership(userId,true);if(!current.purchasesAvailable)throw Error("Purchases are unavailable.");if(current.membership?.plan==="pro"){setData(current);return;}await buyPlan(userId,plan,current.storeProductIds??[]);}else await restorePlans(userId);
 const r=await restoreMembership(userId);if(v===version.current){setData(r);if(r.membership?.plan==="pro"&&!r.membership.proWelcomeSeen)setWelcoming(true);setNotice(r.membership?.plan==="pro"?"Your Pro access is ready.":"The store hasn’t confirmed active Pro access yet. Try Restore purchases again; don’t buy a second time.");}
 }catch(e){if(v===version.current&&!(e&&typeof e==="object"&&"userCancelled" in e&&e.userCancelled))setPurchaseError(storePurchaseFailure(e));}
 finally{lock.current=false;if(mounted.current){setBusy(false);if(v!==version.current)void load();}}
 }
 const m=data?.membership, presentation=membershipPresentation(data);
 const confirmed=!!data&&(!data.enabled||!!m), selected=selectedPlan??m?.plan??"pro", showPro=selected==="pro";
 const current=confirmed&&selected===(m?.plan??"free"), ownsPro=confirmed&&m?.plan==="pro";
 const monthly=packages.find(p=>p.packageType==="MONTHLY"),annual=packages.find(p=>p.packageType==="ANNUAL");
 const priceLabel=(p:PurchasesPackage)=>`${p.product.priceString} ${p.product.currencyCode}`;
 const storePrice=monthly?`${priceLabel(monthly)} / month`:annual?`${priceLabel(annual)} / year`:"$7.99 CAD / month";
 const storeDetail=monthly&&annual?`Or ${priceLabel(annual)} / year. Your store confirms the total.`:monthly||annual?"Your store confirms the billing period and total.":"Canadian pricing: $80 CAD / year. Your store confirms your price.";
 const benefits=showPro?[
  "Everything in Rezlee",
  "Unlimited bill scans",
  "Supported provider imports",
  "50 AI requests each month",
  "Quote, compatibility & repair decisions",
  "Pro benefits for your household",
 ]:[
  "Saved bills & originals",
  "Home records & reminders",
  "Shared cleaning & household routines",
  "Assign jobs and take turns with up to 6 people",
  "Recurring tasks & completion tracking",
  "Basic bill insights",
  "3 bill scans each month",
  "3 AI requests each month",
 ];
 const openLink=(url:string)=>void Linking.openURL(url).catch(()=>setNotice("We couldn’t open that link. Please try again."));
 async function manageStore(){
  if(lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{await managePlans(userId);}
  catch{if(mounted.current)setNotice(Platform.OS==="ios"?"Open iPhone Settings, tap your name, then Subscriptions to manage your plan.":"Open Google Play, tap your profile, then Payments & subscriptions to manage your plan.");}
  finally{lock.current=false;if(mounted.current){setBusy(false);void load();}}
 }
 return <SafeAreaView edges={["left","right","bottom"]} style={styles.screen}>
  {m?<ProWelcome membership={m} visible={welcoming&&m.plan==="pro"} onClose={closeWelcome} onPostpone={()=>setWelcoming(false)}/>:null}
  <ScreenNavigation title="Your membership" fallback="/account"/>
  <ScrollView contentContainerStyle={styles.scroll}>
   <View style={styles.content}>
    <View style={styles.intro}>
     <Text accessibilityRole="header" style={styles.headline}>A little less to manage.</Text>
     <Text style={styles.subtitle}>More room for life at home.</Text>
    </View>
    <View accessibilityRole="tablist" style={styles.tabs}>
     {(["free","pro"] as const).map(plan=><Pressable key={plan} accessibilityRole="tab" accessibilityLabel={plan==="pro"?"Rezlee Pro":"Rezlee"} aria-selected={selected===plan} accessibilityState={{selected:selected===plan}} onPress={()=>setSelectedPlan(plan)} style={[styles.tab,selected===plan&&styles.selectedTab]}>
      <Text style={[styles.tabText,selected===plan&&styles.selectedTabText]}>{plan==="pro"?"Rezlee Pro":"Rezlee"}</Text>
     </Pressable>)}
    </View>
    <View style={styles.planCard}>
     <View style={styles.planHeader}>
      <Text accessibilityRole="header" style={styles.planName}>Rezlee{showPro?<Text style={styles.proWord}> Pro</Text>:null}</Text>
      {current?<View style={styles.badge}><Text style={styles.badgeText}>{presentation.lifetime?"FOUNDING MEMBER":m?.household?"SHARED WITH YOU":"CURRENT PLAN"}</Text></View>:null}
     </View>
     <View style={styles.priceBlock}>
      <Text style={styles.price}>{!showPro?"Free":presentation.lifetime?"Yours for life":ownsPro&&m?.household?"Included with your household":ownsPro?"More help at home.":storePrice}</Text>
      <Text style={styles.priceNote}>{!showPro?"Your everyday home base.":presentation.lifetime?presentation.detail:ownsPro&&m?.household?"Pro access is shared by your household.":ownsPro&&m?.source==="referral"?"A gift from a friend. No automatic renewal.":ownsPro?"Your Pro access is active.":storeDetail}</Text>
     </View>
     <View style={styles.benefits}>
      {benefits.map(benefit=><View key={benefit} style={styles.benefit}><Feather name="check" size={17} color={colors.primary}/><Text style={styles.benefitText}>{benefit}</Text></View>)}
     </View>
     <Text style={styles.smallPrint}>{showPro?"Supported providers only. File-size, refresh and service-capacity limits apply.":"Manual bill entry stays available after your monthly scans are used."}</Text>
     {!confirmed?<View style={styles.currentPlan}><Text style={styles.currentPlanText}>{error?"Membership couldn’t refresh":"Checking your membership…"}</Text></View>
      :current?<View accessibilityLiveRegion="polite" style={styles.currentPlan}><Feather name="check-circle" size={17} color={colors.primary}/><Text style={styles.currentPlanText}>{presentation.lifetime?"Your plan · no renewal":m?.household?"Your household plan":"Your current plan"}</Text></View>
      :ownsPro?<View style={styles.currentPlan}><Text style={styles.currentPlanText}>Included with your Pro membership</Text></View>
      :showPro?<View style={{gap:10}}>
       {!data?.purchasesAvailable?<Text style={styles.priceNote}>Purchases are not available yet. You can continue using Rezlee.</Text>
        :purchaseError?<Text style={styles.priceNote}>Follow the recovery step below before trying another purchase.</Text>
        :plansState==="loading"?<View accessibilityLiveRegion="polite" style={{gap:8}}><ActivityIndicator accessibilityLabel="Loading subscription plans"/><Text style={styles.priceNote}>Getting prices from your app store…</Text></View>
        :plansState==="ready"&&!error?packages.map(p=><Button key={p.identifier} disabled={busy} label={p.packageType==="ANNUAL"?"Choose yearly · "+priceLabel(p)+" / year":"Choose monthly · "+priceLabel(p)+" / month"} onPress={()=>void purchase(p)}/>)
        :<View style={{gap:10}}><Text accessibilityRole="alert" style={styles.priceNote}>{plansState==="empty"?"CAD plans aren’t available from your app store right now. Rezlee subscriptions require a Canadian store account.":"We couldn’t load subscription prices. Check your connection and try again."}</Text><Button label="Reload plans" disabled={busy} onPress={()=>void load()}/></View>}
      </View>:null}
     {current&&!showPro?<Button label="Explore Rezlee Pro" disabled={busy} onPress={()=>setSelectedPlan("pro")}/>:null}
     {ownsPro&&current&&m?.source==="store"&&!m?.household?<Button variant="secondary" label="Manage subscription" disabled={busy} onPress={()=>void manageStore()}/>:null}
     {showPro&&!ownsPro?<Text style={styles.smallPrint}>Subscriptions renew automatically unless cancelled. Your store confirms the billing period, total and taxes before purchase.</Text>:null}
    </View>
    {m?.plan==="pro"&&m.expiresAt&&!m.lifetime?<Text style={styles.smallPrint}>Current access through {new Date(m.expiresAt).toLocaleDateString()}. {m.household?"This access is shared by your household.":m.source==="store"?"Manage renewal in your app store.":"No automatic renewal."}</Text>:null}
    {error?<View style={{gap:10}}><Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{error}</Text><Button label="Try again" disabled={busy} onPress={()=>void load()}/></View>:null}
    {purchaseError?<View style={{gap:10}}><Text accessibilityRole="alert" style={{color:colors.criticalForeground}}>{purchaseError.message}</Text><Button label={purchaseError.kind==="account"?"Open settings":"Restore purchases"} disabled={busy} onPress={()=>purchaseError.kind==="account"?router.dismissTo("/settings"):void purchase()}/></View>:null}
    {!data&&!error?<ActivityIndicator accessibilityLabel="Checking your membership"/>:null}
    {busy?<ActivityIndicator accessibilityLabel="Waiting for purchase confirmation"/>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={styles.priceNote}>{notice}</Text>:null}
    <View style={styles.details}>
     <Pressable accessibilityRole="button" accessibilityLabel="Plan details & limits" aria-expanded={detailsOpen} accessibilityState={{expanded:detailsOpen}} onPress={()=>setDetailsOpen(!detailsOpen)} style={styles.detailToggle}><Text style={styles.linkText}>Plan details & limits</Text><Feather name={detailsOpen?"chevron-up":"chevron-down"} size={18} color={colors.mutedForeground}/></Pressable>
     {detailsOpen?<View style={styles.detailBody}>
      <Text style={styles.smallPrint}>Both plans include saved bills, originals, home records, basic bill insights and shared household routines. Set recurring jobs, assign them to family or roommates, take turns, and track completion—free with Rezlee. Manual entry stays available.</Text>
      <Text style={styles.smallPrint}>Rezlee includes 3 AI bill scans and 3 other AI requests each month. Pro has no monthly bill-count limit and includes 50 other AI requests each month. Allowances reset each calendar month. Failed bill-reading attempts are returned to your allowance.</Text>
      <Text style={styles.smallPrint}>Pro includes quote comparison, compatibility checks and repair-versus-replace help, within the AI allowance.</Text>
      <Text style={styles.smallPrint}>Provider availability varies. Connections retrieve up to six months of available history when you request an import. Gmail import is not available yet. Automatic scheduled provider retrieval and bill payments are not included at launch.</Text>
      <Text style={styles.smallPrint}>Your saved records stay accessible if Pro ends.</Text>
     </View>:null}
    </View>
    {presentation.lifetime?<Text style={styles.smallPrint}>Previously subscribed through a store? Cancel that subscription to prevent future renewals. Your lifetime Pro access stays with this account.</Text>:null}
    <View style={styles.controls}>
     {(data?.restoreAvailable??data?.purchasesAvailable)?<MembershipLink label="Restore purchases" disabled={busy} onPress={()=>void purchase()}/>:null}
     <MembershipLink label="Manage store subscriptions" disabled={busy} onPress={()=>void manageStore()}/>
     {!presentation.lifetime?<MembershipLink label="Claim my waitlist membership" disabled={busy} onPress={()=>router.push("/claim-membership")}/>:null}
     {ownsPro?<MembershipLink label="Read your Pro welcome" onPress={()=>setWelcoming(true)}/>:null}
     <MembershipLink label="Refresh membership" disabled={busy} onPress={()=>void load()}/>
    </View>
    <View style={styles.legal}><MembershipLink label="Privacy" onPress={()=>openLink("https://rezlee.com/privacy")}/><Text style={styles.smallPrint}>·</Text><MembershipLink label="Terms" onPress={()=>openLink("https://rezlee.com/terms")}/></View>
   </View>
  </ScrollView>
 </SafeAreaView>;
}
function MembershipLink({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){
  const { colors, premium } = useTheme();
  const styles = useThemeMemo(() => makeStyles(colors), [colors, premium]);

 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:44,justifyContent:"center",paddingHorizontal:8,opacity:disabled?0.5:pressed?0.65:1})}><Text style={styles.linkText}>{label}</Text></Pressable>;
}
const makeStyles = (colors: Colors) => (StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.background},
 scroll:{paddingHorizontal:20,paddingTop:12,paddingBottom:32},
 content:{width:"100%",maxWidth:480,alignSelf:"center",gap:18},
 intro:{alignItems:"center",gap:6,paddingVertical:8},
 headline:{...typography.heading,...editorialType,color:colors.foreground,textAlign:"center"},
 subtitle:{...typography.body,color:colors.mutedForeground,textAlign:"center"},
 tabs:{flexDirection:"row",padding:4,borderRadius:28,backgroundColor:colors.muted,gap:4},
 tab:{flex:1,minHeight:44,paddingHorizontal:10,paddingVertical:10,borderRadius:24,alignItems:"center",justifyContent:"center"},
 selectedTab:{backgroundColor:colors.primary},
 tabText:{...typography.body,fontWeight:"600",color:colors.mutedForeground,textAlign:"center"},
 selectedTabText:{color:colors.primaryForeground},
 planCard:{backgroundColor:colors.card,borderRadius:24,padding:22,gap:18},
 planHeader:{gap:8,alignItems:"flex-start"},
 planName:{...typography.display,...editorialType,color:colors.foreground},
 proWord:{...typography.display,...editorialType,fontStyle:"italic",color:colors.primary},
 badge:{backgroundColor:colors.surfaceSubtle,borderRadius:20,paddingVertical:5,paddingHorizontal:10},
 badgeText:{...typography.label,color:colors.primary},
 priceBlock:{gap:6},
 price:{...typography.title,color:colors.foreground},
 priceNote:{...typography.meta,color:colors.mutedForeground},
 benefits:{gap:12,borderTopWidth:1,borderTopColor:colors.border,paddingTop:18},
 benefit:{flexDirection:"row",alignItems:"flex-start",gap:10},
 benefitText:{...typography.body,color:colors.foreground,flex:1,marginTop:-3},
 smallPrint:{...typography.meta,color:colors.mutedForeground},
 currentPlan:{backgroundColor:colors.surfaceSubtle,borderRadius:12,paddingHorizontal:14,paddingVertical:13,minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
 currentPlanText:{...typography.body,fontWeight:"600",color:colors.primary,flexShrink:1,textAlign:"center"},
 details:{borderBottomWidth:1,borderBottomColor:colors.border},
 detailToggle:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,paddingVertical:10},
 detailBody:{gap:14,paddingBottom:18},
 controls:{alignItems:"center",gap:0},
 linkText:{...typography.meta,fontWeight:"500",color:colors.mutedForeground},
 legal:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"center",gap:8},
}));



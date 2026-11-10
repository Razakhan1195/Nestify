import { ProvincePicker } from "./ProvincePicker";
import { useAuth } from "@/auth/AuthProvider";
import { apiPatch } from "@/lib/api";
import { useTheme } from "@/theme/useTheme";
import { JourneyHeading } from "@/components/JourneyUI";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Button } from "./Button";
import { QuietAction } from "./Brief";
import { Surface } from "./ui/Surface";
import { fetchProviderConnections, type ProviderDirectoryEntry } from "@/lib/provider-data";
import { findDirectoryEntries, providerServiceFilters, providerFinderResults, type ProviderServiceFilter } from "@/lib/provider-directory";
import { spacing, typography } from "@/theme/tokens";
const provinces:Record<string,string>={ON:"Ontario",BC:"British Columbia",AB:"Alberta",SK:"Saskatchewan",MB:"Manitoba",QC:"Quebec",NB:"New Brunswick",NS:"Nova Scotia",PE:"Prince Edward Island",NL:"Newfoundland and Labrador",YT:"Yukon",NT:"Northwest Territories",NU:"Nunavut"};
export function ProviderFinder() {
  const { colors , mode: useThemeMode } = useTheme();

 const { session } = useAuth();
 const userId = session?.user.id;
 const identity = useRef(userId);
 useEffect(() => { identity.current = userId; }, [userId]);
 const alive = useRef(true);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 const [chooseProvince, setChooseProvince] = useState(false), [provinceInput, setProvinceInput] = useState("");
 const [savingProvince, setSavingProvince] = useState(false), [provinceError, setProvinceError] = useState("");
 const provinceLock = useRef(false);
 const router=useRouter(),[entries,setEntries]=useState<ProviderDirectoryEntry[]>([]),[province,setProvince]=useState<string|null>(null);
 const [query,setQuery]=useState(""),[service,setService]=useState<ProviderServiceFilter>("All");
 const [selected,setSelected]=useState<ProviderDirectoryEntry|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const [limit,setLimit]=useState(12),[browseAll,setBrowseAll]=useState(false),[help,setHelp]=useState(false),[moreTypes,setMoreTypes]=useState(false);
 useEffect(()=>{let active=true;fetchProviderConnections().then(payload=>{
  if(!active)return;if(payload.needsOnboarding){router.replace("/onboarding" as never);return;}
  if(!payload.directory)throw Error("Directory unavailable");setEntries(payload.directory);setProvince(payload.province??null);
 }).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[attempt,router,userId]);
 const allMatches=useMemo(()=>findDirectoryEntries(entries,query,service),[entries,query,service]);
 const matches=useMemo(()=>providerFinderResults(entries,query,service,browseAll),[entries,query,service,browseAll]);
 const availableCount=allMatches.filter(p=>p.method!=="coming_soon").length;
 function choose(entry:ProviderDirectoryEntry){
  Keyboard.dismiss();
  if(entry.method==="green_button")router.push({pathname:"/provider/ezgb",params:{utilityName:entry.greenButtonName??entry.name}});
  else if(entry.method==="deck"&&entry.registryProviderId)router.push({pathname:"/provider/deck",params:{registryProviderId:entry.registryProviderId}});
  else setSelected(entry);
 }
 async function saveProvince() {
  if (!provinceInput || !userId || provinceLock.current) return;
  const accountId = userId;
  provinceLock.current = true; setSavingProvince(true); setProvinceError("");
  try {
   await apiPatch("/api/mobile/v1/onboarding/province", { province: provinceInput }, { expectedUserId: accountId });
   if (!alive.current || identity.current !== accountId) return;
   setProvince(provinceInput); setChooseProvince(false); setLoading(true); setFailed(false); setQuery(""); setService("All"); setAttempt(v => v + 1);
  } catch { if (alive.current && identity.current === accountId) setProvinceError("Your province couldn’t be saved. Try again."); }
  finally { provinceLock.current = false; if (alive.current && identity.current === accountId) setSavingProvince(false); }
 }
 if (!loading && !failed && (!province || chooseProvince)) return <View style={{ gap: 28 }}>
  <JourneyHeading title="Choose your province" detail="We use this to show providers available in your area." />
  <ProvincePicker value={provinceInput} onChange={value => { setProvinceInput(value); setProvinceError(""); }} disabled={savingProvince} error={provinceError || undefined} />
  <Text style={[typography.meta, { color: colors.mutedForeground }]}>You can change this later.</Text>
  <Button label={savingProvince ? "Saving…" : "See providers"} disabled={!provinceInput || savingProvince} onPress={() => void saveProvince()} />
  {province ? <QuietAction label="Cancel" disabled={savingProvince} onPress={() => setChooseProvince(false)} /> : null}
 </View>;
 if(selected)return <Surface tone="raised" style={{gap:spacing.md}}>
  <Text accessibilityRole="header" style={[typography.title,{color:colors.foreground}]}>{selected.name}</Text>
  <Text style={[typography.meta,{color:colors.mutedForeground}]}>{selected.category} · Connection coming soon</Text>
  <Text style={[typography.body,{color:colors.mutedForeground}]}>{selected.note|| (selected.name==="Rogers"?"We’re still testing Rogers sign-in. You can upload a statement today.":"Sign-in is not available for this provider yet. Upload a statement to save the original and review your bill.")}</Text>
  <Button label="Upload a statement" onPress={()=>router.push("/bill/batch")}/>
  <QuietAction label="Back to providers" onPress={()=>setSelected(null)}/>
 </Surface>;
 return <View style={{gap:20}}>
  <JourneyHeading title="Who’s your bill from?" detail="Search the company on your bill—for example, your phone, internet or electricity provider. A connection can bring in available statements; uploading a bill is always an option."/>
  {province ? <QuietAction label={(provinces[province] ?? province) + " · Change province"} onPress={() => { setProvinceInput(provinces[province] ?? province); setChooseProvince(true); }} /> : null}
  <View style={{flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,paddingHorizontal:14,backgroundColor:colors.surfaceRaised}}>
   <Feather name="search" size={20} color={colors.mutedForeground}/>
   <TextInput keyboardAppearance={useThemeMode} selectionColor={colors.primary} accessibilityLabel="Search providers across Canada" value={query} onChangeText={value=>{setQuery(value);setLimit(12);}} placeholder="Company or municipality" placeholderTextColor={colors.mutedForeground} autoCorrect={false} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={[typography.body,{flex:1,minHeight:54,color:colors.foreground}]}/>
   {query?<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>{setQuery("");setLimit(12);}} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="x" size={18} color={colors.primary}/></Pressable>:null}
  </View>
  <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
   {providerServiceFilters.slice(0,moreTypes?undefined:4).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:service===value}} onPress={()=>{Keyboard.dismiss();setService(value);setLimit(12);}} style={{minHeight:44,justifyContent:"center",paddingHorizontal:14,borderRadius:22,backgroundColor:value===service?colors.primary:colors.surfaceRaised,borderWidth:1,borderColor:colors.border}}>
    <Text style={[typography.meta,{color:value===service?colors.primaryForeground:colors.foreground}]}>{value==="All"?"All bills":value==="Energy"?"Electricity & gas":value}</Text>
   </Pressable>)}
   <Pressable accessibilityRole="button" accessibilityState={{expanded:moreTypes}} onPress={()=>setMoreTypes(!moreTypes)} style={{minHeight:44,justifyContent:"center",paddingHorizontal:12}}><Text style={[typography.meta,{color:colors.primary}]}>{moreTypes?"Fewer types":"More types"}</Text></Pressable>
  </View>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:help}} onPress={()=>{Keyboard.dismiss();setHelp(!help);}} style={{flexDirection:"row",alignItems:"center",gap:10,minHeight:44}}>
   <Feather name="shield" size={17} color={colors.primary}/><Text style={[typography.meta,{flex:1,color:colors.primary}]}>How connections work</Text><Feather name={help?"chevron-up":"chevron-down"} size={17} color={colors.primary}/>
  </Pressable>
  {help?<Surface tone="subtle" style={{gap:12}}>
   <Text style={[typography.body,{color:colors.foreground,fontWeight:"600"}]}>Choose your provider. Rezlee chooses the route.</Text>
   <Text style={[typography.meta,{color:colors.mutedForeground}]}>Green Button is the recommended route for supported Ontario electricity and gas. You sign in with your utility and approve the data you want to share.</Text>
   <Text style={[typography.meta,{color:colors.mutedForeground}]}>Phone, internet and other supported accounts use Deck’s hosted sign-in to retrieve bills. Review the access details, sign in and complete any verification your provider requests.</Text>
   <Text style={[typography.meta,{color:colors.mutedForeground}]}>Water is a separate service, even when a company also bills electricity. If sign-in is coming soon, you can upload a statement today.</Text>
  </Surface>:null}
  {loading?<ActivityIndicator accessibilityLabel="Loading provider availability" color={colors.primary}/>:failed?<Surface style={{gap:12}}>
   <Text accessibilityRole="alert" style={[typography.body,{color:colors.foreground}]}>We couldn’t check connection availability. Your saved bills are safe.</Text><Button label="Try again" variant="secondary" onPress={()=>{setLoading(true);setFailed(false);setAttempt(v=>v+1);}}/>
  </Surface>:<View style={{gap:10}}>
   <Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{query.trim()?"Search results":browseAll?"All listed providers":province?"Available for "+(provinces[province]??province):"Available connections"}</Text>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>{query.trim()?matches.length+" matches · includes connections coming soon":browseAll?"Listings include services whose sign-in is not available yet.":availableCount+" connection options. Search to find any listed provider across Canada."}</Text>
   {matches.slice(0,limit).map((entry,index)=>{
    const unavailable=entry.method==="coming_soon",newSection=unavailable&&index>0&&matches[index-1].method!=="coming_soon";
    return <View key={entry.id}>
     {newSection?<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,paddingTop:18,paddingBottom:8}]}>Connections coming soon</Text>:null}
     <Pressable accessibilityRole="button" accessibilityLabel={entry.name+". "+entry.category+". "+(unavailable?"Connection coming soon":entry.method==="green_button"?"Connect through Green Button":"Connect through Deck")} onPress={()=>choose(entry)} style={({pressed})=>({padding:16,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,flexDirection:"row",alignItems:"center",gap:12,opacity:pressed?0.75:1})}>
      <View style={{width:38,height:38,borderRadius:12,backgroundColor:unavailable?colors.secondary:colors.successBg,alignItems:"center",justifyContent:"center"}}><Feather name={entry.category==="Water"?"droplet":entry.category==="Phone & internet"?"wifi":/Electricity|Gas/i.test(entry.category)?"zap":"home"} size={18} color={colors.primary}/></View>
      <View style={{flex:1,gap:5}}>
       <Text style={[typography.body,{fontWeight:"600",color:colors.foreground}]}>{entry.name}</Text>
       <Text style={[typography.caption,{color:colors.mutedForeground}]}>{entry.category}{entry.provinces.length&&entry.provinces.length<=3?" · "+entry.provinces.join(", "):""}</Text>
       <Text style={[typography.caption,{color:unavailable?colors.mutedForeground:colors.primary}]}>{unavailable?"Connection coming soon":entry.method==="green_button"?"Green Button · Recommended":"Secure sign-in with Deck"}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.primary}/>
     </Pressable>
    </View>;
   })}
   {!matches.length?<Surface tone="subtle" style={{gap:10}}>
    <Text style={[typography.body,{color:colors.foreground}]}>{query.trim()?"No matching provider yet. Try the name on your bill or another bill type.":"Automatic connections for this bill type are not available for your home yet."}</Text>
    <Text style={[typography.meta,{color:colors.mutedForeground}]}>You can still upload a bill and keep its original, dates and history together.</Text>
   </Surface>:null}
   {matches.length>limit?<QuietAction label="Show more providers" onPress={()=>setLimit(v=>v+20)}/>:null}
   {!query.trim()?<QuietAction label={browseAll?"Show available connections":"Browse all providers, including coming soon"} onPress={()=>{setBrowseAll(!browseAll);setLimit(12);}}/>:null}
  </View>}
  <Surface tone="subtle" style={{gap:10}}>
   <Text style={[typography.section,{color:colors.foreground}]}>Have the bill already?</Text><Text style={[typography.meta,{color:colors.mutedForeground}]}>A connection is optional. Start with a photo or PDF.</Text>
   <Button label="Upload a statement" variant="secondary" onPress={()=>router.push("/bill/batch")}/>
  </Surface>
 </View>;
}


import { vaultScreen } from "@/lib/screen-state";
import { useTabScrollTop } from "@/lib/use-tab-scroll-top";
import { CollectionIntro } from "@/components/CollectionIntro";
import {JourneyHeading,JourneyPanel,JourneyEntry} from "@/components/JourneyUI";
import {useEmailImport} from "@/components/EmailImportEntry";
import {vaultCollectionRows,type VaultCollectionView} from "@/lib/collection-navigation";
import {CollectionPages} from "@/components/CollectionPages";
import { RecallWatchSummary } from "@/components/RecallWatchSummary";
import { CollectionToolbar, CollectionLoading, CollectionAddSheet } from "@/components/CollectionUI";
import {receiptBatches} from "@/lib/receipt-batch";
import {useAuth} from "@/auth/AuthProvider";
import {vaultPending} from "@/lib/vault-pending";
import { Feather } from "@expo/vector-icons";
import { Redirect,useFocusEffect,useRouter } from "expo-router";
import { useCallback,useRef,useState,useSyncExternalStore } from "react";
import { Pressable,RefreshControl,ScrollView,Text,View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ReadNotice } from "@/components/Brief";
import { apiGet,ApiError } from "@/lib/api";
import { fetchVault,formatVaultDate } from "@/lib/vault-data";
import { colors,layout,spacing,typography,premium } from "@/theme/tokens";
type Filter=VaultCollectionView;
const filters=[{value:"documents",label:"Records"},{value:"items",label:"Home items"},{value:"warranties",label:"Warranties"}] as const;
const choices=[
 {kind:"receipt",icon:"camera",title:"Scan a receipt",detail:"Read a photo, review details and keep the original"},
 {kind:"record",icon:"file-text",title:"Record",detail:"Receipt, policy, manual or other document"},
 {kind:"item",icon:"box",title:"Home item",detail:"Appliance or belonging, with scan options"},
 {kind:"warranty",icon:"shield",title:"Warranty",detail:"Coverage dates and proof of purchase"},
] as const;
function VaultRow({icon,title,detail,tag,onPress}:{icon:keyof typeof Feather.glyphMap;title:string;detail:string;tag?:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>({flexDirection:"row",alignItems:"center",gap:14,paddingVertical:16,paddingHorizontal:16,opacity:pressed?0.6:1,borderBottomWidth:1,borderBottomColor:premium.line})}>
  <View style={{width:40,height:40,borderRadius:12,backgroundColor:colors.surfaceSubtle,alignItems:"center",justifyContent:"center"}}><Feather name={icon} size={19} color={colors.foreground}/></View>
  <View style={{flex:1,gap:4}}>
   <Text style={[typography.body,{fontWeight:"600",color:colors.foreground}]} numberOfLines={2}>{title}</Text>
   <Text style={[typography.caption,{color:colors.mutedForeground}]} numberOfLines={2}>{detail}</Text>
   {tag?<Text style={[typography.caption,{color:colors.warningForeground}]}>{tag}</Text>:null}
  </View><Feather name="chevron-right" size={17} color={colors.mutedForeground}/>
 </Pressable>;
}
export default function VaultScreen(){
 const router=useRouter();
 const scroll=useRef<ScrollView>(null);
 useTabScrollTop("vault",scroll);
 const {session}=useAuth(),userId=session?.user.id;
 const emailImport=useEmailImport();
 const [warrantyClaims,setWarrantyClaims]=useState(false);
 const [batchOwner,setBatchOwner]=useState<string|null>(null),[batchAvailable,setBatchAvailable]=useState<boolean|null>(null);
 useFocusEffect(useCallback(()=>{
  let active=true;setBatchOwner(null);setBatchAvailable(null);setWarrantyClaims(false);
  if(userId){
   void receiptBatches.read(userId).then(batch=>{if(active)setBatchOwner(batch?userId:null);}).catch(()=>{if(active)setBatchOwner(userId);});
   // A failed capability check is not a disabled feature. The batch screen
   // verifies availability again before allowing any upload or save.
   void apiGet<{receiptBatch?:boolean;warrantyClaims?:boolean}>("/api/mobile/v1/vault/records?capabilities=1",{timeoutMs:10000})
    .then(caps=>{if(active){setBatchAvailable(caps.receiptBatch===true);setWarrantyClaims(caps.warrantyClaims===true);}}).catch(()=>{});
  }
  return()=>{active=false;};
 },[userId]));
 const [pendingOwner,setPendingOwner]=useState<string|null>(null);
 useFocusEffect(useCallback(()=>{let active=true;if(userId)void vaultPending.read(userId).then(key=>{if(active)setPendingOwner(key?userId:null);}).catch(()=>{if(active)setPendingOwner(userId);});return()=>{active=false;};},[userId]));
 const payload=useSyncExternalStore(vaultScreen.subscribe,vaultScreen.getSnapshot);
 const [filter,setFilter]=useState<Filter>("documents");
 const loadVersion=useRef(0);
 const queries:Record<Filter,string>={documents:"",items:"",warranties:""};
 const [adding,setAdding]=useState(false),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState<string|null>(null);
 const load=useCallback(async(refresh=false)=>{
  const version=++loadVersion.current;
  setLoading(true);
  if(refresh)setRefreshing(true);
  try{await fetchVault(refresh);if(version===loadVersion.current)setError(null);}catch(e){if(version===loadVersion.current)setError(e instanceof ApiError?e.message:"Could not load Vault. Please try again.");}
  finally{if(version===loadVersion.current){setLoading(false);setRefreshing(false);}}
 },[]);
 useFocusEffect(useCallback(()=>{void load();return()=>{loadVersion.current++;setRefreshing(false);};},[load]));
 function add(kind:string){
  setAdding(false);
  if(kind==="quote")router.push("/quotes");
  else if(kind==="item")router.push("/inventory-item");
  else router.push({pathname:"/vault-record",params:{kind}});
 }
 if(loading&&!payload)return <SafeAreaView edges={["left", "right"]} style={{flex:1,backgroundColor:"transparent"}}><CollectionLoading title="Vault" description="Records, home items and warranties." label="Loading your records…"/></SafeAreaView>;
 if(payload?.needsOnboarding)return <Redirect href="/onboarding"/>;
 const data=payload&&!payload.needsOnboarding?payload:null;
 const hasEntries=Boolean(data?.documents.length||data?.items.length);
 return <SafeAreaView edges={["left", "right"]} style={{flex:1,backgroundColor:"transparent"}}>
  <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.primary}/>} contentContainerStyle={{paddingHorizontal:layout.screenHorizontal,paddingTop:layout.screenTop,paddingBottom:spacing["4xl"],gap:layout.sectionGap}}>
   <CollectionToolbar title="Vault" description="Records, home items and warranties." label="Add to Vault" onAdd={()=>setAdding(true)}/>
   {userId&&pendingOwner===userId?<VaultRow icon="upload-cloud" title="Finish record save" detail="Check and finish an earlier save before adding another copy." onPress={()=>router.push("/vault-save-resume")}/>:null}
   {userId&&batchOwner===userId?<VaultRow icon="layers" title="Continue receipt batch" detail="Review unfinished files and check saved receipts." onPress={()=>router.push("/receipt-batch")}/>:null}
   {error?<ReadNotice message={error} busy={loading} onRetry={()=>void load(true)}/>:null}
   {data&&hasEntries?<View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>{[{label:"records",count:data.summary.recordsCount},{label:"home items",count:data.summary.itemsCount}].map(stat=><View key={stat.label} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:12,backgroundColor:colors.surfaceSubtle}}><Text style={[typography.meta,{color:colors.primary}]}>{stat.count} {stat.count===1?(stat.label==="records"?"record":"home item"):stat.label}</Text></View>)}</View>:null}
   {data?.summary.expiringSoonCount?<Pressable accessibilityRole="button" onPress={()=>{setFilter("warranties");}} style={{flexDirection:"row",gap:10,alignItems:"center",minHeight:44}}><Feather name="clock" size={17} color={colors.warningForeground}/><Text style={[typography.meta,{color:colors.foreground,flex:1}]}>{data.summary.expiringSoonCount} coverage {data.summary.expiringSoonCount===1?"date":"dates"} coming up</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground}/></Pressable>:null}
   {data?<CollectionPages label="Vault views" options={filters} selected={filter} onSelect={setFilter} renderPage={page=>{
    const query=queries[page],needle=query.trim().toLowerCase();
    const {documents,items}=vaultCollectionRows(data.documents,data.items,page,query);
    const empty=!documents.length&&!items.length;
    const total=page==="documents"?data.summary.recordsCount:page==="items"?data.summary.itemsCount:data.summary.warrantyCount;
    return <View style={{gap:18}}>
     <CollectionIntro section={page==="documents"?"records":page==="items"?"home-items":"warranties"} spacious={total===0&&empty&&!error}
       actionLabel={page==="items"?"Add a home item":page==="warranties"?"Add a warranty":"Add a record"}
       onPress={()=>add(page==="items"?"item":page==="warranties"?"warranty":"record")}/>
     {hasEntries?<View style={{gap:4}}>
      <Pressable accessibilityRole="button" accessibilityLabel={page==="documents"?"Search all records":page==="items"?"Search all home items":"Search all warranties"} onPress={()=>router.push({pathname:"/vault-search",params:{view:page}})} style={{minHeight:48,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:colors.border,borderRadius:12,paddingHorizontal:14}}><Feather name="search" size={18} color={colors.mutedForeground}/><Text style={[typography.body,{color:colors.mutedForeground}]}>Search all {page==="documents"?"records":page==="items"?"home items":"warranties"}</Text></Pressable>
     </View>:null}
     {page==="warranties"?<Text style={[typography.meta,{color:colors.mutedForeground}]}>Warranty documents and saved item coverage, together. Recorded dates do not guarantee a claim is covered.</Text>:null}
     {page==="items"&&!needle&&data.items.length>0?<RecallWatchSummary itemCount={data.items.length}/>:null}
     {empty&&!error&&(total>0||needle)?<JourneyPanel tone="soft">
      <JourneyHeading title={total>0?"Find your older entries":"No matching entries"} detail={total>0?"Browse the full list to find saved entries beyond this recent overview.":"Try another name or clear your search."}/>
     </JourneyPanel>:null}
     {documents.length?<View style={{backgroundColor:colors.surface,borderRadius:20,overflow:"hidden"}}>{page==="warranties"?<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,padding:16,paddingBottom:0}]}>Warranty documents</Text>:null}{documents.map(d=><VaultRow key={d.id} icon={d.category==="Warranty"?"shield":"file-text"} title={d.title} detail={[d.sourceLabel, d.category === "Other" ? "Record" : d.category, d.hasFile?"Original attached":"Details saved"].filter(Boolean).join(" · ")} tag={d.expires_on?"Expires "+formatVaultDate(d.expires_on):undefined} onPress={()=>router.push({pathname:"/vault-record",params:{id:d.id}})}/>)}</View>:null}
     {items.length?<View style={{backgroundColor:colors.surface,borderRadius:20,overflow:"hidden"}}>{page==="warranties"?<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground,padding:16,paddingBottom:0}]}>Item coverage</Text>:null}{items.map(i=><VaultRow key={i.id} icon="box" title={i.name} detail={[i.brand,i.model_number,i.room_or_area].filter(Boolean).join(" · ")||i.category||"Home item"} tag={i.warranty_expires_on?(i.warrantyStatus==="expired"?"Coverage expired ":"Coverage until ")+formatVaultDate(i.warranty_expires_on):undefined} onPress={()=>router.push({pathname:"/inventory-item",params:{id:i.id}})}/>)}</View>:null}
     {total>0?<Button variant="secondary" label={page==="documents"?"Browse all records":page==="items"?"Browse all home items":"Browse all warranties"} onPress={()=>router.push({pathname:"/vault-search",params:{view:page}})}/>:null}
     {(page==="documents"?data.summary.recordsCount>data.documents.length:page==="items"?data.summary.itemsCount>data.items.length:data.summary.warrantyCount>documents.length+items.length)?<Text style={[typography.caption,{color:colors.mutedForeground}]}>This overview shows recent entries. Browse or search to find older ones.</Text>:null}
    </View>;
   }}/>:null}
   <View style={{gap:12}}><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>Put your records to work</Text>
    {warrantyClaims?<JourneyEntry icon="shield" title="Warranty assistance" detail="Check saved terms and prepare a request for the provider." onPress={()=>router.push("/warranty-claim")}/>:null}
    <JourneyEntry icon="file-text" title="Before I spend" detail="Review quotes, check compatibility and compare repair costs." onPress={()=>router.push("/quotes")}/>
    {emailImport?<JourneyEntry icon="mail" title="Import from email" detail="Review receipts, warranties and home bills before keeping them." onPress={()=>router.push(emailImport)}/>:null}
   </View>
  </ScrollView>
  <CollectionAddSheet title="Add to Vault" visible={adding} onClose={()=>setAdding(false)} choices={[...(emailImport?[{key:"email",title:"Import from email",detail:"Review receipts, warranties and home bills.",icon:"mail" as const,onPress:()=>router.push(emailImport)}]:[]),...choices.map(c=>({key:c.kind,title:c.title,detail:c.detail,icon:c.icon,onPress:()=>add(c.kind)})),...(batchAvailable!==false?[{key:"receipts",title:"Several receipts",detail:"Choose up to five files to review.",icon:"layers" as const,onPress:()=>router.push("/receipt-batch")}]:[])]}/>
 </SafeAreaView>;
}



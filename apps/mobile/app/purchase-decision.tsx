import { FormScrollView } from "@/components/FormScrollView";
import {JourneyHeading,JourneyPanel,JourneyEntry,JourneyDisclosure} from "@/components/JourneyUI";
import {useCallback,useEffect,useRef,useState} from "react";
import {useFocusEffect,useLocalSearchParams,useNavigation,useRouter} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Pressable, Text, View, type ScrollView } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {randomUUID} from "expo-crypto";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {Surface} from "@/components/ui/Surface";
import {apiGet,ApiError} from "@/lib/api";
import {pendingPurchase,clearPendingPurchase,savePurchase,type PurchaseIntent} from "@/lib/purchase-data";
import {emptyPurchase,purchaseKinds,compatibilitySummary,replacementComparison,purchaseMoney,type PurchaseKind,type PurchaseDraft,type PurchaseIndex,type PurchaseSource,type PurchaseRow} from "@/lib/purchase-decision";
import {QuoteComparison} from "@/components/QuoteComparison";
import {colors,spacing,typography} from "@/theme/tokens";
const Copy=({children}:{children:React.ReactNode})=><Text style={[typography.body,{color:colors.mutedForeground}]}>{children}</Text>;
const Heading=({children}:{children:React.ReactNode})=><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{children}</Text>;
function Check({label,value,onChange,disabled}:{label:string;value:boolean;onChange:()=>void;disabled:boolean}){return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:value,disabled}} onPress={onChange} disabled={disabled} style={{minHeight:48,padding:14,borderRadius:14,borderWidth:1,borderColor:value?colors.primary:colors.border,backgroundColor:value?colors.surfaceSubtle:colors.surface,flexDirection:"row",gap:10,opacity:disabled?0.5:1}}><Text accessible={false} style={{color:colors.primary}}>{value?"✓":"○"}</Text><Text style={[typography.body,{color:colors.foreground,flex:1}]}>{label}</Text></Pressable>;}
const decisionIntros:Record<PurchaseKind,{title:string;detail:string;icon:"layers"|"check-circle"|"tool"}>={
 compare:{title:"A clearer choice between quotes.",detail:"Two estimates for a repair or home project? Check parts, labour, exclusions and warranty, then keep the questions you want answered.",icon:"layers"},
 compatibility:{title:"Check the fit before you buy.",detail:"Match exact models and requirements against the references you have.",icon:"check-circle"},
 replace:{title:"Repair it, or start fresh?",detail:"Put the complete costs, condition and coverage beside each other.",icon:"tool"},
};
export default function PurchaseDecision(){
 const params=useLocalSearchParams<{id?:string;kind?:string}>(),router=useRouter(),navigation=useNavigation();
 const routeId=typeof params.id==="string"?params.id:null;
 const kind=typeof params.kind==="string"&&params.kind in purchaseKinds?params.kind as PurchaseKind:null;
 const editing=!!routeId||!!kind;
 const [id]=useState(()=>routeId??randomUUID());
 const [data,setData]=useState<PurchaseIndex|null>(null),[row,setRow]=useState<PurchaseRow|null>(null),[draft,setDraft]=useState<PurchaseDraft>(()=>emptyPurchase(kind??"compare"));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[pending,setPending]=useState<PurchaseIntent|null>(null);
 const scrollRef=useRef<ScrollView>(null);
 const dirtyRef=useRef(false),lock=useRef(false),epoch=useRef(0);
 useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
 const load=useCallback(async()=>{
  if(lock.current)return;
  const n=++epoch.current;
  try{
   const retry=await pendingPurchase();
   const next=await apiGet<PurchaseIndex>("/api/mobile/v1/purchase-decisions"+(routeId?"?id="+routeId:""),{timeoutMs:15000}).catch(async e=>{
    if(e instanceof ApiError&&e.status===404&&retry?.id===routeId)return apiGet<PurchaseIndex>("/api/mobile/v1/purchase-decisions",{timeoutMs:15000});
    throw e;
   });
   if(n!==epoch.current)return;
   setData(next);setPending(retry);
   const saved=next.decisions.find(d=>d.id===id)??null;
   if(saved){setRow(saved);setDraft(saved.payload);setDirty(false);}else if(retry?.id===id){setDraft(retry.payload);setRow(null);setDirty(false);}
   if(retry&&saved?.last_request_id===retry.requestId){await clearPendingPurchase();if(n!==epoch.current)return;setPending(null);setNotice("Saved decision confirmed.");}
   setError(null);
  }catch(e){if(n===epoch.current)setError(e instanceof Error?e.message:"Could not load your decisions.");}
  finally{if(n===epoch.current)setLoading(false);}
 },[routeId,id]);
 useFocusEffect(useCallback(()=>{if(!dirtyRef.current)void load();return()=>{epoch.current++;};},[load]));
 usePreventRemove(dirty||busy,({data:nav})=>{
  if(busy)return;
  Alert.alert("Leave these unsaved changes?","Your last saved decision and originals are kept.",[{text:"Keep editing",style:"cancel"},{text:"Leave",style:"destructive",onPress:()=>navigation.dispatch(nav.action)}]);
 });
 const change=(patch:Partial<PurchaseDraft>)=>{setDraft(d=>({...d,...patch}));setDirty(true);setNotice(null);};
 const disabled=busy||!!pending;
 const [followUp,setFollowUp]=useState(false);
 async function submit(intent:PurchaseIntent){
  if(lock.current)return;lock.current=true;epoch.current++;setBusy(true);setError(null);
  try{const saved=await savePurchase(intent);setRow(saved);setDraft(saved.payload);setDirty(false);setPending(null);setNotice("Decision saved privately. No purchase, booking or message has been made.");return true;}
  catch(e){setPending(await pendingPurchase().catch(()=>intent));if(e instanceof ApiError&&[400,403,404,409].includes(e.status))setPending(null);setError(e instanceof Error?e.message:"Could not confirm this save.");return false;}
  finally{lock.current=false;setBusy(false);}
 }
 function reload(){
  if(dirty)Alert.alert("Reload the saved decision?","Unsaved changes will be discarded. Your originals remain in Vault.",[{text:"Keep editing",style:"cancel"},{text:"Reload",onPress:()=>{setDirty(false);if(!row)setDraft(emptyPurchase(kind??draft.kind));void load();}}]);
  else void load();
 }
 function selectSource(s:PurchaseSource){
  const next={documentId:s.documentId,sourceVersion:s.sourceVersion,reviewRevision:s.reviewRevision,total:"",allIn:false,scopeConfirmed:false};
  change({title:draft.title||"Compare estimates",quotes:[...draft.quotes.filter(q=>q.documentId!==s.documentId),next],chosenQuoteId:null});
 }
 async function openQuotes(documentId?:string){
  if(!data||disabled)return;
  if(dirty||!row){
   const saved=await submit({id,homeId:data.homeId,version:row?.revision??0,requestId:randomUUID(),payload:{...draft,title:draft.title.trim()||"Compare estimates"}});
   if(!saved)return;
   dirtyRef.current=false;
   // Let the navigation guard observe the saved state before moving to the original.
   setOpenQuoteAfterSave(documentId??"");
  }else router.push(documentId?{pathname:"/quotes",params:{id:documentId}}:"/quotes");
 }
 const [openQuoteAfterSave,setOpenQuoteAfterSave]=useState<string|null>(null);
 useEffect(()=>{if(openQuoteAfterSave!==null&&!busy&&!dirty){const documentId=openQuoteAfterSave;setOpenQuoteAfterSave(null);router.push(documentId?{pathname:"/quotes",params:{id:documentId}}:"/quotes");}},[openQuoteAfterSave,busy,dirty,router]);
 const replacement=replacementComparison(draft);
 const money=(cents:number)=>purchaseMoney(cents,draft.currency);
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
 <ScreenNavigation title={editing?purchaseKinds[draft.kind]:"Your spending decisions"} fallback="/quotes" disabled={busy}/>
 <View style={{flex:1}} ><FormScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg,paddingBottom:48}}>
 {loading?<ActivityIndicator accessibilityLabel="Loading decisions"/>:null}
 {error?<><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><Button label="Reload saved decision" variant="secondary" disabled={busy} onPress={reload}/></>:null}
 {notice?<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.primary}]}>{notice}</Text>:null}
 {pending?<Surface tone="subtle" style={{gap:12}}><Heading>Check an unfinished save</Heading><Copy>The same attempt is kept securely on this device. Check it before making another change.</Copy>{pending.id!==id?<Button label="Open unfinished decision" onPress={()=>router.push({pathname:"/purchase-decision",params:{id:pending.id}})}/>:<><Button label="Check saved decision" disabled={busy} onPress={()=>void load()}/><Button label="Retry same save" disabled={busy} variant="secondary" onPress={()=>void submit(pending)}/></>}</Surface>:null}
 {!editing&&data?<>
 <JourneyHeading eyebrow="Before I spend" title="A little clarity before a big decision." detail="Bring your quotes, model details or repair costs. Keep the evidence and your decision together."/>
 <View style={{gap:12}}>{(Object.keys(purchaseKinds) as PurchaseKind[]).map(k=><JourneyEntry key={k} icon={decisionIntros[k].icon} title={purchaseKinds[k]} detail={decisionIntros[k].detail} onPress={()=>router.push({pathname:"/purchase-decision",params:{kind:k}})}/>)}</View>
 <Heading>Saved decisions</Heading>{!data.decisions.length?<JourneyPanel tone="soft"><Copy>Your comparisons and checks will appear here. You can save a draft before every question is answered.</Copy></JourneyPanel>:data.decisions.map(d=><JourneyEntry key={d.id} icon={decisionIntros[d.payload.kind].icon} title={d.payload.title} detail={purchaseKinds[d.payload.kind]} onPress={()=>router.push({pathname:"/purchase-decision",params:{id:d.id}})}/>)}</>:null}
 {editing&&data?<>
 <JourneyHeading eyebrow={purchaseKinds[draft.kind]} title={decisionIntros[draft.kind].title} detail={decisionIntros[draft.kind].detail}/>
 <Copy>Private to your home in {data.homeName}. Save unfinished checks and return when you have more evidence.</Copy>
 {draft.kind!=="compare"?<><TextField label="Decision name" value={draft.title} maxLength={200} editable={!disabled} onChangeText={title=>change({title})}/>
 <View style={{gap:8}}>{(["owner","tenant"] as const).map(context=><Check key={context} label={context==="tenant"?"I rent this home":"I own this home"} value={draft.context===context} disabled={disabled} onChange={()=>change({context})}/>)}</View>
 {draft.context==="tenant"?<Copy>Check with your landlord or building before arranging work or buying parts. Record who approves, arranges and pays below.</Copy>:null}
 </>:null}
 {draft.kind!=="compatibility"&&draft.kind!=="compare"?<><Heading>Currency for every amount</Heading>{(["CAD","USD"] as const).map(currency=><Check key={currency} label={currency} value={draft.currency===currency} disabled={disabled} onChange={()=>change({currency,costsComplete:false,quotes:draft.quotes.map(q=>({...q,allIn:false}))})}/>)}</>:null}
 {draft.kind==="compare"?<QuoteComparison draft={draft} sources={data.sources} disabled={disabled} change={change} selectSource={selectSource} openQuotes={id=>void openQuotes(id)} onStepChange={()=>scrollRef.current?.scrollTo({y:0,animated:false})}/>:null}
 {draft.kind==="compatibility"?<>
 <Heading>Check exact models and requirements</Heading><Copy>Brand names or a similar appearance are not enough. Use manufacturer manuals, model labels and written installer confirmation. Check dimensions, clearances, power, connections and building requirements that apply.</Copy>
 <TextField label="Existing item and exact model" value={draft.existingModel} maxLength={200} editable={!disabled} onChangeText={existingModel=>change({existingModel,checks:draft.checks.map(c=>({...c,result:"unknown"}))})}/>
 <TextField label="Candidate part or product and exact model" value={draft.candidateModel} maxLength={200} editable={!disabled} onChangeText={candidateModel=>change({candidateModel,checks:draft.checks.map(c=>({...c,result:"unknown"}))})}/>
 {draft.checks.map((c,i)=><Surface key={i} tone="subtle" style={{gap:12}}><Heading>{"Check "+(i+1)}</Heading>
 {([{key:"requirement",label:"Requirement, including units",max:200},{key:"reference",label:"Manufacturer manual URL, title and page, or installer reference",max:500},{key:"excerpt",label:"Exact requirement and what your model provides",max:2000}] as const).map(f=><TextField key={f.key} label={f.label} multiline maxLength={f.max} value={c[f.key]} editable={!disabled} onChangeText={value=>change({checks:draft.checks.map((x,n)=>n===i?{...x,[f.key]:value,result:"unknown"}:x)})}/>)}
 {(["unknown","matches","mismatch"] as const).map(result=><Check key={result} label={result==="unknown"?"Still to confirm":result==="matches"?"Matches this reference":"Does not match"} value={c.result===result} disabled={disabled||(result!=="unknown"&&(!c.requirement.trim()||!c.reference.trim()||!c.excerpt.trim()))} onChange={()=>change({checks:draft.checks.map((x,n)=>n===i?{...x,result}:x)})}/>)}
 {draft.checks.length>1?<Button label="Remove check" variant="secondary" disabled={disabled} onPress={()=>change({checks:draft.checks.filter((_,n)=>n!==i)})}/>:null}</Surface>)}
 {draft.checks.length<12?<Button label="Add requirement" variant="secondary" disabled={disabled} onPress={()=>change({checks:[...draft.checks,{requirement:"",reference:"",excerpt:"",result:"unknown"}]})}/>:null}
 <Surface tone="subtle"><Copy>{compatibilitySummary(draft)}</Copy></Surface>
 </>:null}
 {draft.kind==="replace"?<>
 <Heading>Compare complete upfront costs</Heading><Copy>Enter confirmed amounts in {draft.currency}. Leave unknown costs blank. Enter 0 only when you have confirmed there is no charge. Include tax and any required fees once, in the appropriate amount.</Copy>
 {([{key:"repairCost",label:"Complete repair cost"},{key:"replacementCost",label:"Replacement product cost"},{key:"installationCost",label:"Delivery, installation and required parts"},{key:"disposalCost",label:"Removal and disposal"}] as const).map(f=><TextField key={f.key} label={f.label+" ("+draft.currency+")"} keyboardType="decimal-pad" value={draft[f.key]} editable={!disabled} onChangeText={v=>change({[f.key]:v,costsComplete:false})}/>)}
 <Check label="These amounts include tax and all required fees, with nothing counted twice" value={draft.costsComplete} disabled={disabled} onChange={()=>change({costsComplete:!draft.costsComplete})}/>
 <Surface tone="subtle" style={{gap:8}}>{replacement?<><Copy>Repair: {money(replacement.repair)}</Copy><Copy>Replacement, installed and old item removed: {money(replacement.replacement)}</Copy><Copy>{replacement.difference===0?"The recorded upfront totals are equal.":replacement.difference>0?"Repair has a lower upfront total by "+money(replacement.difference)+".":"Replacement has a lower upfront total by "+money(-replacement.difference)+"."}</Copy><Copy>This does not estimate future repairs, remaining life, operating costs or savings.</Copy></>:<Copy>Confirm all four costs and included fees to compare totals. Unknown costs are not treated as zero.</Copy>}</Surface>
 <TextField label="Condition, age and repair diagnosis — with source" multiline maxLength={2000} value={draft.condition} editable={!disabled} onChangeText={condition=>change({condition})}/>
 <TextField label="Existing coverage, repair warranty and replacement warranty" multiline maxLength={2000} value={draft.warranty} editable={!disabled} onChangeText={warranty=>change({warranty})}/>
 <Copy>Check applicable recalls and safety concerns with the manufacturer or a qualified professional. Price alone cannot establish that continued use or a repair is appropriate.</Copy>
 </>:null}
 {draft.kind!=="compare"?<><TextField label="Permission, responsibility and building requirements" multiline maxLength={2000} value={draft.permission} editable={!disabled} onChangeText={permission=>change({permission})}/>
 <TextField label="Questions, decision and why" multiline maxLength={2000} value={draft.notes} editable={!disabled} onChangeText={notes=>change({notes})}/>
 </>:null}
 <JourneyDisclosure label={draft.outcome?"Later result · notes saved":"Later: what happened?"} open={followUp} onToggle={()=>setFollowUp(v=>!v)}>
 <TextField label="Later: what happened and evidence" multiline maxLength={2000} value={draft.outcome} editable={!disabled} onChangeText={outcome=>change({outcome})}/>
 <Copy>Return after the work or purchase to record the actual cost, fit or result. Your notes do not independently verify that an action helped.</Copy></JourneyDisclosure>
 <Button label={busy?"Saving…":draft.kind==="compare"?"Save comparison":"Save decision"} disabled={disabled||!draft.title.trim()||(!dirty&&!!row)} onPress={()=>void submit({id:id,homeId:data.homeId,version:row?.revision??0,requestId:randomUUID(),payload:draft})}/>
 {dirty?<Copy>Changes are not saved yet.</Copy>:null}
 </>:null}
 {data?.truncated?<Copy>Showing recent decisions and quote reviews. Selected quote originals are checked even when older.</Copy>:null}
 </FormScrollView></View></SafeAreaView>;
}


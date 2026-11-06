import { FormScrollView } from "@/components/FormScrollView";
import {CollectionPages} from "@/components/CollectionPages";
import {QuietAction} from "@/components/Brief";
import {JourneyHeading,JourneyPanel,JourneyEntry} from "@/components/JourneyUI";
import {useCallback,useEffect,useRef,useState} from "react";
import {useFocusEffect,useLocalSearchParams,useNavigation,useRouter} from "expo-router";
import {usePreventRemove} from "expo-router/react-navigation";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {randomUUID} from "expo-crypto";
import {ScreenNavigation} from "@/components/ScreenNavigation";
import {TextField} from "@/components/TextField";
import {Button} from "@/components/Button";
import {Surface} from "@/components/ui/Surface";
import {apiGet,ApiError} from "@/lib/api";
import {fetchQuote,pendingQuote,saveQuote,clearPendingQuote,type QuoteIntent} from "@/lib/quote-data";
import {draftFromQuote,emptyQuote,quoteFields,quoteDecisions,quoteQuestions,quoteQuestionSheet,type QuoteDraft,type QuotePayload,type QuoteDecision} from "@/lib/quote-review";
import {colors,spacing,typography} from "@/theme/tokens";
type Index={homeName:string;reviews:{documentId:string;title:string;decision:QuoteDecision;readStatus:string}[];documents:{id:string;title:string}[];truncated:boolean};
const Copy=({children}:{children:React.ReactNode})=><Text style={[typography.body,{color:colors.mutedForeground}]}>{children}</Text>;
const Heading=({children}:{children:React.ReactNode})=><Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{children}</Text>;
export default function Quotes(){
 const params=useLocalSearchParams<{id?:string;itemId?:string;issueId?:string}>(),id=typeof params.id==="string"?params.id:null;
 const router=useRouter(),navigation=useNavigation();
 const [index,setIndex]=useState<Index|null>(null),[data,setData]=useState<QuotePayload|null>(null);
 const [draft,setDraft]=useState<QuoteDraft>(emptyQuote),[pending,setPending]=useState<QuoteIntent|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const [dirty,setDirty]=useState(false),[editing,setEditing]=useState(false),[details,setDetails]=useState(false),[choose,setChoose]=useState(false);
 const [sheet,setSheet]=useState(false),[showSuggestions,setShowSuggestions]=useState(false);
 const [section,setSection]=useState<"details"|"questions"|"decision">("details"),[more,setMore]=useState(false);
 const [link,setLink]=useState<"itemId"|"issueId"|"invoiceId"|null>(null),[query,setQuery]=useState("");
 const lock=useRef(false),epoch=useRef(0),dirtyRef=useRef(false);
 useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
 const reading=!!data&&data.review?.read_status==="reading"&&!data.readingExpired&&!data.sourceChanged;
 const disabled=busy||reading||!!pending;
 const adopt=useCallback((next:QuotePayload)=>{
  setData(next);const value=draftFromQuote(next);
  // Entry context only proposes a link that is visible in this private home.
  if(!next.review?.payload){
   if(params.itemId&&next.items.some(i=>i.id===params.itemId))value.itemId=params.itemId;
   if(params.issueId&&next.issues.some(i=>i.id===params.issueId))value.issueId=params.issueId;
  }
  setDraft(value);setDirty(false);
 },[params.itemId,params.issueId]);
 const load=useCallback(async()=>{
  if(lock.current)return;
  const n=++epoch.current;
  try{
   const [saved,retry]=await Promise.all([id?fetchQuote(id):apiGet<Index>("/api/mobile/v1/quotes",{timeoutMs:15000}),pendingQuote()]);
   if(n!==epoch.current)return;
   setPending(retry);
   if(id){const value=saved as QuotePayload;adopt(value);
    if(retry&&retry.documentId===id&&value.review?.last_request_id===retry.requestId){await clearPendingQuote();setPending(null);setNotice("Saved review confirmed.");}
   }else setIndex(saved as Index);
   setError(null);
  }catch(e){if(n===epoch.current)setError(e instanceof Error?e.message:"Could not load quotes. Try again.");}
  finally{if(n===epoch.current)setLoading(false);}
 },[id,adopt]);
 useFocusEffect(useCallback(()=>{if(!dirtyRef.current)void load();return()=>{epoch.current++;};},[load]));
 useEffect(()=>{
  if(!reading||dirty||pending)return;
  let count=0;const timer=setInterval(()=>{if(++count>32){clearInterval(timer);return;}void load();},4000);
  return()=>clearInterval(timer);
 },[reading,dirty,pending,load]);
 usePreventRemove(dirty||busy,({data:nav})=>{
  if(busy)return;
  Alert.alert("Leave without saving these edits?","Your original and previously saved review are kept.",[{text:"Keep editing",style:"cancel"},{text:"Leave",style:"destructive",onPress:()=>navigation.dispatch(nav.action)}]);
 });
 function change(next:QuoteDraft){setDraft(next);setDirty(true);setNotice(null);}
 async function submit(intent:QuoteIntent){
  if(lock.current)return;lock.current=true;epoch.current++;setBusy(true);setError(null);
  try{
   const row=await saveQuote(intent);
   setPending(null);setData(d=>d?{...d,review:row,sourceChanged:false,readingExpired:false}:d);
   if(intent.action==="save"){setDraft(intent.payload!);setDirty(false);setEditing(false);setSection(s=>s==="details"?"questions":s);setShowSuggestions(false);setNotice("Review saved. No message or agreement has been sent.");}
   else {setDirty(false);setNotice(intent.action==="read"?"Reading your saved quote. You can leave and return here.":"Reading stopped. You can enter the details yourself.");}
  }catch(e){
   setPending(await pendingQuote().catch(()=>intent));
   if(e instanceof ApiError&&[400,403,404,409].includes(e.status))setPending(null);
   setError(e instanceof Error?e.message:"Could not confirm this change. Check the saved review.");
  }finally{lock.current=false;setBusy(false);}
 }
 function send(action:QuoteIntent["action"]){
  if(!data||disabled)return;
  void submit({documentId:data.document.id,homeId:data.homeId,sourceVersion:data.document.updated_at,version:data.review?.revision??0,requestId:randomUUID(),action,...(action==="save"?{payload:draft}:{}),...(action==="read"?{consent:true}:{})});
 }
 function startRead(){
  if(!data||disabled||dirty)return;
  Alert.alert("Read this quote?","Send the saved original, or your pasted quote text, to Rezlee’s AI service. Review every suggestion against the original. Your saved review stays until you choose to change it.",[{text:"Cancel",style:"cancel"},{text:"Read quote",onPress:()=>send("read")}]);
 }
 async function openOriginal(){
  if(!data)return;
  if(!data.document.hasFile){setDetails(v=>!v);return;}
  try{const r=await apiGet<{url:string}>("/api/mobile/v1/vault/records?id="+data.document.id+"&file=1");await Linking.openURL(r.url);}
  catch(e){setError(e instanceof Error?e.message:"Could not open the original.");}
 }
 function reload(){
  if(dirty)Alert.alert("Reload the saved review?","Your unsaved edits will be discarded.",[{text:"Keep editing",style:"cancel"},{text:"Reload",onPress:()=>{setDirty(false);void load();}}]);
  else void load();
 }
 const questions=quoteQuestions(draft),shown=more?questions:questions.slice(0,4);
 const openQuote=(documentId:string)=>router.push({pathname:"/quotes",params:{id:documentId,...(params.itemId?{itemId:params.itemId}:{}),...(params.issueId?{issueId:params.issueId}:{})}});
 const newQuote=()=>router.push({pathname:"/vault-record",params:{kind:"quote",...(params.itemId?{itemId:params.itemId}:{}),...(params.issueId?{issueId:params.issueId}:{})}});
 return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:colors.background}}>
 <ScreenNavigation title="Before I spend" fallback="/(tabs)/vault" disabled={busy}/>
 <View style={{flex:1}} ><FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:spacing.xl,gap:spacing.lg,paddingBottom:48}}>
 {loading?<ActivityIndicator accessibilityLabel="Loading quote review"/>:null}
 {error?<><Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>{error}</Text><Button label="Reload saved review" variant="secondary" disabled={busy} onPress={reload}/></>:null}
 {notice?<Text accessibilityLiveRegion="polite" style={[typography.body,{color:colors.primary}]}>{notice}</Text>:null}
 {pending?<Surface tone="subtle" style={{gap:12}}><Heading>Check an unfinished save</Heading><Copy>The same attempt is kept on this device. Check it before making another change.</Copy>{pending.documentId!==id?<Button label="Open unfinished review" onPress={()=>openQuote(pending.documentId)}/>:<><Button label="Check saved review" disabled={busy} onPress={()=>void load()}/><Button label="Retry same change" variant="secondary" disabled={busy} onPress={()=>void submit(pending)}/></>}</Surface>:null}
 {!id&&index?<><JourneyHeading title="Before you say yes." detail="Understand the work, spot missing details and keep your questions with the original quote."/><JourneyPanel tone="soft"><Heading>Start with the quote</Heading><Copy>A photo, file or pasted text. Review what is included before making a decision.</Copy><Button label="Add a quote" disabled={!!pending} onPress={newQuote}/><Button label="Use a saved Vault record" variant="secondary" disabled={!!pending} onPress={()=>setChoose(v=>!v)}/></JourneyPanel>
 {choose?<><TextField label="Find a saved record" value={query} onChangeText={setQuery}/>{index.documents.filter(d=>d.title.toLowerCase().includes(query.toLowerCase())).map(d=><Button key={d.id} label={d.title} variant="secondary" onPress={()=>openQuote(d.id)}/>)}{!index.documents.length?<Copy>Save a quote or paste its text into a new Vault record first.</Copy>:null}</>:null}
 <JourneyEntry disabled={!!pending} icon="layers" title="Compare, check or decide" detail="Compare quotes, check compatibility or weigh repair and replacement costs." onPress={()=>router.push("/purchase-decision")}/><Heading>Saved reviews</Heading>{!index.reviews.length?<Copy>Your quote reviews will stay here so you can return to the questions and your decision.</Copy>:index.reviews.map(r=><Surface key={r.documentId} tone="subtle" style={{gap:8}}><Heading>{r.title}</Heading><Copy>{quoteDecisions[r.decision]??"Saved review"}</Copy><Button label={"Open "+r.title} variant="secondary" onPress={()=>openQuote(r.documentId)}/></Surface>)}
 {index.truncated?<Copy>Showing the latest 100 records and reviews. Open an older record directly in Vault to review it.</Copy>:null}</>:null}
 {id&&data?<><JourneyHeading eyebrow="Your quote review" title={data.document.title} detail={"Keep the work, questions and next step together in "+data.homeName+"."}/><Copy>A quote is proposed work. It does not confirm payment, completion or compatibility.</Copy>
 <Button label={data.document.hasFile?"View original quote":"View saved quote text"} variant="secondary" onPress={()=>void openOriginal()}/>
 {details&&!data.document.hasFile?<Surface tone="subtle"><Copy>{data.document.notes||"No quote text saved. Add it to the Vault record or enter the details below."}</Copy></Surface>:null}
 <QuietAction label="Edit original in Vault" disabled={disabled||dirty} onPress={()=>router.push({pathname:"/vault-record",params:{id}})}/>
 {data.sourceChanged?<Text accessibilityRole="alert" style={[typography.body,{color:colors.criticalForeground}]}>The original changed. These earlier details and decision need review against the current original.</Text>:null}
 {reading?<Surface tone="subtle" style={{gap:12}}><ActivityIndicator/><Copy>Reading the saved original. Progress stays here if you leave.</Copy><Button label="Stop reading" variant="secondary" disabled={busy||!!pending} onPress={()=>void submit({documentId:id,homeId:data.homeId,sourceVersion:data.document.updated_at,version:data.review!.revision,requestId:randomUUID(),action:"cancel"})}/></Surface>:null}
 {data.readingExpired||data.review?.read_status==="failed"?<Copy>Reading did not finish. The original is safe. You can try again or enter the details yourself; reading never retries automatically.</Copy>:null}
 {!reading&&data.aiAvailable?<Button label={data.review?.read_status==="ready"?"Read quote again":"Read quote"} variant="secondary" disabled={disabled||dirty||!data.aiAvailable||(!data.document.hasFile&&!data.document.notes?.trim())} onPress={startRead}/>:null}
 {!data.aiAvailable?<Copy>Automatic reading is unavailable right now. You can still review and save the details yourself.</Copy>:null}
 {!!data.review?.read_result&&!data.sourceChanged?<Surface tone="subtle" style={{gap:12}}><Heading>Suggestions from the original</Heading><Copy>{data.review.read_result.length} sections read. Check the excerpts against your original; these are suggestions for your review.</Copy><Button label={showSuggestions?"Hide extracted details":"Show extracted details"} variant="secondary" onPress={()=>setShowSuggestions(v=>!v)}/>{data.review.read_result.length?showSuggestions?data.review.read_result.map(f=><View key={f.key} style={{gap:6}}><Heading>{quoteFields.find(x=>x.key===f.key)?.label}</Heading><Copy>{f.value}</Copy>{(f.citations?.length?f.citations:[{excerpt:f.excerpt,page:f.page}]).map((citation,index)=><Text key={index} style={[typography.caption,{color:colors.mutedForeground}]}>“{citation.excerpt}”{citation.page?" · Page "+citation.page:" · Saved source"}</Text>)}</View>):null:<Copy>No supported details were read. Enter them yourself, or replace the original with a clearer copy.</Copy>}
 {data.review.read_result.length&&(!data.review.payload||showSuggestions)?<Button label="Use suggestions in review" disabled={disabled||dirty} onPress={()=>{const fields={...emptyQuote().fields};for(const f of data.review!.read_result!)fields[f.key]=f.value;change({...draft,fields,reviewed:false,decision:"considering"});setEditing(true);setSection("details");}}/>:null}</Surface>:null}
 <CollectionPages label="Quote review sections" options={[{value:"details",label:"Details"},{value:"questions",label:"Questions"},{value:"decision",label:"Decision"}]} selected={section} onSelect={setSection} renderPage={page=><View style={{gap:20}}>
 {page==="details"?<>
 {!editing?<><Copy>{draft.reviewed&&!data.sourceChanged?"You marked these details reviewed.":"Review the original and correct the details before relying on this summary."}</Copy>{quoteFields.filter(f=>draft.fields[f.key]).map(f=><View key={f.key} style={{gap:4}}><Heading>{f.label}</Heading><Copy>{draft.fields[f.key]}</Copy></View>)}{!Object.values(draft.fields).some(Boolean)?<Copy>Read the quote for suggested details, or enter the work and terms yourself.</Copy>:questions.length?<Copy>Some details are missing or unresolved. Open Questions to check what needs clarification.</Copy>:null}<Button label="Edit quote details" disabled={disabled} onPress={()=>setEditing(true)}/></>:<>
 <Copy>Record what the quote says. Leave unclear details blank; Rezlee will help you ask about them.</Copy>{quoteFields.map(f=><TextField key={f.key} label={f.label} value={draft.fields[f.key]} multiline maxLength={1500} editable={!disabled} onChangeText={v=>change({...draft,fields:{...draft.fields,[f.key]:v},reviewed:false,decision:draft.decision==="proceed"?"considering":draft.decision})}/>)}
 </>}
 <Pressable accessibilityRole="checkbox" accessibilityLabel="I reviewed these details against the original" accessibilityState={{checked:draft.reviewed,disabled}} disabled={disabled} onPress={()=>change({...draft,reviewed:!draft.reviewed,decision:draft.decision==="proceed"?"considering":draft.decision})} style={{minHeight:48,justifyContent:"center"}}><Copy>{draft.reviewed?"✓ ":"□ "}I reviewed these details against the original.</Copy></Pressable>
 </>:null}
 {page==="questions"?<><Heading>Questions to clarify</Heading><Copy>Based on missing or unresolved details. Check the original before asking. Recorded answers stay with this quote.</Copy>
 <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{(["owner","tenant"] as const).map(c=><Button key={c} label={c==="owner"?"My responsibility":"Landlord / building involved"} variant={draft.context===c?"primary":"secondary"} disabled={disabled} onPress={()=>change({...draft,context:c})}/>)}</View>
 {!questions.length?<Copy>All review sections have details. This does not verify the quote’s completeness, price or compatibility. Keep any remaining questions in your decision notes.</Copy>:shown.map(q=><Surface key={q.key} tone="subtle" style={{gap:10}}><Heading>{q.question}</Heading><Copy>{q.reason}</Copy><TextField label={"Your answer · "+(q.key==="tenant"?"Landlord or building":quoteFields.find(f=>f.key===q.key)?.label??q.key)} placeholder="What did they clarify? Add the date or reference." value={draft.answers[q.key]??""} multiline maxLength={1200} editable={!disabled} onChangeText={v=>change({...draft,answers:{...draft.answers,[q.key]:v}})}/></Surface>)}
 {questions.length>4?<Button label={more?"Show fewer questions":"Show all "+questions.length+" questions"} variant="secondary" onPress={()=>setMore(v=>!v)}/>:null}
 {sheet?<Surface tone="subtle"><Text selectable style={[typography.body,{color:colors.foreground}]}>{quoteQuestionSheet(data.document.title,draft)}</Text></Surface>:null}
 {Object.entries(draft.answers).filter(([key,value])=>value&&!questions.some(q=>q.key===key)).map(([key,value])=><Surface key={key} tone="subtle" style={{gap:8}}><Heading>Earlier answer · {key==="tenant"?"Landlord or building":quoteFields.find(f=>f.key===key)?.label??"Other detail"}</Heading><Copy>{value}</Copy><TextField label={"Update answer · "+(key==="tenant"?"Landlord or building":quoteFields.find(f=>f.key===key)?.label??"Other detail")} value={value??""} multiline maxLength={1200} editable={!disabled} onChangeText={v=>change({...draft,answers:{...draft.answers,[key]:v}})}/></Surface>)}
 {questions.length?<Button label="Show question sheet" variant="secondary" onPress={()=>setSheet(v=>!v)}/>:null}
 </>:null}
 {page==="decision"?<><Heading>Your next step</Heading><Copy>This records your plan only. It does not accept a quote or contact anyone.</Copy>{Object.entries(quoteDecisions).map(([key,label])=><Button key={key} label={label} variant={draft.decision===key?"primary":"secondary"} disabled={disabled||(key==="proceed"&&(!draft.reviewed||data.sourceChanged))} onPress={()=>change({...draft,decision:key as QuoteDecision})}/>)}
 {!draft.reviewed||data.sourceChanged?<Copy>Review and save the current quote details before recording that you plan to proceed.</Copy>:null}
 <TextField label="Decision, remaining questions or later outcome" value={draft.decisionNote} multiline maxLength={2000} editable={!disabled} onChangeText={v=>change({...draft,decisionNote:v})}/>
 <Heading>Keep related records together</Heading>{(["itemId","issueId","invoiceId"] as const).map(k=><Button key={k} label={(k==="itemId"?"Home item":k==="issueId"?"Repair issue":"Final invoice")+": "+(draft[k]?(k==="itemId"?data.items.find(i=>i.id===draft[k])?.name:k==="issueId"?data.issues.find(i=>i.id===draft[k])?.title:data.invoices.find(i=>i.id===draft[k])?.title)??"Linked saved record":"Choose saved record")} variant="secondary" disabled={disabled} onPress={()=>{setLink(link===k?null:k);setQuery("");}}/>)}
 {link?<Surface tone="subtle" style={{gap:10}}><TextField label="Find related record" value={query} onChangeText={setQuery}/><Button label="No linked record" variant="secondary" onPress={()=>{change({...draft,[link]:null});setLink(null);}}/>{(link==="itemId"?data.items.map(i=>({id:i.id,title:i.name})):link==="issueId"?data.issues:data.invoices).filter(r=>r.title.toLowerCase().includes(query.toLowerCase())).map(r=><Button key={r.id} label={r.title} variant="secondary" onPress={()=>{change({...draft,[link]:r.id});setLink(null);}}/>)}</Surface>:null}
 {draft.itemId?<Button label="Open linked home item" variant="secondary" disabled={dirty||disabled} onPress={()=>router.push({pathname:"/inventory-item",params:{id:draft.itemId!}})}/>:null}
 {draft.issueId?<Button label="Open linked repair issue" variant="secondary" disabled={dirty||disabled} onPress={()=>router.push({pathname:"/repairs",params:{id:draft.issueId!}})}/>:null}
 {draft.invoiceId?<Button label="Open linked invoice" variant="secondary" disabled={dirty||disabled} onPress={()=>router.push({pathname:"/vault-record",params:{id:draft.invoiceId!}})}/>:null}
 {data.linksTruncated?<Copy>Choose from the latest 100 saved records in each category.</Copy>:null}<Copy>A linked invoice does not prove payment or completed work. Add what happened in your notes.</Copy>
 </>:null}
 </View>}/>
 <Button label={busy?"Saving…":"Save review"} disabled={disabled||(!dirty&&!!data.review?.payload)} onPress={()=>send("save")}/>
 {dirty?<Copy>Changes are not saved yet.</Copy>:null}
 </>:null}
 </FormScrollView></View></SafeAreaView>;
}

import { useTheme } from "@/theme/useTheme";
import {useState} from "react";
import {Keyboard,Pressable,Text,View,useWindowDimensions} from "react-native";
import {Button} from "@/components/Button";
import {TextField} from "@/components/TextField";
import {JourneyDisclosure,JourneyPanel} from "@/components/JourneyUI";
import { typography } from "@/theme/tokens";
import {comparePurchase,comparisonTopics,currentPurchaseQuote,purchaseMoney,type PurchaseDraft,type PurchaseSource} from "@/lib/purchase-decision";
const Copy=({children}:{children:React.ReactNode})=>{
  const { colors } = useTheme();
return (<Text style={[typography.body,{color:colors.mutedForeground}]}>{children}</Text>); };
const Heading=({children}:{children:React.ReactNode})=>{
  const { colors } = useTheme();
return (<Text accessibilityRole="header" style={[typography.section,{color:colors.foreground}]}>{children}</Text>); };
function Check({label,checked,disabled,onPress}:{label:string;checked:boolean;disabled:boolean;onPress:()=>void}){
  const { colors } = useTheme();
return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked,disabled}} disabled={disabled} onPress={onPress} style={{flexDirection:"row",gap:12,minHeight:48,paddingVertical:12}}><Text style={[typography.body,{color:colors.primary}]}>{checked?"✓":"○"}</Text><Text style={[typography.body,{flex:1,color:colors.foreground}]}>{label}</Text></Pressable>;}
type Props={draft:PurchaseDraft;sources:PurchaseSource[];disabled:boolean;change:(patch:Partial<PurchaseDraft>)=>void;selectSource:(source:PurchaseSource)=>void;openQuotes:(id?:string)=>void;onStepChange:()=>void};
export function QuoteComparison({draft,sources,disabled,change,selectSource,openQuotes,onStepChange}:Props){
  const { colors } = useTheme();

 const {fontScale}=useWindowDimensions();
 const [step,setStep]=useState(0),[query,setQuery]=useState(""),[details,setDetails]=useState(false);
 const labels=["Choose","Compare","Decide"],result=comparePurchase(draft,sources),topics=comparisonTopics(draft,sources);
 const available=sources.filter(s=>!draft.quotes.some(q=>q.documentId===s.documentId)&&s.reviewed&&s.sourceCurrent);
 const reviewNeeded=sources.filter(s=>!s.reviewed||!s.sourceCurrent);
 const go=(n:number)=>{Keyboard.dismiss();setStep(n);requestAnimationFrame(onStepChange);};
 return <View style={{gap:20}}>
 <View accessibilityRole="tablist" accessibilityLabel="Quote comparison steps" style={{flexDirection:fontScale>1.3?"column":"row",gap:6}}>{labels.map((label,n)=><Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:step===n,disabled:disabled||(n>0&&draft.quotes.length<2)}} disabled={disabled||(n>0&&draft.quotes.length<2)} onPress={()=>go(n)} style={{flex:fontScale>1.3?undefined:1,minHeight:48,paddingHorizontal:8,paddingVertical:10,borderRadius:16,alignItems:"center",justifyContent:"center",backgroundColor:step===n?colors.primary:colors.surfaceSubtle}}><Text style={[typography.meta,{color:step===n?colors.primaryForeground:colors.foreground}]}>{n+1}. {label}</Text></Pressable>)}</View>
 {step===0?<>
 <Heading>Which estimates are you weighing up?</Heading><Copy>Choose two or three quotes for the same job. Rezlee keeps the work, costs and unanswered questions together.</Copy>
 <TextField label="What is the job?" placeholder="For example, replace the water heater" value={draft.title} maxLength={200} editable={!disabled} onChangeText={title=>change({title})}/>
 {draft.quotes.map(q=>{const s=sources.find(s=>s.documentId===q.documentId);return <JourneyPanel key={q.documentId} tone="soft"><Heading>{s?.title??"Unavailable quote"}</Heading>{!currentPurchaseQuote(q,sources)?<Copy>This original changed or still needs review. Recheck it before comparing totals.</Copy>:<Copy>Reviewed quote selected</Copy>}<Button label={"Remove "+(s?.title??"quote")} variant="secondary" disabled={disabled} onPress={()=>change({quotes:draft.quotes.filter(x=>x.documentId!==q.documentId),chosenQuoteId:draft.chosenQuoteId===q.documentId?null:draft.chosenQuoteId})}/></JourneyPanel>;})}
 {draft.quotes.length<3?<>
 {available.length>4?<TextField label="Find a reviewed quote" value={query} onChangeText={setQuery}/>:null}
 {available.filter(s=>s.title.toLowerCase().includes(query.toLowerCase())).map(s=><Button key={s.documentId} label={"Choose "+s.title} variant="secondary" disabled={disabled} onPress={()=>selectSource(s)}/>)}
 {!available.length&&!draft.quotes.length?<JourneyPanel tone="soft"><Heading>Start with your first quote</Heading><Copy>Add a photo, PDF or the written estimate. Review the details, then return here to choose it. You can enter details yourself too.</Copy></JourneyPanel>:null}
 <Button label="Add or review a quote" variant="secondary" disabled={disabled} onPress={()=>openQuotes()}/>
 {reviewNeeded.length?<Copy>{reviewNeeded.length} saved {reviewNeeded.length===1?"quote needs":"quotes need"} review before selection.</Copy>:null}
 </>:null}
 <Button label="Check differences" disabled={disabled||draft.quotes.length<2} onPress={()=>go(1)}/>
 </>:null}
 {step===1?<>
 <Heading>The details that change the decision</Heading><Copy>Different wording is a reason to check, not proof that one quote is better. Missing details stay unknown.</Copy>
 <View style={{flexDirection:"row",gap:12}}>{(["CAD","USD"] as const).map(currency=><Button key={currency} label={currency} variant={draft.currency===currency?"primary":"secondary"} disabled={disabled} onPress={()=>change({currency,quotes:draft.quotes.map(q=>({...q,allIn:false}))})}/>)}</View>
 {draft.quotes.map(q=>{const s=sources.find(s=>s.documentId===q.documentId),current=currentPurchaseQuote(q,sources);return <JourneyPanel key={q.documentId} tone="soft"><Heading>{s?.title??"Unavailable quote"}</Heading><Copy>{current?s!.fields.price||"Price not recorded":"This original needs review again. Earlier figures are excluded."}</Copy>
 <TextField label={"All-in total · "+(s?.title??"quote")+" ("+draft.currency+")"} keyboardType="decimal-pad" value={q.total} editable={!disabled&&current} onChangeText={total=>change({quotes:draft.quotes.map(x=>x.documentId===q.documentId?{...x,total,allIn:false}:x)})}/>
 <Check label={"Tax and all required fees included · "+(s?.title??"quote")} checked={q.allIn} disabled={disabled||!current} onPress={()=>change({quotes:draft.quotes.map(x=>x.documentId===q.documentId?{...x,allIn:!x.allIn}:x)})}/>
 <Check label={"Same work, quantities and models · "+(s?.title??"quote")} checked={q.scopeConfirmed} disabled={disabled||!current} onPress={()=>change({quotes:draft.quotes.map(x=>x.documentId===q.documentId?{...x,scopeConfirmed:!x.scopeConfirmed}:x)})}/>
 {s?<Button label={"Review original · "+s.title} variant="secondary" disabled={disabled} onPress={()=>openQuotes(s.documentId)}/>:null}
 {!current&&s?.sourceCurrent&&s.reviewed?<Button label={"Use updated review · "+s.title} disabled={disabled} onPress={()=>selectSource(s)}/>:null}
 </JourneyPanel>;})}
 {topics.map(topic=><JourneyPanel key={topic.key} tone="soft"><Heading>{topic.label}</Heading>{topic.entries.map(e=><View key={e.id} style={{gap:4}}><Text style={[typography.meta,{color:colors.primary,fontWeight:"600"}]}>{e.title}</Text><Copy>{e.value||(e.current?"Not recorded":"Review the updated original")}</Copy></View>)}{topic.needsClarification||topic.wordingDiffers?<><Text style={[typography.meta,{color:colors.primary,fontWeight:"600"}]}>{topic.needsClarification?"Clarify before choosing":"Check the difference"}</Text><Copy>{topic.question}</Copy></>:null}</JourneyPanel>)}
 <Button label="Keep my decision" disabled={disabled} onPress={()=>go(2)}/>
 </>:null}
 {step===2?<>
 <JourneyPanel tone="soft"><Heading>{result.blockers.length?"Some details still need checking":"Your confirmed upfront costs"}</Heading>{result.blockers.length?result.blockers.map(s=><Copy key={s}>{s}</Copy>):<>{result.totals.map(t=><Copy key={t.documentId}>{sources.find(s=>s.documentId===t.documentId)?.title}: {purchaseMoney(t.cents,draft.currency)}</Copy>)}<Copy>The difference is {purchaseMoney(result.difference!,draft.currency)}. This is a price difference, not verified savings or a recommendation.</Copy></>}<Button label="Recheck quote details" variant="secondary" disabled={disabled} onPress={()=>go(1)}/></JourneyPanel>
 <Heading>Your preference, when you are ready</Heading><Copy>You can save unanswered questions without choosing a company. Saving here does not accept a quote or contact anyone.</Copy>
 {draft.quotes.map(q=><Check key={q.documentId} label={"Prefer "+(sources.find(s=>s.documentId===q.documentId)?.title??"unavailable quote")} checked={draft.chosenQuoteId===q.documentId} disabled={disabled||result.blockers.length>0} onPress={()=>change({chosenQuoteId:draft.chosenQuoteId===q.documentId?null:q.documentId})}/>)}
 <TextField label="Questions to ask or why you prefer this quote" value={draft.notes} multiline maxLength={2000} editable={!disabled} onChangeText={notes=>change({notes})}/>
 <JourneyDisclosure label="Landlord, building or other approval" open={details} onToggle={()=>setDetails(v=>!v)}>
 <Check label="My landlord or building is involved" checked={draft.context==="tenant"} disabled={disabled} onPress={()=>change({context:draft.context==="tenant"?"owner":"tenant"})}/>
 <TextField label="Who approves, arranges and pays?" value={draft.permission} multiline maxLength={2000} editable={!disabled} onChangeText={permission=>change({permission})}/>
 </JourneyDisclosure>
 </>:null}
 {step>0?<Button label={"Back to "+labels[step-1].toLowerCase()} variant="secondary" disabled={disabled} onPress={()=>go(step-1)}/>:null}
 </View>;
}

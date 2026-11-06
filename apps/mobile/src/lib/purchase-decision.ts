/** Customer-entered evidence and arithmetic only. No inferred prices or compatibility. */
import {quoteClarificationReason, quoteQuestionText, type QuoteFields} from "./quote-review";
export type PurchaseKind="compare"|"compatibility"|"replace";
export const purchaseKinds:Record<PurchaseKind,string>={compare:"Compare quotes",compatibility:"Check compatibility",replace:"Repair or replace"};
export type PurchaseQuote={documentId:string;sourceVersion:string;reviewRevision:number;total:string;allIn:boolean;scopeConfirmed:boolean};
export type CompatibilityCheck={requirement:string;reference:string;excerpt:string;result:"unknown"|"matches"|"mismatch"};
export type PurchaseDraft={
 kind:PurchaseKind;title:string;context:"owner"|"tenant";currency:"CAD"|"USD";notes:string;outcome:string;
 quotes:PurchaseQuote[];chosenQuoteId:string|null;
 existingModel:string;candidateModel:string;checks:CompatibilityCheck[];
 repairCost:string;replacementCost:string;installationCost:string;disposalCost:string;costsComplete:boolean;
 condition:string;warranty:string;permission:string;
};
export type PurchaseSource={documentId:string;title:string;sourceVersion:string;reviewRevision:number;reviewed:boolean;sourceCurrent:boolean;fields:QuoteFields};
export type PurchaseRow={id:string;revision:number;last_request_id:string;payload:PurchaseDraft;updated_at:string};
export type PurchaseIndex={homeId:string;homeName:string;decisions:PurchaseRow[];sources:PurchaseSource[];truncated:boolean};
export const emptyPurchase=(kind:PurchaseKind):PurchaseDraft=>({
 kind,title:"",context:"owner",currency:"CAD",notes:"",outcome:"",quotes:[],chosenQuoteId:null,existingModel:"",candidateModel:"",
 checks:[{requirement:"",reference:"",excerpt:"",result:"unknown"}],repairCost:"",replacementCost:"",installationCost:"",disposalCost:"",costsComplete:false,condition:"",warranty:"",permission:""
});
/** Decimal dollars only. Blank remains unknown; an explicit zero is allowed. */
export function purchaseCents(value:string):number|null {
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim()))return null;
 const [whole,fraction=""]=value.trim().split(".");
 return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
export function currentPurchaseQuote(q:PurchaseQuote,sources:PurchaseSource[]){
 const s=sources.find(s=>s.documentId===q.documentId);
 return !!s&&s.sourceCurrent&&s.reviewed&&s.sourceVersion===q.sourceVersion&&s.reviewRevision===q.reviewRevision;
}
export function comparePurchase(d:PurchaseDraft,sources:PurchaseSource[]){
 const blockers:string[]=[];
 if(d.quotes.length<2)blockers.push("Choose at least two saved, reviewed quotes.");
 if(d.quotes.some(q=>!currentPurchaseQuote(q,sources)))blockers.push("A quote changed, was removed or still needs review. Recheck the original before comparing.");
 if(d.quotes.some(q=>purchaseCents(q.total)===null||!q.allIn))blockers.push("Confirm each total includes tax and all required fees in "+d.currency+".");
 if(d.quotes.some(q=>!q.scopeConfirmed))blockers.push("Confirm the quotes cover the same work, quantities and exact models.");
 const totals=d.quotes.map(q=>({documentId:q.documentId,cents:purchaseCents(q.total)}));
 return {blockers,totals: blockers.length?[]:totals as {documentId:string;cents:number}[],difference:blockers.length?null:Math.max(...totals.map(q=>q.cents!))-Math.min(...totals.map(q=>q.cents!))};
}
export function compatibilitySummary(d:PurchaseDraft){
 const mismatch=d.checks.some(c=>c.result==="mismatch");
 const incomplete=!d.existingModel.trim()||!d.candidateModel.trim()||!d.checks.length||d.checks.some(c=>!c.requirement.trim()||!c.reference.trim()||!c.excerpt.trim()||c.result==="unknown");
 return mismatch?"A recorded requirement does not match. Resolve it before buying.":incomplete?"Compatibility is unresolved. Record the exact models and check each requirement against a manufacturer manual or qualified installer’s written confirmation.":"Your recorded checks match the references you entered. This does not confirm that every required check has been covered; ask the manufacturer or installer to confirm the complete fit before buying.";
}
export function replacementComparison(d:PurchaseDraft){
 const parts=[d.repairCost,d.replacementCost,d.installationCost,d.disposalCost].map(purchaseCents);
 if(!d.costsComplete||parts.some(v=>v===null))return null;
 const [repair,product,installation,disposal]=parts as number[],replacement=product+installation+disposal;
 return {repair,replacement,difference:replacement-repair};
}
export function purchaseMoney(cents:number,currency:string){return currency+" "+(cents/100).toFixed(2);}

/** Source wording, not an AI verdict: different wording can still describe equivalent work. */
export function comparisonTopics(d:PurchaseDraft,sources:PurchaseSource[]){
 const topics=[{key:"scope",label:"Work included"},{key:"partsLabour",label:"Parts and labour"},{key:"taxes",label:"Tax and extra fees"},{key:"exclusions",label:"Exclusions"},{key:"warranty",label:"Warranty"},{key:"schedule",label:"Timing"},{key:"payment",label:"Payment terms"}] as const;
 return topics.map(topic=>{
  const entries=d.quotes.map(q=>{
   const source=sources.find(s=>s.documentId===q.documentId),current=currentPurchaseQuote(q,sources);
   const value=current?source!.fields[topic.key].trim():"";
   return {id:q.documentId,title:source?.title??"Unavailable quote",value,current,needsClarification:!current||!!quoteClarificationReason(topic.key,value)};
  });
  const wordingDiffers=new Set(entries.filter(e=>e.value).map(e=>e.value.toLowerCase().replace(/\s+/g," "))).size>1;
  return {...topic,entries,wordingDiffers,question:quoteQuestionText[topic.key],needsClarification:entries.some(e=>e.needsClarification)};
 });
}

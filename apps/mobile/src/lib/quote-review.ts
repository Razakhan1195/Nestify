/** Shared, deterministic quote review. Empty means unrecorded, never excluded. */
export const quoteFields = [
 {key:"supplier",label:"Company and quote reference"},
 {key:"scope",label:"Work included"},
 {key:"partsLabour",label:"Parts and labour"},
 {key:"price",label:"Quoted price and currency"},
 {key:"taxes",label:"Taxes and other charges"},
 {key:"exclusions",label:"Exclusions and allowances"},
 {key:"schedule",label:"Timing and quote expiry"},
 {key:"payment",label:"Deposit and payment terms"},
 {key:"warranty",label:"Workmanship and parts warranty"},
] as const;
export type QuoteKey = typeof quoteFields[number]["key"];
export type QuoteFields = Record<QuoteKey,string>;
export type QuoteDecision = "considering" | "questions" | "proceed" | "declined";
export const quoteDecisions:Record<QuoteDecision,string>={considering:"Still considering",questions:"Waiting for answers",proceed:"Planning to proceed",declined:"Not proceeding"};
export type QuoteDraft = {fields:QuoteFields;answers:Partial<Record<string,string>>;decision:QuoteDecision;decisionNote:string;context:"owner"|"tenant";reviewed:boolean;itemId:string|null;issueId:string|null;invoiceId:string|null};
export type QuoteFact={key:QuoteKey;value:string;excerpt:string;page:number|null;citations?:{excerpt:string;page:number|null}[]};
export const emptyQuote = ():QuoteDraft=>({fields:Object.fromEntries(quoteFields.map(f=>[f.key,""])) as QuoteFields,answers:{},decision:"considering",decisionNote:"",context:"owner",reviewed:false,itemId:null,issueId:null,invoiceId:null});
export const quoteQuestionText:Record<string,string>={
 scope:"Can you list the exact work, quantities and finish or cleanup included?",
 partsLabour:"Which parts or exact models and labour are included? Are substitutions allowed?",
 price:"What is the total price and currency? Is it fixed or an estimate?",
 taxes:"Does the quoted total include tax, travel, delivery, disposal and other fees?",
 exclusions:"What is excluded or covered by an allowance, and how would extra work be priced and approved?",
 schedule:"When could work start and finish, and how long is this quote valid?",
 payment:"What deposit is required, when are later payments due, and what happens if the work changes?",
 warranty:"What parts and workmanship are covered, for how long, and who handles a problem?",
 tenant:"What approval is needed from my landlord or building, and who will arrange and pay for the work?",
};
export function quoteClarificationReason(key:QuoteKey,value:string){
 if(!value.trim())return "missing" as const;
 const unclear=/\b(?:tbd|tba|unknown|unspecified|unconfirmed|not (?:specified|provided|listed|confirmed)|to be (?:agreed|confirmed|determined)|subject to (?:change|inspection|confirmation))\b/i.test(value);
 if(unclear||/\b(?:terms?|details?|conditions?)\s+continu(?:e|ed)\b|\b(?:see|refer to)\s+(?:(?:the|attached)\s+)?(?:page|appendix|attachment|terms|conditions)\b/i.test(value))return "unresolved" as const;
 if(key==="partsLabour"&&/\b(?:parts? (?:additional|extra)|allowance|labou?r only)\b/i.test(value))return "unresolved" as const;
 if(key==="exclusions"&&/\ballowance\b/i.test(value)&&!/\bno allowances?\b/i.test(value))return "unresolved" as const;
 if(key==="taxes"&&/\b(?:before tax|plus tax|tax(?:es)? (?:extra|additional|excluded)|excluding tax|exclusive of tax)\b/i.test(value))return "unresolved" as const;
 if(key==="price"){
  const amounts=Array.from(value.matchAll(/\b(subtotal|(?:grand\s+)?total)\b\s*[:=]?\s*(?:(?:CAD|USD|EUR|GBP)\s*|\$)?(\d[\d,]*(?:\.\d{1,2})?)/gi),m=>({subtotal:m[1].toLowerCase()==="subtotal",amount:Number(m[2].replace(/,/g,""))}));
  const totals=amounts.filter(v=>!v.subtotal).map(v=>v.amount),subtotals=amounts.filter(v=>v.subtotal).map(v=>v.amount);
  if((subtotals.length&&!totals.length)||new Set(totals).size>1||(totals.length&&subtotals.length&&Math.min(...totals)<Math.max(...subtotals)))return "unresolved" as const;

  const currency=/\b(?:CAD|USD|EUR|GBP|AUD|NZD|JPY|CHF|INR|CNY|HKD|SGD|PKR)\b|C\$|US\$|€|£/i.test(value);
  if(!currency||/\+\s*(?:tax|HST|GST)/i.test(value)||/\bestimat(?:e|ed)|\b(?:before tax|plus tax|excluding tax|subject to)\b/i.test(value)||(/\blabou?r\b/i.test(value)&&!/\btotal\b/i.test(value)))return "unresolved" as const;
 }
 return null;
}
export function quoteQuestions(draft:QuoteDraft){
 const keys=["scope","price","taxes","partsLabour","exclusions","schedule","payment","warranty"] as QuoteKey[];
 const questions:{key:QuoteKey|"tenant";question:string;reason:string}[]=[];
 for(const key of keys){
  const value=draft.fields[key]??"",reason=quoteClarificationReason(key,value);
  if(reason)questions.push({key,question:quoteQuestionText[key],reason:reason==="missing"?quoteFields.find(f=>f.key===key)!.label+" is not recorded in this review. Check the original before asking.":"The recorded wording still leaves something to confirm: “"+value.slice(0,180)+"”. Check this with the company before agreeing."});
 }
 if(draft.context==="tenant")questions.unshift({key:"tenant",question:quoteQuestionText.tenant,reason:"Confirm responsibility and permission before arranging work."});
 return questions;
}
export function quoteQuestionSheet(title:string,draft:QuoteDraft){
 return [title,"Questions to clarify before agreeing to the work",...quoteQuestions(draft).map(q=>q.question+(draft.answers[q.key]?.trim()?"\nRecorded answer: "+draft.answers[q.key]!.trim():""))].join("\n\n");
}
export type QuoteReviewRow={document_id:string;revision:number;source_version:string;payload:QuoteDraft|null;read_status:"idle"|"reading"|"ready"|"failed";read_started_at:string|null;read_result:QuoteFact[]|null;last_request_id:string|null;item_id:string|null;issue_id:string|null;invoice_id:string|null};
export type QuotePayload={homeId:string;homeName:string;aiAvailable:boolean;document:{id:string;title:string;updated_at:string;hasFile:boolean;notes:string|null};review:QuoteReviewRow|null;sourceChanged:boolean;readingExpired:boolean;items:{id:string;name:string}[];issues:{id:string;title:string}[];invoices:{id:string;title:string}[];linksTruncated:boolean};
export function draftFromQuote(payload:QuotePayload):QuoteDraft{
 const r=payload.review;
 if(r?.payload)return {...r.payload,itemId:r.item_id,issueId:r.issue_id,invoiceId:r.invoice_id,decision:payload.sourceChanged?"considering":r.payload.decision,reviewed:payload.sourceChanged?false:r.payload.reviewed};
 return emptyQuote();
}
/** File excerpts remain suggestions; a text excerpt must exist verbatim in the saved source. */
export function supportedQuoteFacts(facts:QuoteFact[],sourceText?:string):QuoteFact[]{
 const seen=new Set<string>();
 return facts.filter(f=>{
  if(!f.value.trim()||!f.excerpt.trim()||seen.has(f.key))return false;
  if(sourceText!==undefined&&!sourceText.includes(f.excerpt))return false;
  seen.add(f.key);return true;
 });
}

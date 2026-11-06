import {z} from "zod";
import type {QuoteFact} from "../../../apps/mobile/src/lib/quote-review";
export const quoteTextSelectionSchema=z.object({facts:z.array(z.object({
 key:z.enum(["supplier","scope","partsLabour","price","taxes","exclusions","schedule","payment","warranty"]),
 first:z.number().int().min(1).max(100),last:z.number().int().min(1).max(100),
}).strict()).max(9)}).strict();
export type QuoteTextSegment={number:number;start:number;end:number;text:string};
/** Number original passages so the model selects evidence instead of rewriting citations. */
export function quoteTextSegments(source:string):QuoteTextSegment[]{
 const breaks=[0,...Array.from(source.matchAll(/\n+|(?<=[.!?])\s+(?=[A-Za-z0-9])/g),m=>m.index!+m[0].length),source.length];
 const segments:QuoteTextSegment[]=[];
 for(let i=0;i<breaks.length-1;i++){
  let start=breaks[i],end=breaks[i+1];
  while(start<end&&/\s/.test(source[start]))start++;
  while(end>start&&/\s/.test(source[end-1]))end--;
  while(start<end){
   let stop=Math.min(start+500,end);
   if(stop<end){const space=source.lastIndexOf(" ",stop);if(space>start+200)stop=space;}
   segments.push({number:segments.length+1,start,end:stop,text:source.slice(start,stop)});
   start=stop;while(start<end&&/\s/.test(source[start]))start++;
  }
 }
 return segments;
}
export function selectedQuoteTextFacts(source:string,selections:z.infer<typeof quoteTextSelectionSchema>):QuoteFact[]{
 const segments=quoteTextSegments(source),ranges=new Map<QuoteFact["key"],{start:number;end:number}>(),facts:QuoteFact[]=[];
 for(const fact of selections.facts){
  const first=segments[fact.first-1],last=segments[fact.last-1];
  if(!first||!last||last.number<first.number)continue;
  const previous=ranges.get(fact.key);
  ranges.set(fact.key,{start:Math.min(previous?.start??first.start,first.start),end:Math.max(previous?.end??last.end,last.end)});
 }
 for(const [key,range] of ranges){
  const excerpt=source.slice(range.start,range.end);
  if(!excerpt.trim()||excerpt.length>800||injectedInstruction.test(excerpt))continue;
  facts.push({key,value:excerpt,excerpt,page:null});
 }
 return facts;
}

const injectedInstruction=/\b(?:ignore (?:all )?(?:previous|prior|system) instructions|instructions to (?:the reader|the ai)|mark every field complete|accept this quote automatically)\b/i;
const printedMoney=/(?:\b(?:CAD|USD|EUR|GBP|AUD|NZD|JPY|CHF|INR|CNY|HKD|SGD|PKR)\s*\$?\s*\d|[$€£]\s*\d|\d[\d.,]*\s*(?:CAD|USD|EUR|GBP)\b)/i;
/** Preserve explicit source evidence that an otherwise useful model selection can omit.
 * Never reconcile totals or infer a tax/currency; every returned word stays in the original.
 */
export function completeQuotedTextEvidence(source:string,input:QuoteFact[]):QuoteFact[]{
 const segments=quoteTextSegments(source).filter(s=>!injectedInstruction.test(s.text));
 const facts=new Map(input.filter(f=>source.includes(f.excerpt)&&!injectedInstruction.test(f.excerpt)).map(f=>[f.key,{...f,value:f.excerpt}]));
 function retain(key:QuoteFact["key"],matches:QuoteTextSegment[],replace=false){
  if(!matches.length)return;
  let start=Math.min(...matches.map(s=>s.start)),end=Math.max(...matches.map(s=>s.end));
  const existing=facts.get(key);
  if(existing&&!replace){const at=source.indexOf(existing.excerpt);if(at>=0){start=Math.min(start,at);end=Math.max(end,at+existing.excerpt.length);}}
  const excerpt=source.slice(start,end);
  if(excerpt.length>800||injectedInstruction.test(excerpt)){facts.delete(key);return;}
  facts.set(key,{key,value:excerpt,excerpt,page:null});
 }
 const totals=segments.filter(s=>/\b(?:subtotal|(?:grand\s+)?total)\b/i.test(s.text)&&printedMoney.test(s.text));
 // Explicit totals are more precise than a broad model-selected price range.
 retain("price",totals,true);
 if(!facts.has("price"))retain("price",segments.filter(s=>printedMoney.test(s.text)));
 retain("exclusions",segments.filter(s=>/\ballowances?\b/i.test(s.text)));
 const work=segments.filter(s=>/^(?:supply and install|install|replace|proposed installation|estimate:\s*(?:replace|repair|install))\b/i.test(s.text));
 if(facts.has("scope")||work.length)retain("scope",[...work,...segments.filter(s=>/\b(?:removal|disposal|cleanup|clean-up)\b/i.test(s.text)&&/\bincluded\b/i.test(s.text))]);
 return Array.from(facts.values());
}

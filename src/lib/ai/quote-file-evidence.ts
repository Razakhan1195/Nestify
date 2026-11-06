import {z} from "zod";
import {quoteFields,type QuoteFact,type QuoteKey} from "../../../apps/mobile/src/lib/quote-review";

// A quote section can have separate passages on different pages. One passage
// must never pretend to be a continuous quotation from several locations.
export const quoteFileExtractionSchema=z.object({passages:z.array(z.object({
 key:z.enum(["supplier","scope","partsLabour","price","taxes","exclusions","schedule","payment","warranty"]),
 excerpt:z.string().min(1).max(800),page:z.number().int().min(1).max(500).nullable(),
}).strict()).max(36)}).strict();
export type QuoteFilePassage=z.infer<typeof quoteFileExtractionSchema>["passages"][number];
export const QUOTE_FILE_INSTRUCTION="Read every page. Return separate short, contiguous printed passages, not summaries. Repeat a key for every relevant passage, including passages on different pages. Start by collecting ALL printed subtotals, totals and allowances, including contradictory amounts, then work scope and other terms. Do not stop after the first price or exclusion. Never join separated passages into one excerpt. Do not invent bridging words. A page number belongs only to that passage. Omit text you cannot read. A blank/unreadable image returns an empty passages array. The customer will review these unverified reading suggestions against the original.";
export function fileQuoteFacts(passages:QuoteFilePassage[]):QuoteFact[]{
 const groups=new Map<QuoteKey,QuoteFilePassage[]>();
 for(const p of passages){
  if(!p.excerpt.trim())continue;
  const keys=new Set<QuoteKey>([p.key]);
  // Retain critical printed wording even if assigned to a different section.
  if(/\b(?:subtotal|(?:grand\s+)?total)\b[^\n]{0,30}\d/i.test(p.excerpt))keys.add("price");
  if(/\ballowances?\b/i.test(p.excerpt))keys.add("exclusions");
  for(const key of keys){
   const values=groups.get(key)??[];
   if(!values.some(v=>v.page===p.page&&v.excerpt===p.excerpt))values.push(p);
   groups.set(key,values);
  }
 }
 const result:QuoteFact[]=[];
 for(const {key} of quoteFields){
  const group=groups.get(key);if(!group?.length)continue;
  const citations=group.map(p=>({excerpt:p.excerpt,page:p.page}));
  const value=citations.map(p=>p.excerpt).join("\n");
  const excerpt=citations.length===1?citations[0].excerpt:citations.map(p=>(p.page?"Page "+p.page+": ":"Saved source: ")+p.excerpt).join("\n\n");
  // Never truncate a contradictory second amount to make a partial total fit.
  // Missing section falls back to the existing manual clarification question.
  if(value.length>1500||excerpt.length>800)continue;
  result.push({key,value,excerpt,page:citations.length===1?citations[0].page:null,citations});
 }
 return result;
}

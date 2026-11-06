import type {WrittenOffer} from './bill-review';
export const offerKeys=['monthly','promoMonths','afterPromo','upfront','exitFee','credit'] as const;
export type OfferKey=typeof offerKeys[number];
export type OfferReading={currency:'CAD'|'other'|'unknown';facts:Array<{key:OfferKey;value:string;excerpt:string;page:number|null}>;notes:string[];source:{kind:'text'|'file';name:string}};
export function parseOfferReading(input:unknown):OfferReading|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const v=input as OfferReading;
 if(!['CAD','other','unknown'].includes(v.currency)||!Array.isArray(v.facts)||v.facts.length>6||!Array.isArray(v.notes)||v.notes.length>6||v.notes.some(n=>typeof n!=='string'||n.length>500)||!v.source||!['text','file'].includes(v.source.kind)||typeof v.source.name!=='string'||v.source.name.length>250)return null;
 const seen=new Set<string>();
 for(const f of v.facts){
  if(!f||!offerKeys.includes(f.key)||seen.has(f.key)||typeof f.value!=='string'||!/^\d{1,7}(\.\d{1,2})?$/.test(f.value)||typeof f.excerpt!=='string'||!f.excerpt.trim()||f.excerpt.length>800||f.page!==null&&(!Number.isInteger(f.page)||f.page<1||f.page>500))return null;
  if(f.key==='promoMonths'&&(!/^\d{1,2}$/.test(f.value)||Number(f.value)>36))return null;
  seen.add(f.key);
 }
 return {currency:v.currency,facts:v.facts.map(f=>({key:f.key,value:f.value,excerpt:f.excerpt,page:f.page})),notes:v.notes,source:{kind:v.source.kind,name:v.source.name}};
}
export function mergeOfferReading(offer:WrittenOffer,reading:OfferReading):WrittenOffer{
 const next={...offer};if(reading.currency!=='CAD')return next;
 for(const fact of reading.facts)if(next[fact.key]==='')next[fact.key]=fact.value;
 return next;
}
export function validOfferSources(value:unknown):value is Array<OfferReading|null>{return Array.isArray(value)&&value.length===2&&value.every(v=>v===null||parseOfferReading(v)!==null);}

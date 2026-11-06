import {suggestedEnergyEvidence,type EnergyEvidence} from "./energy-evidence";
import {evidenceDefaults,evidenceError,moneyFields,type StatementEvidence} from "./statement-evidence";
export type StatementSuggestions={fields:StatementEvidence;quotes:Partial<Record<keyof StatementEvidence,string>>;notes:string[];energy?:EnergyEvidence};
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const text=(v:unknown,max:number)=>typeof v==="string"?v.slice(0,max):"";
export function statementEvidenceSuggestions(raw:unknown,period:{periodStart:string|null;periodEnd:string|null}):StatementSuggestions {
 const data=object(raw),fields={...evidenceDefaults},quotes:StatementSuggestions["quotes"]={};
 let energy:EnergyEvidence|null=null;
 const notes:string[]=[];
 const result=()=>({fields,quotes,notes:notes.slice(0,6),...(energy?{energy}:{})});
 if(!data||data.documentKind!=="statement"){notes.push("This was not clearly one statement. Review the original and enter the supporting details yourself.");return result();}
 if((data.periodStart&&data.periodStart!==period.periodStart)||(data.periodEnd&&data.periodEnd!==period.periodEnd)){notes.push("The service dates read from the original do not match this saved statement. Check the original and saved period before using any details.");return result();}
 if(!data.periodStart||!data.periodEnd)notes.push("The service dates could not be confirmed. Check that this original belongs to the saved period.");
 energy=suggestedEnergyEvidence(data.energy,data.currency);
 const source=object(data.fields);
 for(const key of Object.keys(fields) as Array<keyof StatementEvidence>){
  const item=object(source?.[key]),value=text(item?.value,121),quote=text(item?.quote,160).trim();
  if(!value||value.length>120||!quote)continue;
  if((moneyFields as readonly string[]).includes(key)&&data.currency!=="CAD")continue;
  fields[key]=value;quotes[key]=quote;
 }
 if(data.currency!=="CAD")notes.push("Canadian dollars were not explicitly confirmed. Monetary suggestions were left blank.");
 // Validate each atomic field, then the usage/unit pair. Never partially accept
 // a quantity without units or silently transform a magnitude.
 for(const key of Object.keys(fields) as Array<keyof StatementEvidence>){
  if(key==="usage"||key==="unit")continue;
  if(evidenceError({...evidenceDefaults,[key]:fields[key]})){fields[key]="";delete quotes[key];notes.push("One printed detail needs manual review.");}
 }
 if(!["kWh","m³","GJ","L"].includes(fields.unit)||evidenceError({...evidenceDefaults,usage:fields.usage,unit:fields.unit})){
  if(fields.usage||fields.unit)notes.push("Usage could not be safely matched to a supported unit. Check the original; no unit conversion was applied.");
  fields.usage="";fields.unit="";delete quotes.usage;delete quotes.unit;
 }
 if(Array.isArray(data.notes))for(const note of data.notes.slice(0,3))if(typeof note==="string"&&note.trim())notes.push(note.slice(0,200));
 return result();
}
export function fillEmptyStatementFields(current:StatementEvidence,suggestions:StatementEvidence){
 const next={...current};
 for(const key of Object.keys(next) as Array<keyof StatementEvidence>){
  if(key==="usage"||key==="unit")continue;
  if(next[key]==="")next[key]=suggestions[key];
 }
 // A quantity and its units are inseparable; do not pair a suggestion with an
 // existing customer-entered quantity or unit.
 if(!current.usage&&!current.unit){next.usage=suggestions.usage;next.unit=suggestions.unit;}
 return next;
}

import {parseEnergyEvidence,type EnergyEvidence} from "./energy-evidence";
import { evidenceDefaults, parseEvidence, type StatementEvidence } from "./statement-evidence";
import { statementEvidenceSuggestions } from "./statement-suggestions";
export type IntakeEvidence = { fields: StatementEvidence; quotes: Partial<Record<keyof StatementEvidence,string>>; edited?: Array<keyof StatementEvidence>; energy?:EnergyEvidence; energyEdited?:boolean };
export const emptyIntakeEvidence = (): IntakeEvidence => ({ fields: {...evidenceDefaults}, quotes: {} });
export function parseIntakeEvidence(value: unknown, draft = false): IntakeEvidence | null {
 if(!value || typeof value!=="object" || Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 const raw=v.fields;
 const draftFields=raw&&typeof raw==="object"&&!Array.isArray(raw)&&Object.keys(raw).length===Object.keys(evidenceDefaults).length&&Object.keys(evidenceDefaults).every(k=>typeof (raw as Record<string,unknown>)[k]==="string"&&((raw as Record<string,string>)[k]).length<=120)?raw as StatementEvidence:null;
 const fields=draft?draftFields:parseEvidence(raw);
 if(!fields||Object.keys(v).some(k=>!["fields","quotes","edited","energy","energyEdited"].includes(k))||!v.quotes||typeof v.quotes!=="object"||Array.isArray(v.quotes))return null;
 const quotes: IntakeEvidence["quotes"]={};
 for(const [key,quote] of Object.entries(v.quotes)){
  if(!(Object.hasOwn(evidenceDefaults,key))||typeof quote!=="string"||!quote.trim()||quote.length>160||!fields[key as keyof StatementEvidence])return null;
  quotes[key as keyof StatementEvidence]=quote;
 }
 if(v.edited!==undefined&&(!Array.isArray(v.edited)||v.edited.length>Object.keys(evidenceDefaults).length||v.edited.some(k=>typeof k!=="string"||!(Object.hasOwn(evidenceDefaults,k)))))return null;
 const energy=v.energy===undefined?undefined:parseEnergyEvidence(v.energy,draft);
 if(energy===null||(v.energyEdited!==undefined&&typeof v.energyEdited!=="boolean"))return null;
 return {fields,quotes,...(energy?{energy}:{}),...(v.energyEdited!==undefined?{energyEdited:v.energyEdited as boolean}:{}),...(v.edited?{edited:[...new Set(v.edited as Array<keyof StatementEvidence>)]}:{})};
}
export function extractedIntakeEvidence(raw:Record<string,unknown>): IntakeEvidence {
 if(!raw.supporting_details&&!raw.supporting_energy)return emptyIntakeEvidence();
 const result=statementEvidenceSuggestions({documentKind:raw.document_kind,currency:raw.currency,periodStart:raw.billing_period_start,periodEnd:raw.billing_period_end,fields:raw.supporting_details,energy:raw.supporting_energy},
  {periodStart:typeof raw.billing_period_start==="string"?raw.billing_period_start:null,periodEnd:typeof raw.billing_period_end==="string"?raw.billing_period_end:null});
 return {fields:result.fields,quotes:result.quotes,...(result.energy?{energy:result.energy}:{})};
}
export function editIntakeEvidence(current:IntakeEvidence,key:keyof StatementEvidence,value:string):IntakeEvidence {
 const quotes={...current.quotes};delete quotes[key];
 return {...current,fields:{...current.fields,[key]:value},quotes,edited:[...new Set([...(current.edited??[]),key])]};
}
export function mergeIntakeEvidence(current:IntakeEvidence,next:IntakeEvidence):IntakeEvidence {
 const result:IntakeEvidence={...current,fields:{...current.fields},quotes:{...current.quotes},edited:current.edited};
 const edited=new Set(current.edited??[]);
 for(const key of Object.keys(evidenceDefaults) as Array<keyof StatementEvidence>){
  if(edited.has(key)||current.fields[key])continue;
  if((key==="usage"||key==="unit")&&(current.fields.usage||current.fields.unit||edited.has("usage")||edited.has("unit")))continue;
  result.fields[key]=next.fields[key];if(next.quotes[key])result.quotes[key]=next.quotes[key];
 }
 if(!current.energy&&!current.energyEdited&&next.energy)result.energy=next.energy;
 return result;
}
export const hasIntakeEvidence=(v:IntakeEvidence|undefined)=>Boolean(v&&(Object.values(v.fields).some(Boolean)||v.energy!==undefined));
export function intakeEvidencePayload(v:IntakeEvidence|undefined){
 if(!hasIntakeEvidence(v))return undefined;
 const parsed=parseIntakeEvidence(v);if(!parsed)throw Error("Check the supporting details before saving.");
 return {fields:parsed.fields,quotes:parsed.quotes,...(parsed.energy?{energy:parsed.energy}:{})};
}

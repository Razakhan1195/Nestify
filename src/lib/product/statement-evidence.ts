import {parseEnergyEvidence,type EnergyEvidence} from "../../../apps/mobile/src/lib/energy-evidence";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evidenceDefaults, parseEvidence, type StatementEvidence } from "../../../apps/mobile/src/lib/statement-evidence";
type Context={supabase:SupabaseClient;userId:string;homeId:string};
const columns="id,name,amount,currency,billing_period_start,billing_period_end,source,status,raw_data,updated_at,original_document_id,custom_provider_name,account_number_masked";
function basis(b:{amount:number|null;billing_period_start:string|null;billing_period_end:string|null;custom_provider_name:string|null;account_number_masked:string|null;raw_data:Record<string,unknown>}){
 return {amount:b.amount,start:b.billing_period_start,end:b.billing_period_end,provider:b.custom_provider_name,account:b.account_number_masked,category:b.raw_data.category};
}
export function currentReviewedEvidence(b:{source:string|null;status:string;currency:string;amount:number|null;billing_period_start:string|null;billing_period_end:string|null;custom_provider_name:string|null;account_number_masked:string|null;raw_data:unknown}):StatementEvidence|null{
 const raw=b.raw_data&&typeof b.raw_data==="object"&&!Array.isArray(b.raw_data)?b.raw_data as Record<string,unknown>:null;
 if(!raw||b.source!=="manual"||b.status!=="archived"||b.currency!=="CAD"||raw.record_kind!=="historical"||raw.amount_basis!=="period_charges"||typeof raw.statement_evidence_reviewed_at!=="string"||!Number.isFinite(Date.parse(raw.statement_evidence_reviewed_at)))return null;
 const expected=basis({...b,raw_data:raw});
 if(Object.entries(expected).some(([key,value])=>(raw.statement_evidence_basis as Record<string,unknown>|undefined)?.[key]!==value))return null;
 return parseEvidence(raw.statement_evidence);
}
export function currentReviewedEnergyEvidence(b:Parameters<typeof currentReviewedEvidence>[0]):EnergyEvidence|null{
 if(!currentReviewedEvidence(b))return null;
 const raw=b.raw_data as Record<string,unknown>;
 if(typeof raw.statement_energy_reviewed_at!=="string"||!Number.isFinite(Date.parse(raw.statement_energy_reviewed_at)))return null;
 if(Object.entries(basis({...b,raw_data:raw})).some(([key,value])=>(raw.statement_energy_basis as Record<string,unknown>|undefined)?.[key]!==value))return null;
 return parseEnergyEvidence(raw.statement_energy_evidence);
}
export async function loadStatementEvidence(ctx:Context,id:string){
 const result=await ctx.supabase.from("bills").select(columns).eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
 if(result.error)return {error:"Could not load this statement. Try again.",status:503} as const;
 const b=result.data;
 if(!b)return {error:"That statement is unavailable.",status:404} as const;
 if(b.source!=="manual"||b.status!=="archived"||b.currency!=="CAD"||b.raw_data?.record_kind!=="historical"||b.raw_data?.amount_basis!=="period_charges")return {error:"Choose a reviewed manual statement from History.",status:409} as const;
 const raw=b.raw_data as Record<string,unknown>;
 return {bill:b,raw,payload:{id:b.id,title:b.name,amount:b.amount,category:typeof raw.category==="string"?raw.category:"Other",periodStart:b.billing_period_start,periodEnd:b.billing_period_end,version:b.updated_at,needsReview:Boolean(raw.statement_evidence)&&Object.entries(basis(b)).some(([key,value])=>(raw.statement_evidence_basis as Record<string,unknown>|undefined)?.[key]!==value),hasOriginal:Boolean(b.original_document_id),energy:parseEnergyEvidence(raw.statement_energy_evidence),energyNeedsReview:Boolean(raw.statement_energy_evidence)&&!currentReviewedEnergyEvidence(b),fields:parseEvidence(raw.statement_evidence)??{...evidenceDefaults},reviewedAt:typeof raw.statement_evidence_reviewed_at==="string"?raw.statement_evidence_reviewed_at:null}};
}
export async function saveStatementEvidence(ctx:Context,id:string,version:string,fields:StatementEvidence,energy?:EnergyEvidence|null){
 const state=await loadStatementEvidence(ctx,id);
 if("error" in state)return state;
 if(state.bill.updated_at!==version)return {error:"This statement changed. Reload it before saving your corrections.",status:409} as const;
 const stamp=new Date().toISOString();
 const {data,error}=await ctx.supabase.from("bills").update({raw_data:{...state.raw,...(energy!==undefined?{statement_energy_evidence:energy,statement_energy_reviewed_at:stamp,statement_energy_basis:basis(state.bill)}:{}),statement_evidence:fields,statement_evidence_quotes:{},statement_evidence_source:"manual_review",statement_evidence_reviewed_at:stamp,statement_evidence_basis:basis(state.bill),save_signature:null}})
 .eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).eq("updated_at",version).eq("source","manual").eq("status","archived").select("updated_at").maybeSingle();
 if(error)return {error:"Could not confirm these details were saved. Reload to check before retrying.",status:503} as const;
 if(!data)return {error:"This statement changed. Reload it before saving your corrections.",status:409} as const;
 return {payload:{...state.payload,...(energy!==undefined?{energy,energyNeedsReview:false}:{}),fields,reviewedAt:stamp,needsReview:false,version:data.updated_at}};
}

import type {SupabaseClient} from '@supabase/supabase-js';
import {billReviewBaseline} from './bill-review';
import {loadStatementEvidence} from './statement-evidence';
import {billReview,reviewStatuses,validOfferDrafts,type BillReviewAction,type BillReviewSummary} from '../../../apps/mobile/src/lib/bill-review';
import {evidenceDefaults} from '../../../apps/mobile/src/lib/statement-evidence';
import {validOfferSources} from '../../../apps/mobile/src/lib/offer-reading';
import {outcomeStatement} from './bill-outcome';
type Context={supabase:SupabaseClient;userId:string;homeId:string};
export const reviewBillColumns='id,name,amount,currency,billing_period_start,billing_period_end,source,status,raw_data,updated_at,original_document_id,custom_provider_name,account_number_masked,provider_id,usage_amount,usage_unit';
export function connectedReviewEligible(b:{source:string|null;currency:string;status:string;provider_id?:string|null}){return ['deck','ezgb'].includes(b.source??'')&&b.currency==='CAD'&&!['draft','incomplete'].includes(b.status)&&Boolean(b.provider_id);}
export function reviewAction(value:unknown):BillReviewAction|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const a=value as BillReviewAction;
 return typeof a.draft==='string'&&a.draft.length<=6000&&typeof a.notes==='string'&&a.notes.length<=2000&&reviewStatuses.includes(a.status)&&typeof a.baseline==='string'&&typeof a.savedAt==='string'&&Number.isFinite(Date.parse(a.savedAt))?{draft:a.draft,notes:a.notes,status:a.status,baseline:a.baseline,savedAt:a.savedAt}:null;
}
export function connectedReviewSummary(b:Parameters<typeof billReviewBaseline>[0],stored:unknown):BillReviewSummary|null{
 if(!stored||typeof stored!=='object'||Array.isArray(stored))return null;const raw=stored as Record<string,unknown>,a=reviewAction(raw.bill_review_action);
 if(a)return{status:a.status,savedAt:a.savedAt,needsReview:a.baseline!==billReviewBaseline(b)};
 if(validOfferDrafts(raw.bill_review_offers)&&raw.bill_review_offers.some(o=>Object.entries(o).some(([k,v])=>k!=='months'&&v!=='')))return{status:'offers',savedAt:typeof raw.bill_review_offers_saved_at==='string'?raw.bill_review_offers_saved_at:'',needsReview:false};return null;
}
export async function loadBillReview(ctx:Context,id:string){
 const r=await ctx.supabase.from('bills').select(reviewBillColumns).eq('id',id).eq('user_id',ctx.userId).eq('home_id',ctx.homeId).maybeSingle();
 if(r.error)return{error:'Could not load this statement. Try again.',status:503} as const;
 if(!r.data)return{error:'That statement is unavailable.',status:404} as const;
 const b=r.data;
 if(b.source==='manual'){
  const manual=await loadStatementEvidence(ctx,id);if('error'in manual)return {error:manual.error??'Could not load this statement.',status:manual.status??503} as const;
  return {...manual,connected:false,revision:0,payload:{...manual.payload,source:'manual',providerId:null as string|null,canReviewEvidence:true,outcomeKind:outcomeStatement(b)?.kind??null}};
 }
 if(!['deck','ezgb'].includes(b.source??''))return{error:'This saved bill is not available for an enquiry. You can still view its details.',status:409} as const;
 const saved=await ctx.supabase.from('connected_bill_reviews').select('revision,review').eq('bill_id',id).eq('user_id',ctx.userId).eq('home_id',ctx.homeId).maybeSingle();
 if(saved.error)return{error:'Could not load the saved enquiry. Try again before starting another.',status:503} as const;
 if(!connectedReviewEligible(b)&&!saved.data)return{error:'This bill is not available for a new enquiry.',status:409} as const;
 const raw=saved.data?.review&&typeof saved.data.review==='object'?saved.data.review as Record<string,unknown>:{};
 const imported=b.raw_data&&typeof b.raw_data==='object'?b.raw_data as Record<string,unknown>:{};
 const category=typeof imported.category==='string'?imported.category:'Other',revision=saved.data?.revision??0;
 return {bill:b,raw,connected:true,revision,payload:{id:b.id,title:b.name,amount:b.amount,category,periodStart:b.billing_period_start,periodEnd:b.billing_period_end,version:b.updated_at+'|'+revision,needsReview:false,hasOriginal:Boolean(b.original_document_id),energy:null,energyNeedsReview:false,fields:{...evidenceDefaults},reviewedAt:null,source:b.source,providerId:b.provider_id,canReviewEvidence:false,readOnly:!connectedReviewEligible(b),outcomeKind:outcomeStatement(b)?.kind??null}};
}
export function connectedBillAnalysis(context:Parameters<typeof billReview>[0]){
 const base=billReview(context,null);
 return {...base,headline:'Your saved bill, ready to discuss',facts:[],checks:[],coverage:'This connection provides saved bill information. The full charge breakdown has not been verified here; the total may include balances or credits.',next:'Check the original statement before questioning a charge.'};
}
export function offerSources(raw:Record<string,unknown>){return validOfferSources(raw.bill_review_offer_sources)?raw.bill_review_offer_sources:[null,null];}

import {createHash} from "node:crypto";
import {currentReviewedEvidence} from "./statement-evidence";
import {reviewStatuses,validOfferDrafts,type BillReviewSummary} from "../../../apps/mobile/src/lib/bill-review";
type ReviewBill=Parameters<typeof currentReviewedEvidence>[0];
function rawOf(b:ReviewBill):Record<string,unknown>{
 return b.raw_data&&typeof b.raw_data==="object"&&!Array.isArray(b.raw_data)?b.raw_data as Record<string,unknown>:{};
}
export function billReviewBaseline(b:ReviewBill){
 const raw=rawOf(b);
 // Preserve the existing fingerprint contract so deploying this helper does not
 // falsely invalidate saved reviews.
 return createHash("sha256").update(JSON.stringify({amount:b.amount,currency:b.currency,start:b.billing_period_start,end:b.billing_period_end,provider:b.custom_provider_name,account:b.account_number_masked,category:typeof raw.category==="string"?raw.category:"Other",evidence:currentReviewedEvidence(b)})).digest("hex");
}
export function billReviewSummary(b:ReviewBill):BillReviewSummary|null{
 const raw=rawOf(b);
 if(b.source!=="manual"||b.status!=="archived"||b.currency!=="CAD"||raw.record_kind!=="historical"||raw.amount_basis!=="period_charges")return null;
 const action=raw.bill_review_action;
 if(action&&typeof action==="object"&&!Array.isArray(action)){
  const a=action as Record<string,unknown>;
  if(typeof a.status==="string"&&reviewStatuses.some(s=>s===a.status)&&typeof a.baseline==="string"&&typeof a.savedAt==="string"&&Number.isFinite(Date.parse(a.savedAt))){
   return {status:a.status as BillReviewSummary["status"],savedAt:a.savedAt,needsReview:a.baseline!==billReviewBaseline(b)};
  }
 }
 const offers=raw.bill_review_offers;
 if(validOfferDrafts(offers)&&offers.some(offer=>Object.entries(offer).some(([key,value])=>key!=="months"&&value!=="")))
  return {status:"offers",savedAt:typeof raw.bill_review_offers_saved_at==="string"?raw.bill_review_offers_saved_at:"",needsReview:false};
 return null;
}

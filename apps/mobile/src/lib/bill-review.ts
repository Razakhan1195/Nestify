import { evidenceDefaults, explainStatement, moneyCents, type StatementEvidence } from "./statement-evidence";

export const reviewStatuses = ["planned", "contacted", "awaiting_evidence", "resolved", "unsuccessful", "abandoned"] as const;
export type ReviewStatus = typeof reviewStatuses[number];
export const statusLabels: Record<ReviewStatus,string> = {
 planned:"Planned",contacted:"Contacted provider",awaiting_evidence:"Waiting for another bill",
 resolved:"Resolved — reported by you",unsuccessful:"Not resolved",abandoned:"No longer pursuing",
};
export type BillReviewAction = { draft:string; notes:string; status:ReviewStatus; baseline:string; savedAt:string };
export type BillReviewContext = { title:string; amount:number|null; category:string; periodStart:string|null; periodEnd:string|null };
export function billReview(context:BillReviewContext, evidence:StatementEvidence|null) {
 const explained=explainStatement(context,evidence??evidenceDefaults);
 const hasFinding=explained.differenceCents!==null&&explained.differenceCents!==0;
 // A missing field, estimated reading or generic negotiation opportunity is not
 // evidence of overpayment. A discrepancy first requires checking the original.
 return {...explained,
  hasFinding,
  checks:hasFinding?explained.checks.filter(check=>check.startsWith("The entered breakdown differs")):[],
  headline:hasFinding?"Check the saved charge breakdown":"No overpayment issue identified",
  next:hasFinding?"Compare the saved breakdown with the original statement before treating the difference as a billing error.":"No action is needed from this check.",
  coverage:"Based on the saved statement details. This check does not establish whether your plan is the cheapest available.",
  draft:"",questions:[] as string[],
 };
}

export type WrittenOffer = { monthly:string; promoMonths:string; afterPromo:string; upfront:string; exitFee:string; credit:string; months:string };
export const offerDefaults:WrittenOffer={monthly:"",promoMonths:"",afterPromo:"",upfront:"",exitFee:"",credit:"",months:"12"};
// Compare a supplied written offer, not a market-price estimate. All amounts use the
// same user-confirmed tax basis. No usage-dependent electricity/gas/water estimates.
export function priceWrittenOffer(offer:WrittenOffer): {totalCents:number;months:number;averageCents:number}|null {
 const months=Number(offer.months),promo=Number(offer.promoMonths);
 if(!/^\d{1,2}$/.test(offer.months)||months<1||months>36||!/^\d{1,2}$/.test(offer.promoMonths)||promo<0||promo>36)return null;
 const monthly=moneyCents(offer.monthly),after=moneyCents(offer.afterPromo),upfront=moneyCents(offer.upfront),exit=moneyCents(offer.exitFee),credit=moneyCents(offer.credit);
 if([monthly,upfront,exit,credit].some(v=>v===null||v<0)||promo<months&&(after===null||after<0))return null;
 const totalCents=monthly!*Math.min(months,promo)+(after??0)*Math.max(0,months-promo)+upfront!+exit!-credit!;
 if(!Number.isSafeInteger(totalCents)||totalCents<0)return null;
 return {totalCents,months,averageCents:Math.round(totalCents/months)};
}

export function validOfferDrafts(value:unknown):value is WrittenOffer[]{
 return Array.isArray(value)&&value.length===2&&value.every(row=>row&&typeof row==="object"&&!Array.isArray(row)&&Object.keys(row).length===Object.keys(offerDefaults).length&&Object.keys(offerDefaults).every(key=>typeof row[key]==="string"&&row[key].length<=14&&/^[0-9.]*$/.test(row[key])));
}

export type BillReviewSummary={status:ReviewStatus|"offers";savedAt:string;needsReview:boolean};
export function isTelecomCategory(category:string){return /internet|phone|mobile|telecom/i.test(category);}
export function needsBillFollowUp(review:BillReviewSummary|null|undefined){
 if(!review)return false;
 // Closed actions stay closed, even if historical evidence changes. Their detail
 // screen still shows the changed-evidence notice without creating a new alert.
 return !["resolved","abandoned"].includes(review.status);
}
export function billFollowUpLabel(review:BillReviewSummary){
 if(review.needsReview)return "Statement changed · check your saved action";
 if(review.status==="offers")return "Continue your written-offer comparison";
 return statusLabels[review.status];
}


/** User-requested enquiry, not a claim that an error or saving was found. */
export function billEnquiryDraft(title: string, hasFinding: boolean): string {
 const subject = title.trim().slice(0, 240) || "my bill";
 return hasFinding
  ? `Hello, I have a question about ${subject}. The breakdown I saved may be incomplete or incorrect. Could you help me confirm the charges against the original statement and explain any difference?`
  : `Hello, I would like to review ${subject}. Could you explain the recurring charges, any promotional credits and when those credits end? Please also confirm whether there are other options available for my account, including any fees or changes to the terms. I would like to review the details before agreeing to a change.`;
}

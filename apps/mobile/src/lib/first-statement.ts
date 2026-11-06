import type { ExplanationBill } from "./bill-explanation";
const dayMs=86400000;
function day(value:string|null) {
 if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value);
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
export function firstStatementSummary(bill:ExplanationBill) {
 // Only reviewed manual period charges have a sufficiently explicit amount basis.
 if(!bill.isHistoricalStatement || bill.source!=="manual" || bill.currency!=="CAD")return null;
 const start=day(bill.billingPeriodStart),end=day(bill.billingPeriodEnd);
 const days=start!==null&&end!==null&&end>=start?Math.round((end-start)/dayMs)+1:null;
 const cents=bill.amount!==null&&Number.isFinite(bill.amount)?Math.round(bill.amount*100):null;
 const validMoney=cents!==null&&Number.isSafeInteger(cents)&&Math.abs(cents/100-bill.amount!)<0.000001;
 const usableDays=days!==null&&days<=366?days:null;
 const credit=validMoney&&cents!<0;
 const dailyCents=validMoney&&!credit&&usableDays!==null?Math.round(cents!/usableDays):null;
 const nextCheck=credit
  ? "Check the original for the reason for this credit. A credit is not evidence of a recurring saving or a payment you need to make."
  : bill.categoryId==="internet_phone"
  ? "Check whether a discount has an end date and whether equipment or add-ons are charged separately. These are useful details to have before asking your provider about a lower price."
  : bill.categoryId==="electricity"
  ? "Check the statement for total kWh and your rate plan. The amount alone cannot show which plan would cost less for your household."
  : bill.categoryId==="gas" || bill.categoryId==="water"
  ? "Check whether the meter reading is actual or estimated and note the usage and units. A higher amount alone does not establish a leak or a change in consumption."
  : "Check the original for one-time charges, credits and any discount end date before treating this amount as your usual cost.";
 return {days:usableDays,dailyCents,credit,nextCheck};
}

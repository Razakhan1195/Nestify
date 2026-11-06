export type ExplanationBill = {
 id:string; providerId:string|null; label:string; categoryId:string; currency:string; source:string|null;
 isHistoricalStatement?:boolean; accountNumber?:string|null; accountKey?:string|null;
 amount:number|null; billingPeriodStart:string|null; billingPeriodEnd:string|null; issueDate:string|null; dueDate:string|null;
};
type Bill = ExplanationBill;
const stamp=(bill:Bill)=>bill.billingPeriodEnd ?? bill.issueDate ?? bill.dueDate;
function valid(value:string|null): value is string {
 return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
}
export function earlierBills<T extends Bill>(bill:Bill, rows:T[]) {
 const date=stamp(bill);
 if(!valid(date)) return [];
 const normalized=(value:string|null|undefined)=>value?.trim().toLowerCase()??"";
 return rows.filter(row=>{
  // Never compare recorded period charges with an amount currently owed, or mix
  // manual histories from different accounts/sources. Missing identity is not a match.
  if (bill.source === "deck" || row.source === "deck") {
   if (bill.source !== "deck" || row.source !== "deck" || !bill.accountKey || bill.accountKey !== row.accountKey || bill.categoryId !== row.categoryId) return false;
  } else if (Boolean(bill.isHistoricalStatement)!==Boolean(row.isHistoricalStatement)) return false;
  if (bill.isHistoricalStatement && bill.source==="manual") {
   if (row.source!=="manual" || !normalized(bill.accountNumber) || normalized(row.accountNumber)!==normalized(bill.accountNumber)) return false;
  }
  if (bill.source!=="manual" && row.isHistoricalStatement && row.source==="manual") return false;
  const other=stamp(row);
  const boundary=bill.billingPeriodStart??date;
  return row.id!==bill.id && valid(other) && other<boundary && row.currency===bill.currency &&
   (bill.providerId ? row.providerId===bill.providerId : !row.providerId && normalized(row.label)===normalized(bill.label) && row.categoryId===bill.categoryId);
 }).sort((a,b)=>stamp(b)!.localeCompare(stamp(a)!)).slice(0,5);
}
export function billChange(bill:Bill, previous:Bill|null) {
 if(!previous || bill.amount===null || previous.amount===null || !Number.isFinite(bill.amount) || !Number.isFinite(previous.amount)) return null;
 const difference=bill.amount-previous.amount;
 const days=(b:Bill)=>valid(b.billingPeriodStart)&&valid(b.billingPeriodEnd)&&b.billingPeriodEnd>=b.billingPeriodStart?
 Math.round((Date.parse(b.billingPeriodEnd)-Date.parse(b.billingPeriodStart))/86400000)+1:null;
 return {difference,percent:previous.amount>0?Math.round(difference/previous.amount*100):null,currentDays:days(bill),previousDays:days(previous),previousId:previous.id};
}
export function remainingForBill(bill:{isHistoricalStatement:boolean;currentAmountDue:number|null;amount:number|null;amountPaid:number|null;status:string;paymentStatus:string|null}) {
 if(bill.isHistoricalStatement) return null;
 if(bill.status==="paid" || bill.paymentStatus==="paid") return 0;
 if(bill.currentAmountDue!==null) return bill.currentAmountDue;
 return bill.amount===null?null:Math.max(0,bill.amount-(bill.amountPaid??0));
}

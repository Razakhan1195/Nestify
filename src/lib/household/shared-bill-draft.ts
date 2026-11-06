import {parseCadCents} from "../../../apps/mobile/src/lib/shared-expense-math";
export function sharedBillDraft(bill:{name:string;custom_provider_name:string|null;amount:number|string|null;amount_paid:number|string|null;payment_date:string|null;currency:string},today:string){
 if(bill.currency!=="CAD")return null;
 const paid=bill.amount_paid===null?null:parseCadCents(String(bill.amount_paid));
 const charges=bill.amount===null?null:parseCadCents(String(bill.amount));
 const date=bill.payment_date?.slice(0,10)??"";
 return {
  title:(bill.custom_provider_name?.trim()||bill.name).slice(0,120),
  amountCents:paid??charges,
  amountBasis:paid!==null?"recorded_payment" as const:charges!==null?"bill_amount" as const:"unknown" as const,
  paymentDate:paid!==null&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today&&date>="2000-01-01"?date:"",
 };
}

export type BillRecord = {
 historical:boolean;id:string;name:string;providerName:string|null;providerId:string|null;account:string|null;source:string|null;category:string|null;
 fingerprint:string;amount:number|null;currency:string;amountBasis:string;periodStart:string|null;periodEnd:string|null;issueDate:string|null;dueDate:string|null;
 usage:number|null;unit:string|null;originalDocumentId:string|null;
};
export type BillRecordChoice={firstId:string;secondId:string;selectedId:string|null;current:boolean;other:BillRecord};
export type BillRecordPayload={enabled:boolean;bill:BillRecord;candidates:BillRecord[];choices:BillRecordChoice[];versions:Array<{id:string;recordedAt:string;snapshot:BillRecord}>;moreCandidates?:boolean;moreVersions?:boolean};
const normalized=(v:string|null|undefined)=>(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
export function possibleBillCopy(a:BillRecord,b:BillRecord){
 if(!a.historical||!b.historical||a.id===b.id||!a.periodStart||!a.periodEnd||a.periodStart!==b.periodStart||a.periodEnd!==b.periodEnd||a.currency!==b.currency)return false;
 if(!(a.providerId&&a.providerId===b.providerId)&&(!normalized(a.providerName)||normalized(a.providerName)!==normalized(b.providerName)))return false;
 const x=(a.account??"").replace(/\D/g,""),y=(b.account??"").replace(/\D/g,"");
 if(x.length>=4&&y.length>=4){if(x.length>4&&y.length>4)return x===y;return x.slice(-4)===y.slice(-4);}
 // Missing/label-only account identity is a candidate for review, never proof.
 return !a.category||!b.category||normalized(a.category)===normalized(b.category);
}
export function unresolvedBillCopies(data:BillRecordPayload){
 return data.candidates.filter(candidate=>possibleBillCopy(data.bill,candidate)&&!data.choices.some(c=>c.current&&c.other.id===candidate.id));
}
export function canCountBillOnce(a:BillRecord,b:BillRecord){return a.historical&&b.historical&&a.currency===b.currency&&Boolean(a.periodStart&&a.periodEnd)&&a.periodStart===b.periodStart&&a.periodEnd===b.periodEnd&&a.amountBasis===b.amountBasis&&["period_charges","amount_due_when_issued","statement_total"].includes(a.amountBasis);}
export function recordSource(b:BillRecord){return b.source==="ezgb"?"Green Button":b.source==="deck"?"Provider connection":b.source==="email"?"Email":b.source==="upload"?"Uploaded statement":"Saved bill";}
export function recordAmountLabel(b:Pick<BillRecord,"amountBasis">){return b.amountBasis==="period_charges"?"Period charges":b.amountBasis==="amount_due_when_issued"?"Amount due when issued":b.amountBasis==="statement_total"?"Statement total":"Recorded amount";}
export function recordMoney(b:Pick<BillRecord,"amount"|"currency">){
 if(b.amount===null||!Number.isFinite(Number(b.amount)))return "Not recorded";
 try{return new Intl.NumberFormat("en-CA",{style:"currency",currency:b.currency}).format(Number(b.amount));}catch{return String(b.amount)+" "+b.currency;}
}
export function recordChanges(before:BillRecord,after:BillRecord){
 const fields:Array<[keyof BillRecord,string]>=[["amount","Amount"],["currency","Currency"],["periodStart","Period start"],["periodEnd","Period end"],["issueDate","Issue date"],["dueDate","Due date"],["usage","Usage"],["unit","Unit"],["account","Account"],["originalDocumentId","Original"]];
 return fields.filter(([key])=>before[key]!==after[key]).map(([key,label])=>({label,before:key==="amount"?recordMoney(before):key==="originalDocumentId"?(before[key]?"Attached":"None") :String(before[key]??"Not recorded"),after:key==="amount"?recordMoney(after):key==="originalDocumentId"?(after[key]?"Attached":"None"):String(after[key]??"Not recorded")}));
}

export function recordPeriod(b:Pick<BillRecord,"periodStart"|"periodEnd">){
 const display=(value:string|null)=>{if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return "Not recorded";const date=new Date(value+"T12:00:00Z");return Number.isFinite(date.getTime())?date.toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):"Not recorded";};
 return display(b.periodStart)+" – "+display(b.periodEnd);
}

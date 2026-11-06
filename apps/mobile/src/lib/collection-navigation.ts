export type BillCollectionView="insights"|"accounts"|"shared"|"history";
export function billCollectionDestination(section?:string):BillCollectionView {
 if(section==="shared")return "shared";
 if(["accounts","overview"].includes(section??""))return "accounts";
 if(["bills","history","statements"].includes(section??""))return "history";
 return "insights";
}
export function isHistoryDestination(section?:string){return section==="statements";}
type BillRecord={id:string;isHistoricalStatement:boolean;status:string;billingPeriodEnd:string|null;issueDate:string|null;dueDate:string|null};
export function collectionBillRecords<T extends BillRecord>(bills:T[],filter:string,matches:(bill:T)=>boolean):T[]{
 return bills.filter(bill=>matches(bill)&&(filter==="all"||(filter==="archived"?bill.isHistoricalStatement:!bill.isHistoricalStatement&&bill.status===filter)))
  .sort((a,b)=>(b.billingPeriodEnd??b.issueDate??b.dueDate??"").localeCompare(a.billingPeriodEnd??a.issueDate??a.dueDate??"")||a.id.localeCompare(b.id));
}

export type VaultCollectionView="documents"|"items"|"warranties";
type Document={category:string;title:string;notes:string|null};
type Item={name:string;brand:string|null;model_number:string|null;room_or_area:string|null;warranty_expires_on:string|null};
export function vaultCollectionRows<D extends Document,I extends Item>(documents:D[],items:I[],view:VaultCollectionView,query:string){
 const needle=query.trim().toLowerCase();
 return {
  documents:view==="items"?[]:documents.filter(d=>(view!=="warranties"||d.category==="Warranty")&&[d.title,d.category,d.notes].join(" ").toLowerCase().includes(needle)),
  items:view==="documents"?[]:items.filter(i=>(view!=="warranties"||Boolean(i.warranty_expires_on))&&[i.name,i.brand,i.model_number,i.room_or_area].join(" ").toLowerCase().includes(needle)),
 };
}
export function selectedInsightAccount<T extends {key:string}>(accounts:T[],key:string|null):T|null{
 return (key===null?accounts[0]:accounts.find(account=>account.key===key))??null;
}

export function savedBillDestination(id:string,historical:boolean,confirmed=true){
 return historical
  ? {pathname:"/bill/history-insights" as const,params:{billId:id,...(confirmed?{saved:"1"}:{})}}
  : {pathname:"/bill/[id]" as const,params:{id,...(confirmed?{saved:"1"}:{})}};
}


// Legacy tab links must wait for household access, and must be consumed before
// pushing the history route so returning cannot open it again.
export function openLegacyBillHistory(
 router:{setParams:(params:{section:string})=>void;push:(href:{pathname:"/bill/statements";params:{section:string}})=>void},
 section:string|undefined,
 access:"loading"|"private"|"shared-only"|"onboarding",
 historyOnly=false,
){
 if(historyOnly||access!=="private"||billCollectionDestination(section)!=="history")return false;
 router.setParams({section:"accounts"});
 router.push({pathname:"/bill/statements",params:{section:isHistoryDestination(section)?"statements":"history"}});
 return true;
}

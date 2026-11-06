import type {ReceiptFields,ReceiptBatchItem} from "./receipt-batch-core";
const text=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
const date=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:"";
export function receiptSuggestions(data:Record<string,unknown>) {
 if(data.document_kind!=="receipt")return null;
 const merchant=text(data.merchant,160);
 const amount=typeof data.total==="number"&&Number.isFinite(data.total)&&/^-?\d{1,10}(?:\.\d{1,2})?$/.test(String(data.total))?data.total.toFixed(2):null;
 const currency=typeof data.currency==="string"&&/^[A-Z]{3}$/.test(data.currency)?data.currency:null;
 const items=Array.isArray(data.items)?data.items.slice(0,20).flatMap(item=>{
  if(!item||typeof item!=="object")return [];
  const description=text(item.description,160),model=text(item.model,100);
  return description?[description+(model?" · Model: "+model:"")]:[];
 }):[];
 const warranty=text(data.warranty_text,300);
 const notes=[
  merchant?"Merchant: "+merchant:null,
  amount!==null?"Printed total: "+amount+(currency?" "+currency:" (currency not confirmed)"):null,
  ...items.map(item=>"Item: "+item),
  data.items_incomplete===true?"Some items were not captured. Check the original.":null,
  warranty?"Printed warranty terms (verify with issuer): "+warranty:null,
  "Saved receipt details do not establish payment status or warranty eligibility.",
 ].filter(Boolean).join("\n");
 return {
  title:merchant?merchant+" receipt":"Purchase receipt",category:"Receipt",issued_on:date(data.purchase_date),expires_on:"",notes:notes.slice(0,5000),
  reviewNotes:Array.isArray(data.review_notes)?data.review_notes.map(v=>text(v,200)).filter(Boolean).slice(0,3):[],
 };
}

/** Reading may fill blanks, but never replace details the customer already reviewed. */
export function mergeReceiptSuggestions(current:ReceiptFields,suggested:ReceiptFields,originalName:string):ReceiptFields {
 const filenameTitle=originalName.replace(/\.[^.]+$/,"").slice(0,200);
 return {...current,title:!current.title.trim()||current.title===filenameTitle?suggested.title:current.title,
  issued_on:current.issued_on||suggested.issued_on,notes:current.notes.trim()?current.notes:suggested.notes};
}
export function receiptReadLabel(item:ReceiptBatchItem){
 if(item.status!=="review")return ({submitting:"Check save status",needs_file:"Original needed",saved:"Saved",duplicate:"Already in Vault",blocked:"Needs review",skipped:"Skipped"})[item.status];
 if(item.readState==="reading")return "Reading interrupted · retry when ready";
 if(item.readState==="failed")return "Reading needs attention";
 if(item.readAttempted&&!item.readState)return "Review saved details";
 return item.readState==="complete"?"Ready to review":"Waiting to read";
}

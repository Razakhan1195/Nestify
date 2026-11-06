export function normalizeBarcode(value: unknown): string | null {
 if(typeof value!=="string")return null;
 const code=value.replace(/[\s-]/g,"");
 if(!/^(\d{12}|\d{13})$/.test(code))return null;
 let sum=0;
 for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight;
 if((10-sum%10)%10!==Number(code.at(-1)))return null;
 return code.length===13&&code.startsWith("0")?code.slice(1):code;
}
export type ProductSuggestion={name:string;brand:string;model_number:string;product_barcode:string};
export function productSuggestions(body:unknown,barcode:string):ProductSuggestion[] {
 if(!body||typeof body!=="object"||!("items" in body)||!Array.isArray(body.items))return [];
 const clean=(v:unknown)=>typeof v==="string"?v.replace(/<[^>]*>/g,"").trim().slice(0,200):"";
 const result:ProductSuggestion[]=[];
 for(const item of body.items.slice(0,20)){
  if(!item||typeof item!=="object")continue;
  if(![item.upc,item.ean].some(c=>normalizeBarcode(c)===barcode))continue;
  const name=clean(item.title);if(!name)continue;
  const model=clean(item.model);
  const suggestion={name,brand:clean(item.brand),model_number:normalizeBarcode(model)===barcode?"":model,product_barcode:barcode};
  if(!result.some(r=>r.name===name&&r.brand===suggestion.brand&&r.model_number===suggestion.model_number))result.push(suggestion);
 }
 return result.slice(0,5);
}

export type InventoryFields={name:string;brand:string;model_number:string;serial_number:string;room_or_area:string;category:string;product_barcode:string;warranty_expires_on:string};
export type InventoryCreateIntent={requestId:string;homeId:string;fields:InventoryFields};
type Storage={getItemAsync:(key:string)=>Promise<string|null>;setItemAsync:(key:string,value:string)=>Promise<unknown>;deleteItemAsync:(key:string)=>Promise<unknown>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fieldNames=["name","brand","model_number","serial_number","room_or_area","category","product_barcode","warranty_expires_on"];
function validFields(value:unknown):value is InventoryFields{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const fields=value as Record<string,unknown>;
 return Object.keys(fields).length===fieldNames.length&&fieldNames.every(k=>typeof fields[k]==="string"&&(fields[k] as string).length<=200)&&typeof fields.name==="string"&&fields.name.trim().length>0;
}
export function createInventoryIntentStore(storage:Storage){
 let queue:Promise<unknown>=Promise.resolve();
 const key=(user:string)=>{if(!uuid.test(user))throw Error("Sign in to restore your save.");return "inventory-create-"+user;};
 function exclusive<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;}
 async function load(user:string):Promise<InventoryCreateIntent|null>{
  const k=key(user),pointer=await storage.getItemAsync(k);if(!pointer)return null;
  const p=JSON.parse(pointer);
  if(!uuid.test(p.requestId)||!Number.isInteger(p.count)||p.count<1||p.count>30)throw Error("Could not restore the previous save. Check Vault before adding another copy.");
  let raw="";for(let i=0;i<p.count;i++){const part=await storage.getItemAsync(k+"-"+p.requestId+"-"+i);if(part===null)throw Error("Could not restore the previous save. Check Vault before adding another copy.");raw+=part;}
  const value=JSON.parse(raw) as InventoryCreateIntent;
  if(value.requestId!==p.requestId||!uuid.test(value.homeId)||!validFields(value.fields))throw Error("Could not restore the previous save.");
  return value;
 }
 return {
  load:(user:string)=>exclusive(()=>load(user)),
  remember:(user:string,intent:InventoryCreateIntent)=>exclusive(async()=>{
   const old=await load(user);if(old){if(JSON.stringify(old)!==JSON.stringify(intent))throw Error("Finish checking the previous save first.");return;}
   if(!uuid.test(intent.requestId)||!uuid.test(intent.homeId)||!validFields(intent.fields))throw Error("Could not prepare this save.");
   const points=Array.from(JSON.stringify(intent)),parts:string[]=[];
   for(let i=0;i<points.length;i+=300)parts.push(points.slice(i,i+300).join(""));
   if(parts.length>30)throw Error("These item details are too long.");
   const k=key(user);
   for(let i=0;i<parts.length;i++)await storage.setItemAsync(k+"-"+intent.requestId+"-"+i,parts[i]);
   await storage.setItemAsync(k,JSON.stringify({requestId:intent.requestId,count:parts.length}));
  }),
  forget:(user:string,requestId:string)=>exclusive(async()=>{
   const k=key(user),raw=await storage.getItemAsync(k);if(!raw)return;
   const pointer=JSON.parse(raw);if(pointer.requestId!==requestId)throw Error("A different save is waiting.");
   await storage.deleteItemAsync(k);
   for(let i=0;i<pointer.count;i++)await storage.deleteItemAsync(k+"-"+requestId+"-"+i).catch(()=>{});
  }),
 };
}

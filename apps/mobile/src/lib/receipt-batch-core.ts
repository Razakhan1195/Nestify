export type ReceiptFields={title:string;category:"Receipt";issued_on:string;expires_on:string;notes:string};
export type ReceiptBatchItem={requestId:string;name:string;status:"review"|"submitting"|"needs_file"|"saved"|"duplicate"|"blocked"|"skipped";fields:ReceiptFields;readAttempted:boolean;readState?:"reading"|"complete"|"failed";file?:{uri:string;name:string;mimeType?:string;size?:number};documentId?:string;message?:string};
export type ReceiptBatch={version:1;revision:number;homeId:string;homeName:string;items:ReceiptBatchItem[]};
type Storage={getItemAsync(k:string):Promise<string|null>;setItemAsync(k:string,v:string):Promise<void>;deleteItemAsync(k:string):Promise<void>};
export const validBatchId=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function parseReceiptBatch(raw:string|null):ReceiptBatch|null{
 if(!raw||raw.length>100000)return null;
 try{
  const b=JSON.parse(raw);
  if(b.version!==1||!Number.isSafeInteger(b.revision)||b.revision<0||!validBatchId(b.homeId)||typeof b.homeName!=="string"||b.homeName.length>200||!Array.isArray(b.items)||b.items.length<1||b.items.length>5)return null;
  const ids=new Set<string>(),items:ReceiptBatchItem[]=[];
  for(const i of b.items){
   if(!validBatchId(i.requestId)||ids.has(i.requestId)||typeof i.name!=="string"||i.name.length>250||!["review","submitting","needs_file","saved","duplicate","blocked","skipped"].includes(i.status)||typeof i.readAttempted!=="boolean")return null;
   ids.add(i.requestId);
   if(i.documentId!==undefined&&!validBatchId(i.documentId))return null;
   if(["saved","duplicate"].includes(i.status)&&!i.documentId)return null;
   if(i.message!==undefined&&(typeof i.message!=="string"||i.message.length>500))return null;
   if(i.readState!==undefined&&!["reading","complete","failed"].includes(i.readState))return null;
   let file:ReceiptBatchItem["file"];
   if(i.file!==undefined){
    const v=i.file;
    if(!v||typeof v.uri!=="string"||!v.uri.startsWith("file://")||v.uri.length>2000||typeof v.name!=="string"||v.name.length>250||v.mimeType!==undefined&&(typeof v.mimeType!=="string"||v.mimeType.length>100)||v.size!==undefined&&(!Number.isSafeInteger(v.size)||v.size<0||v.size>4*1024*1024))return null;
    file={uri:v.uri,name:v.name,...(v.mimeType?{mimeType:v.mimeType}:{}),...(v.size!==undefined?{size:v.size}:{})};
   }
   const f=i.fields;
   if(!f||f.category!=="Receipt")return null;
   for(const [key,max] of Object.entries({title:200,issued_on:10,expires_on:10,notes:5000}))if(typeof f[key]!=="string"||f[key].length>max)return null;
   items.push({requestId:i.requestId,name:i.name,status:i.status,fields:{title:f.title,category:"Receipt",issued_on:f.issued_on,expires_on:f.expires_on,notes:f.notes},readAttempted:i.readAttempted,...(i.readState?{readState:i.readState}:{}),...(file?{file}:{}),...(i.documentId?{documentId:i.documentId}:{}),...(i.message?{message:i.message}:{})});
  }
  return {version:1,revision:b.revision,homeId:b.homeId,homeName:b.homeName,items};
 }catch{return null;}
}
export function createReceiptBatchStore(storage:Storage){
 const queues=new Map<string,Promise<unknown>>();
 function serial<T>(id:string,fn:(key:string)=>Promise<T>){
  if(!validBatchId(id))throw Error("Invalid account");
  const key="rezlee.receipt-batch.v1."+id;
  const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(()=>fn(key));
  queues.set(key,next);void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});
  return next;
 }
 return {
  read:(id:string)=>serial(id,async key=>{const raw=await storage.getItemAsync(key);const b=parseReceiptBatch(raw);if(raw&&!b)throw Error("Saved batch is unreadable");return b;}),
  write:(id:string,batch:ReceiptBatch,expected:number|null)=>serial(id,async key=>{
   const raw=await storage.getItemAsync(key),current=parseReceiptBatch(raw);
   if(raw&&!current)throw Error("Saved batch is unreadable");
   if((current?.revision??null)!==expected)throw Error("Batch changed. Reopen it before continuing.");
   const next=parseReceiptBatch(JSON.stringify({...batch,revision:(expected??-1)+1}));
   if(!next)throw Error("Invalid batch");
   await storage.setItemAsync(key,JSON.stringify(next));return next;
  }),
  clear:(id:string,expected:number)=>serial(id,async key=>{
   const raw=await storage.getItemAsync(key),current=parseReceiptBatch(raw);
   if(!current||current.revision!==expected)throw Error("Batch changed. Reopen it before continuing.");
   await storage.deleteItemAsync(key);
  }),
  removeAccount:(id:string)=>serial(id,key=>storage.deleteItemAsync(key)),
 };
}
export function batchCounts(batch:ReceiptBatch){
 return {saved:batch.items.filter(i=>i.status==="saved").length,duplicates:batch.items.filter(i=>i.status==="duplicate").length,skipped:batch.items.filter(i=>i.status==="skipped").length,pending:batch.items.filter(i=>!["saved","duplicate","skipped"].includes(i.status)).length};
}

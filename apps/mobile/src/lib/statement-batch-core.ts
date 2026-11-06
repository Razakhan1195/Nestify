import {parseIntakeEvidence,type IntakeEvidence} from "./statement-intake-evidence";
export type StatementFields={record_kind:"historical";bill_title:string;category:string;provider_name:string;account_number:string;amount:string;due_date:string;issue_date:string;billing_period_start:string;billing_period_end:string;notes:string};
export const emptyStatementFields:StatementFields={record_kind:"historical",bill_title:"",category:"",provider_name:"",account_number:"",amount:"",due_date:"",issue_date:"",billing_period_start:"",billing_period_end:"",notes:""};
export type StatementBatchItem={requestId:string;name:string;status:"review"|"submitting"|"needs_file"|"saved"|"duplicate"|"blocked"|"skipped";fields:StatementFields;readAttempted:boolean;evidence?:IntakeEvidence;currencyReview?:"CAD"|"unconfirmed"|"foreign";readState?:"reading"|"complete"|"failed";file?:{uri:string;name:string;mimeType?:string;size?:number};billId?:string;message?:string};
export type StatementBatch={version:1;revision:number;homeId:string;homeName:string;items:StatementBatchItem[]};
type Storage={getItemAsync(k:string):Promise<string|null>;setItemAsync(k:string,v:string):Promise<void>;deleteItemAsync(k:string):Promise<void>};
export const validBatchId=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function parseStatementBatch(raw:string|null):StatementBatch|null{
 if(!raw||raw.length>65000)return null;
 try{
  const b=JSON.parse(raw);
  if(b.version!==1||!Number.isSafeInteger(b.revision)||b.revision<0||!validBatchId(b.homeId)||typeof b.homeName!=="string"||b.homeName.length>200||!Array.isArray(b.items)||b.items.length<1||b.items.length>5)return null;
  const ids=new Set<string>(),items:StatementBatchItem[]=[];
  for(const i of b.items){
   if(!validBatchId(i.requestId)||ids.has(i.requestId)||typeof i.name!=="string"||i.name.length>250||!["review","submitting","needs_file","saved","duplicate","blocked","skipped"].includes(i.status)||typeof i.readAttempted!=="boolean")return null;
   ids.add(i.requestId);
   if(i.billId!==undefined&&!validBatchId(i.billId))return null;
   if(["saved","duplicate"].includes(i.status)&&!i.billId)return null;
   if(i.message!==undefined&&(typeof i.message!=="string"||i.message.length>500))return null;
   if(i.readState!==undefined&&!["reading","complete","failed"].includes(i.readState))return null;
   if(i.currencyReview!==undefined&&!["CAD","unconfirmed","foreign"].includes(i.currencyReview))return null;
   const evidence=i.evidence===undefined?undefined:parseIntakeEvidence(i.evidence,true);
   if(evidence===null)return null;
   let file:StatementBatchItem["file"];
   if(i.file!==undefined){
    const v=i.file;
    if(!v||typeof v.uri!=="string"||!v.uri.startsWith("file://")||v.uri.length>2000||typeof v.name!=="string"||v.name.length>250||v.mimeType!==undefined&&typeof v.mimeType!=="string"||v.size!==undefined&&(!Number.isSafeInteger(v.size)||v.size<0||v.size>4*1024*1024))return null;
    file={uri:v.uri,name:v.name,...(v.mimeType?{mimeType:v.mimeType}:{}),...(v.size!==undefined?{size:v.size}:{})};
   }
   const f=i.fields;
   if(!f||f.record_kind!=="historical")return null;
   for(const [key,max] of Object.entries({bill_title:200,category:100,provider_name:200,account_number:200,amount:40,due_date:10,issue_date:10,billing_period_start:10,billing_period_end:10,notes:5000}))if(typeof f[key]!=="string"||f[key].length>max)return null;
   items.push({requestId:i.requestId,name:i.name,status:i.status,fields:Object.fromEntries(Object.keys(emptyStatementFields).map(k=>[k,f[k]])) as StatementFields,readAttempted:i.readAttempted,...(evidence?{evidence}:{}),...(i.currencyReview?{currencyReview:i.currencyReview}:{}),...(i.readState?{readState:i.readState}:{}),...(file?{file}:{}),...(i.billId?{billId:i.billId}:{}),...(i.message?{message:i.message}:{})});
  }
  return {version:1,revision:b.revision,homeId:b.homeId,homeName:b.homeName,items};
 }catch{return null;}
}
export function createStatementBatchStore(storage:Storage){
 const queues=new Map<string,Promise<unknown>>();
 function serial<T>(id:string,fn:(key:string)=>Promise<T>){
  if(!validBatchId(id))throw Error("Invalid account");
  const key="rezlee.statement-batch.v1."+id;
  const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(()=>fn(key));
  queues.set(key,next);void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});
  return next;
 }
 return {
  read:(id:string)=>serial(id,async key=>{const raw=await storage.getItemAsync(key);const b=parseStatementBatch(raw);if(raw&&!b)throw Error("Saved batch is unreadable");return b;}),
  write:(id:string,batch:StatementBatch,expected:number|null)=>serial(id,async key=>{
   const raw=await storage.getItemAsync(key),current=parseStatementBatch(raw);
   if(raw&&!current)throw Error("Saved batch is unreadable");
   if((current?.revision??null)!==expected)throw Error("Batch changed. Reopen it before continuing.");
   const next=parseStatementBatch(JSON.stringify({...batch,revision:(expected??-1)+1}));
   if(!next)throw Error("Invalid batch");
   await storage.setItemAsync(key,JSON.stringify(next));return next;
  }),
  clear:(id:string,expected:number)=>serial(id,async key=>{
   const raw=await storage.getItemAsync(key),current=parseStatementBatch(raw);
   if(!current||current.revision!==expected)throw Error("Batch changed. Reopen it before continuing.");
   await storage.deleteItemAsync(key);
  }),
  removeAccount:(id:string)=>serial(id,key=>storage.deleteItemAsync(key)),
 };
}
export function batchCounts(batch:StatementBatch){
 return {saved:batch.items.filter(i=>i.status==="saved").length,duplicates:batch.items.filter(i=>i.status==="duplicate").length,skipped:batch.items.filter(i=>i.status==="skipped").length,pending:batch.items.filter(i=>!["saved","duplicate","skipped"].includes(i.status)).length};
}


import {parseIntakeEvidence,type IntakeEvidence} from "./statement-intake-evidence";
import type { ManualBillInput } from "./bill-input-types";
export type StatementDraft = {
 version: 1; updatedAt: number; homeId: string; existingBillId?: string;
 fields: ManualBillInput; evidence?:IntakeEvidence; fileName: string | null;
};
type Storage = { getItemAsync(key:string):Promise<string|null>; setItemAsync(key:string,value:string):Promise<void>; deleteItemAsync(key:string):Promise<void> };
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const limits={bill_title:200,category:100,provider_name:200,account_number:200,amount:40,due_date:10,issue_date:10,billing_period_start:10,billing_period_end:10,notes:5000};
export function parseStatementDraft(raw:string|null,now=Date.now()):StatementDraft|null {
 if(!raw || raw.length>18000) return null;
 try {
  const d=JSON.parse(raw);
  if(d.version!==1 || !Number.isFinite(d.updatedAt) || d.updatedAt>now+60000 || now-d.updatedAt>7*86400000 ||
   (typeof d.homeId!=="string" || !uuid.test(d.homeId)) || (d.existingBillId!==undefined && (typeof d.existingBillId!=="string" || !uuid.test(d.existingBillId))) ||
   !d.fields || typeof d.fields!=="object" || Array.isArray(d.fields) || (d.fileName!==null && (typeof d.fileName!=="string" || d.fileName.length>250))) return null;
  const evidence=d.evidence===undefined?undefined:parseIntakeEvidence(d.evidence,true);
  if(evidence===null)return null;
  const fields:Record<string,string>={record_kind:"historical"};
  for(const [key,max] of Object.entries(limits)) {
   const value=d.fields[key];
   if(value!==undefined && (typeof value!=="string" || value.length>max)) return null;
   fields[key]=value??"";
  }
  // Deliberately exclude local file URI, bytes, review confirmation and AI instructions.
  return {version:1,updatedAt:d.updatedAt,homeId:d.homeId,...(d.existingBillId?{existingBillId:d.existingBillId}:{}),fields:fields as ManualBillInput,...(evidence?{evidence}:{}),fileName:d.fileName};
 } catch {return null;}
}
export function createStatementDraftStore(storage:Storage) {
 const queues=new Map<string,Promise<unknown>>();
 function serial<T>(userId:string,task:(key:string)=>Promise<T>) {
  if(!uuid.test(userId)) throw Error("Invalid account");
  const key="rezlee.statement-draft.v1."+userId;
  const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(()=>task(key));
  queues.set(key,next);
  void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});
  return next;
 }
 return {
  read:(id:string)=>serial(id,async key=>{
   const raw=await storage.getItemAsync(key),draft=parseStatementDraft(raw);
   if(raw&&!draft)await storage.deleteItemAsync(key);
   return draft;
  }),
  write:(id:string,draft:StatementDraft)=>serial(id,async key=>{
   const normalized=parseStatementDraft(JSON.stringify(draft));
   if(!normalized)throw Error("Draft is too long or invalid");
   await storage.setItemAsync(key,JSON.stringify(normalized));
  }),
  clear:(id:string)=>serial(id,key=>storage.deleteItemAsync(key)),
 };
}

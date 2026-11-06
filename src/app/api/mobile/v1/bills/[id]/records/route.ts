import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {billRecordsEnabled} from "@/lib/product/bill-records";
import {z} from "zod";
export const dynamic="force-dynamic";
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const choice=z.object({otherId:z.string().uuid(),fingerprint:z.string().regex(/^[a-f0-9]{32}$/),otherFingerprint:z.string().regex(/^[a-f0-9]{32}$/),selectedId:z.string().uuid().nullable()});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await authenticateMobileRequest(request);if(auth.error)return respond({error:auth.error.message},auth.error.status);
 if(!billRecordsEnabled())return respond({enabled:false});
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return respond({error:"Invalid statement."},400);
 const result=await auth.supabase.rpc("get_rezlee_bill_records",{p_bill:id});
 if(result.error)return respond({error:result.error.code==="P0002"?"This statement is no longer available.":"Could not load statement records. Try again."},result.error.code==="P0002"?404:503);
 return respond({...result.data,enabled:true,moreCandidates:result.data.candidates.length>50,moreVersions:result.data.versions.length>20,candidates:result.data.candidates.slice(0,50),versions:result.data.versions.slice(0,20)});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await authenticateMobileRequest(request);if(auth.error)return respond({error:auth.error.message},auth.error.status);
 if(!billRecordsEnabled())return respond({error:"Statement review is unavailable right now. Your records are unchanged."},503);
 const {id}=await params;const input=choice.safeParse(await request.json().catch(()=>null));
 if(!z.string().uuid().safeParse(id).success||!input.success)return respond({error:"Check both statements before choosing."},400);
 const v=input.data;const result=await auth.supabase.rpc("choose_rezlee_bill_record",{p_first:id,p_second:v.otherId,p_first_fingerprint:v.fingerprint,p_second_fingerprint:v.otherFingerprint,p_selected:v.selectedId});
 if(result.error){const code=result.error.code;return respond({error:(code==="PT409"||code==="40001")?"One of these records or choices changed. Reload before choosing again.":code==="42501"?"These statements are no longer available to this account.":code==="22023"?"These records describe different periods, amounts or payment states. Keep them separate.":"Could not confirm this choice. Check the saved choice before retrying."},(code==="PT409"||code==="40001")?409:code==="42501"?403:code==="22023"?400:503);}
 return respond(result.data);
}

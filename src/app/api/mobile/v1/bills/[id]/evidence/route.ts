import {energyEvidenceError,parseEnergyEvidence} from "../../../../../../../../apps/mobile/src/lib/energy-evidence";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { evidenceError, parseEvidence } from "../../../../../../../../apps/mobile/src/lib/statement-evidence";
import { loadStatementEvidence,saveStatementEvidence } from "@/lib/product/statement-evidence";
export const dynamic="force-dynamic";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:respond({error:auth.error.message},auth.error.status)};
 const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return {response:respond({error:"Could not verify your home. Try again."},409)};
 return {supabase:auth.supabase,userId:auth.user.id,homeId:home.data.id};
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const {id}=await params;if(!uuid.test(id))return respond({error:"Choose a valid statement."},400);
 const result=await loadStatementEvidence(ctx,id);
 return "error" in result?respond({error:result.error},result.status):respond({...result.payload,statementReaderSupported:true,energyEvidenceSupported:true});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const {id}=await params;if(!uuid.test(id))return respond({error:"Choose a valid statement."},400);
 // Bound the actual stream; Content-Length is not trusted.
 const reader=request.body?.getReader();if(!reader)return respond({error:"Check the statement details."},400);
 let text="",size=0;const decoder=new TextDecoder();
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();return respond({error:"Keep these details shorter."},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
 catch{return respond({error:"Could not read those details. Try again."},400);}
 let body;try{body=JSON.parse(text);}catch{return respond({error:"Check the statement details."},400);}
 const error=evidenceError(body?.fields)??(body?.energy!==undefined&&body?.energy!==null?energyEvidenceError(body.energy):null);
 if(error||body?.reviewed!==true||typeof body?.version!=="string"||body.version.length>50||!Number.isFinite(Date.parse(body.version)))return respond({error:error??"Confirm the details against the original before saving."},400);
 const result=await saveStatementEvidence(ctx,id,body.version,parseEvidence(body.fields)!,body.energy===undefined?undefined:body.energy===null?null:parseEnergyEvidence(body.energy)!);
 return "error" in result?respond({error:result.error},result.status):respond({...result.payload,statementReaderSupported:true,energyEvidenceSupported:true});
}

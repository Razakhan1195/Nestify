import {after} from "next/server";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {createAdminClient} from "@/lib/supabase/admin";
import {readerSource,publicReadAttempt,statementReaderEnabled,performStatementRead} from "@/lib/product/statement-reader";
export const dynamic="force-dynamic";
export const maxDuration=90;
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request,id:string){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:respond({error:auth.error.message},auth.error.status)};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return {response:respond({error:"Choose a statement."},400)};
 const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return {response:respond({error:"Could not verify your home."},409)};
 const ctx={supabase:auth.supabase,userId:auth.user.id,homeId:home.data.id};
 const source=await readerSource(ctx,id);
 if(!source)return {response:respond({error:"That reviewed statement is unavailable."},404)};
 return {ctx,source};
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,state=await context(request,id);if("response" in state)return state.response;
 const {ctx,source}=state;
 if(!source.documentId)return respond({enabled:false,attempt:null});
 const result=await ctx.supabase.from("statement_read_attempts").select("status,created_at,source_basis,result").eq("user_id",ctx.userId).eq("home_id",ctx.homeId).eq("bill_id",id).eq("document_id",source.documentId).maybeSingle();
 if(result.error)return respond({enabled:false,attempt:null});
 return respond({enabled:statementReaderEnabled(),attempt:publicReadAttempt(result.data,source.basis)});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,state=await context(request,id);if("response" in state)return state.response;
 if(!statementReaderEnabled())return respond({error:"Statement reading is unavailable here. You can enter the details manually."},503);
 const reader=request.body?.getReader();let text="",size=0;
 if(!reader)return respond({error:"Confirm before reading the original."},400);
 const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512){await reader.cancel();return respond({error:"Request too large."},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  if(JSON.parse(text)?.confirmed!==true)return respond({error:"Confirm before reading the original."},400);
 }catch{return respond({error:"Confirm before reading the original."},400);}
 const {ctx,source}=state;
 if(!source.documentId)return respond({error:"Attach the original statement first, or enter the details yourself."},409);
 const admin=createAdminClient();
 const inserted=await admin.from("statement_read_attempts").insert({user_id:ctx.userId,home_id:ctx.homeId,bill_id:id,document_id:source.documentId,source_basis:source.basis}).select("id").single();
 if(inserted.error){
  if(inserted.error.code!=="23505")return respond({error:"Could not start reading. Your statement is unchanged."},503);
  // Return the one existing attempt. Never enqueue a second paid call.
  return GET(request,{params:Promise.resolve({id})});
 }
 after(async()=>{try{await performStatementRead(ctx,admin,id,{id:inserted.data.id,documentId:source.documentId!,basis:source.basis,period:source.period});}catch{console.warn("[statement-reader] background work interrupted");}});
 return respond({enabled:true,attempt:{status:"queued",result:null}},202);
}

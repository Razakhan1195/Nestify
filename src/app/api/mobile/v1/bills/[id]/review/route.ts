import {loadBillReview,connectedBillAnalysis,offerSources,reviewAction} from "@/lib/product/connected-bill-review";
import {validOfferSources} from "../../../../../../../../apps/mobile/src/lib/offer-reading";
import {billReviewBaseline} from "@/lib/product/bill-review";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { currentReviewedEvidence } from "@/lib/product/statement-evidence";
import { billReview,reviewStatuses,validOfferDrafts,type BillReviewAction } from "../../../../../../../../apps/mobile/src/lib/bill-review";
export const dynamic="force-dynamic";
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function load(request:Request,id:string){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:respond({error:auth.error.message},auth.error.status)};
 if(!uuid.test(id))return {response:respond({error:"Choose a valid statement."},400)};
 const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return {response:respond({error:"Could not verify your home."},409)};
 const ctx={supabase:auth.supabase,userId:auth.user.id,homeId:home.data.id};
 const result=await loadBillReview(ctx,id);
 if("error" in result)return {response:respond({error:result.error},result.status)};
 const evidence=currentReviewedEvidence(result.bill);
 const baseline=billReviewBaseline(result.bill);
 const action=reviewAction(result.raw.bill_review_action);
 const offers=validOfferDrafts(result.raw.bill_review_offers)?result.raw.bill_review_offers:null;
 const payload={...result.payload,offers,offerSources:offerSources(result.raw),analysis:result.connected?connectedBillAnalysis(result.payload):billReview(result.payload,evidence),baseline,action,changed:Boolean(action&&action.baseline!==baseline)};
 return {ctx,result,payload};
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const state=await load(request,(await params).id);
 return "response" in state?state.response:respond(state.payload);
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=(await params).id,state=await load(request,id);
 if("response" in state)return state.response;
 if("readOnly"in state.result.payload&&state.result.payload.readOnly)return respond({error:"These bill details changed. Your saved enquiry is still available, but a new save is not supported for this statement."},409);
 const reader=request.body?.getReader();if(!reader)return respond({error:"Add the action details."},400);
 let text="",size=0;const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>48000){await reader.cancel();return respond({error:"Keep the enquiry and notes shorter."},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}catch{return respond({error:"Could not read this action."},400);}
 let body;try{body=JSON.parse(text);}catch{return respond({error:"Check this action."},400);}
 if(body?.operation==="offers"){
  if(!validOfferDrafts(body.offers))return respond({error:"Check the offer fields."},400);
  if(body.version!==state.result.payload.version)return respond({error:"This statement changed. Reload before saving the offers."},409);
  if(body.offerSources!==undefined&&!validOfferSources(body.offerSources))return respond({error:"Check the offer source details."},400);
  const sources=body.offerSources??offerSources(state.result.raw);
  const raw={...state.result.raw,bill_review_offers:body.offers,bill_review_offer_sources:sources,bill_review_offers_saved_at:new Date().toISOString()};
  return persist(state,id,body.version,raw,{offers:body.offers,offerSources:sources});
 }
 // An explicit customer question does not require an inferred billing fault.
 // Existing ownership, record eligibility, baseline and revision guards still apply.
 if(!state.payload.action&&!state.payload.analysis.hasFinding&&body?.operation!=="enquiry")return respond({error:"Choose to prepare a question before saving a new enquiry."},409);
 if(typeof body?.draft!=="string"||!body.draft.trim()||body.draft.length>6000||typeof body?.notes!=="string"||body.notes.length>2000||!reviewStatuses.includes(body?.status)||body?.baseline!==state.payload.baseline)
  return respond({error:"Check the action and reload if the statement changed."},400);
 if(body.version!==state.result.payload.version)return respond({error:"This statement changed. Reload before saving; your edits are still here."},409);
 const action:BillReviewAction={draft:body.draft.trim(),notes:body.notes,status:body.status,baseline:state.payload.baseline,savedAt:new Date().toISOString()};
 return persist(state,id,body.version,{...state.result.raw,bill_review_action:action},{action,changed:false});
}
type Loaded=Exclude<Awaited<ReturnType<typeof load>>,{response:unknown}>;
async function persist(state:Loaded,id:string,version:string,raw:Record<string,unknown>,patch:Record<string,unknown>){
 if(state.result.connected){
  const saved=await state.ctx.supabase.rpc("save_rezlee_connected_bill_review",{p_bill_id:id,p_bill_version:state.result.bill.updated_at,p_revision:state.result.revision,p_review:raw});
  if(saved.error)return respond({error:saved.error.code==='PT409'?"This statement or enquiry changed. Reload before saving; your edits remain here.":"Could not confirm the save. Reload to check before retrying."},saved.error.code==='PT409'?409:503);
  return respond({...state.payload,...patch,version:state.result.bill.updated_at+'|'+saved.data});
 }
 const {data,error}=await state.ctx.supabase.from("bills").update({raw_data:raw})
 .eq("id",id).eq("user_id",state.ctx.userId).eq("home_id",state.ctx.homeId).eq("updated_at",version).eq("source","manual").eq("status","archived").select("updated_at").maybeSingle();
 if(error)return respond({error:"Could not confirm the save. Reload to check before retrying."},503);
 if(!data)return respond({error:"This statement changed. Reload before saving."},409);
 return respond({...state.payload,...patch,version:data.updated_at});
}

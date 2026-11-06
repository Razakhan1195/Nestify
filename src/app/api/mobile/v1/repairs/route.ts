import {after} from "next/server";
import {guideOutcome,inferGuide} from "@/lib/issues/repair-guides";
import {generateWalkthrough,exhaustedGuidance,fallbackGuidance,guidanceServiceErrorCode} from "@/lib/issues/adaptive-guidance";
import {retrieveRepairEvidence,type Evidence} from "@/lib/issues/repair-evidence";
import {reserveAiRequest} from "@/lib/ai/reservation";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { readBoundedJson } from "@/lib/security/request";
import { startSchema,changeSchema,createProgress,changeProgress,nextStep,serviceBrief,safetySources,type Progress } from "@/lib/issues/session";
export const dynamic="force-dynamic";
export const maxDuration=60;
const uuid=z.string().uuid();
const input=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("create"),id:uuid,homeId:uuid,intake:startSchema}).strict(),
 z.object({operation:z.literal("change"),id:uuid,homeId:uuid,version:z.number().int().nonnegative(),requestId:uuid,change:changeSchema}).strict(),
]);
const columns="id,title,description,status,created_at,updated_at,guided_progress,guided_version";
type Row={id:string;title:string;description:string|null;status:string;created_at:string;updated_at:string;guided_progress:Progress|null;guided_version:number};
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});}
function present(row:Row){
 const original=row.guided_progress!;
 const expired=original.guidance?.state==="reading"&&Date.now()-Date.parse(original.guidance.startedAt)>60000;
 const p=expired?{...original,guidance:{...original.guidance!,state:"fallback" as const,reason:"Guidance took too long. Your issue is saved. Use the available checks or try again."}}:original;
 return {id:row.id,title:row.title,status:row.status,version:row.guided_version,createdAt:row.created_at,progress:p,outcome:guideOutcome(p,row.status),step:nextStep(p,row.status),brief:p.brief??serviceBrief(p,row.status),safetySources:p.blocked?safetySources:[]};
}
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return {error:reply({error:auth.error.message},auth.error.status)} as const;
 const access=await resolveAccessibleHome(auth.supabase,auth.user.id);
 if(access.error)return {error:reply({error:"Could not check your household. Try again."},503)} as const;
 if(!access.data)return {error:reply({error:"Set up or join a household to save repair progress."},409)} as const;
 return {auth,home:access.data.home,canCreate:access.data.role==="owner"} as const;
}
async function finishGuidance(ctx:Extract<Awaited<ReturnType<typeof context>>,{auth:unknown}>,row:Row){
 const p=row.guided_progress!;
 const key=inferGuide({...p.intake,description:[p.intake.description,...p.attempts.map(a=>a.note)].join(" ").slice(0,1500)});let blocked=p.blocked,state:"ready"|"fallback"="fallback",method:"rules"|"ai"="rules";
 let adaptive:Progress["adaptive"];let evidenceCount=0;let evidence:Evidence[]=[];
 let reason="AI guidance is unavailable. You can use the safe checks below or prepare a help request.";
 const exhausted=exhaustedGuidance(p);
 if(exhausted){adaptive=exhausted;state="ready";reason="";}
 else try{
  evidence=await retrieveRepairEvidence(p);evidenceCount=evidence.length;
  const reservation=await reserveAiRequest(ctx.auth.supabase);
  if(reservation.ok){
   adaptive=await generateWalkthrough(p,evidence,new Date().toISOString(),async()=>(await reserveAiRequest(ctx.auth.supabase)).ok);
   blocked=blocked||adaptive.disposition==="hazard";state="ready";method="ai";reason="";
  }else reason=reservation.status===429?"AI capacity is busy. Your issue is saved; the available checks still work.":reason;
 }catch(error){
  const message=error instanceof Error?error.message:"";
  const code=["Unsupported citation","Unsafe step","Repeated check","A check requires retrieved evidence"].includes(message)?message:"guidance_failed";
  console.warn("[repair-guidance] unavailable",{code,evidenceCount,errorName:error instanceof Error?error.name:"unknown",serviceCode:guidanceServiceErrorCode(error),reasonClass:/schema|structured|json|enum/i.test(message)?"structured_output":/credit|balance|quota|limit/i.test(message)?"capacity":/auth|token|credential/i.test(message)?"authentication":/model|provider/i.test(message)?"model_provider":"unknown"}); // No raw prompts, source text or model output.
 }
 if(!adaptive)adaptive=fallbackGuidance(p,evidence);
 const progress:Progress={...p,blocked,adaptive,adaptiveEnabled:true,guideVersion:2,guidance:{...p.guidance!,key,state,method,reason}};
 const status=blocked?"waiting_on_professional":(adaptive?.disposition==="escalate"||(!adaptive&&!nextStep(progress,row.status)))?(p.intake.context==="renter"?"waiting_on_landlord":"waiting_on_professional"):row.status;
 const result=await ctx.auth.supabase.from("repair_issues").update({guided_progress:progress,guided_version:row.guided_version+1,status,...(blocked?{urgency:"urgent"}:{})})
 .eq("id",row.id).eq("user_id",ctx.auth.user.id).eq("home_id",ctx.home.id).eq("guided_version",row.guided_version).select("id").maybeSingle();
 if(result.error)console.warn("[repair-guidance] save unavailable");
}

export async function GET(request:Request){
 const ctx=await context(request);if(ctx.error)return ctx.error;
 const id=new URL(request.url).searchParams.get("id");
 if(id&&!uuid.safeParse(id).success)return reply({error:"This issue is unavailable."},400);
 const query=ctx.auth.supabase.from("repair_issues").select(columns).eq("user_id",ctx.auth.user.id).eq("home_id",ctx.home.id).not("guided_progress","is",null);
 if(id)query.eq("id",id);
 const result=await query.order("created_at",{ascending:false}).limit(id?1:50);
 if(result.error)return reply({error:"Could not load repair progress. Your saved issues are unchanged."},503);
 if(id&&!result.data?.length)return reply({error:"This issue is unavailable in your current household."},404);
 return reply({homeId:ctx.home.id,homeName:ctx.home.nickname,canCreate:ctx.canCreate,photoReadingAvailable:process.env.REZLEE_AI_DISABLED!=="true",issues:(result.data as Row[]).map(present)});
}
export async function POST(request:Request){
 const ctx=await context(request);if(ctx.error)return ctx.error;
 if(!ctx.canCreate)return reply({error:"Your household owner manages saved repair cases. You can still use Ask Rezlee for home-care questions."},403);
 const parsed=input.safeParse(await readBoundedJson(request,14000).catch(()=>null));
 if(!parsed.success)return reply({error:"Check your details and try again."},400);
 const body=parsed.data;const {auth,home}=ctx;
 if(body.homeId!==home.id)return reply({error:"Your household changed. Reopen repair help before saving."},409);
 const select=()=>auth.supabase.from("repair_issues").select(columns).eq("id",body.id).eq("user_id",auth.user.id).eq("home_id",home.id).maybeSingle();
 const existing=await select();
 if(existing.error)return reply({error:"Could not check this save. Retry the same details."},503);
 let row=existing.data as Row|null;
 if(body.operation==="create"){
  const progress=createProgress(body.intake,true);
  progress.adaptiveEnabled=true;
  progress.guidance={key:inferGuide(body.intake),state:progress.blocked?"ready":"reading",method:"rules",startedAt:new Date().toISOString(),requestId:body.id};
  let created=false;
  if(!row){
   const inserted=await auth.supabase.from("repair_issues").insert({id:body.id,user_id:auth.user.id,home_id:home.id,title:body.intake.title,description:body.intake.description,category:body.intake.category,renter_owner_context:body.intake.context,status:progress.blocked?"waiting_on_professional":"next_steps_ready",urgency:progress.blocked?"urgent":"monitor",guided_progress:progress,guided_version:1}).select(columns).single();
   if(inserted.error){if(inserted.error.code!=="23505")return reply({error:"We couldn’t confirm the save. Retry the same details."},503);row=(await select()).data as Row|null;}
   else {row=inserted.data as Row;created=true;}
  }
  if(!row?.guided_progress||JSON.stringify(row.guided_progress.intake)!==JSON.stringify(body.intake)){
   // JSONB key order is not stable; compare fields rather than object serialization.
   if(!row?.guided_progress||Object.entries(body.intake).some(([k,v])=>row!.guided_progress!.intake[k as keyof typeof body.intake]!==v))return reply({error:"This save already exists with different details. Reopen it."},409);
  }
  if(created&&!progress.blocked){const saved=row!;after(()=>finishGuidance(ctx,saved));}
  return reply({issue:present(row!)});
 }
 if(!row?.guided_progress)return reply({error:"This issue is unavailable."},404);
 const previous=row.guided_progress.lastRequest;
 if(previous?.id===body.requestId){
  if(JSON.stringify(changeSchema.parse(previous.command))!==JSON.stringify(body.change))return reply({error:"This request already saved different details. Reload before continuing."},409);
  return reply({issue:present(row)});
 }
 if(row.guided_version!==body.version)return reply({error:"Your progress changed. Reload before continuing."},409);
 if(body.change.action==="tailor"){
  const p=row.guided_progress;
  if(row.status==="resolved"||p.blocked||p.reopened)return reply({error:"This issue does not need new troubleshooting."},409);
  if(p.guidance?.state==="reading"&&Date.now()-Date.parse(p.guidance.startedAt)<60000)return reply({error:"Guidance is still being prepared. Your progress is saved."},409);
  const progress:Progress={...p,adaptiveEnabled:true,adaptive:undefined,guideVersion:2,guidance:{key:inferGuide(p.intake),state:"reading",method:"rules",startedAt:new Date().toISOString(),requestId:body.requestId},lastRequest:{id:body.requestId,command:body.change}};
  const saved=await auth.supabase.from("repair_issues").update({guided_progress:progress,guided_version:body.version+1,status:"next_steps_ready"}).eq("id",body.id).eq("user_id",auth.user.id).eq("home_id",home.id).eq("guided_version",body.version).eq("updated_at",row.updated_at).select(columns).maybeSingle();
  if(saved.error||!saved.data)return reply({error:"Your progress could not be confirmed. Reload before trying again."},409);
  const claimed=saved.data as Row;after(()=>finishGuidance(ctx,claimed));return reply({issue:present(claimed)});
 }
 if(body.change.action==="respond"&&row.guided_progress.guidance?.state==="reading"&&Date.now()-Date.parse(row.guided_progress.guidance.startedAt)<60000)return reply({error:"Your next step is still being prepared. Wait for it before submitting your answer."},409);
 let next;
 try{next=changeProgress(row.guided_progress,row.status,body.change,new Date().toISOString());}
 catch(error){return reply({error:error instanceof Error?error.message:"Reload before continuing."},409);}
 next.progress.lastRequest={id:body.requestId,command:body.change};
 const continueAI=next.progress.adaptiveEnabled&&body.change.action==="respond"&&next.status==="next_steps_ready"&&!next.progress.blocked;
 if(continueAI)next.progress.guidance={key:inferGuide(next.progress.intake),state:"reading",method:"rules",startedAt:new Date().toISOString(),requestId:body.requestId};
 const update=await auth.supabase.from("repair_issues").update({guided_progress:next.progress,guided_version:body.version+1,status:next.status,resolved_at:next.status==="resolved"?new Date().toISOString():null})
 .eq("id",body.id).eq("user_id",auth.user.id).eq("home_id",home.id).eq("guided_version",body.version).eq("updated_at",row.updated_at).select(columns).maybeSingle();
 if(update.error)return reply({error:"We couldn’t confirm the save. Retry the same action."},503);
 if(!update.data)return reply({error:"Your progress changed. Reload before continuing."},409);
 const saved=update.data as Row;
 if(continueAI)after(()=>finishGuidance(ctx,saved));
 return reply({issue:present(saved)});
}

import { mobileSnapshotQuery } from "@/lib/supabase/mobile-read-context";
import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
import { resolveOwnedHome } from "@/lib/household/access";
import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
import {purchaseMutationSchema} from "@/lib/product/purchase-input";
import type {PurchaseRow,PurchaseSource} from "../../../../../../apps/mobile/src/lib/purchase-decision";
import type {QuoteDraft} from "../../../../../../apps/mobile/src/lib/quote-review";
export const dynamic="force-dynamic";
const columns="id,revision,last_request_id,payload,updated_at";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:reply({error:auth.error.message},auth.error.status)} as const;
 const home=await resolveOwnedHome(auth.supabase,auth.user.id);
 if(home.error)return {response:reply({error:"Could not check your home. Try again."},503)} as const;
 if(!home.data)return {response:reply({error:"Set up your own home to keep private decisions."},409)} as const;
 return {...auth,home:home.data} as const;
}
async function readGET(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const id=new URL(request.url).searchParams.get("id");
 if(id&&!z.string().uuid().safeParse(id).success)return reply({error:"Choose a saved decision."},400);
 let query=ctx.supabase.from("purchase_decisions").select(columns).eq("user_id",ctx.user.id).eq("home_id",ctx.home.id);
 if(id)query=query.eq("id",id);
 const rows=await mobileSnapshotQuery(ctx.supabase, ctx.user.id, "decisions", () => query.order("updated_at",{ascending:false}).limit(id?1:51));
 if(rows.error)return reply({error:"Could not load your decisions. Try again."},503);
 if(id&&!rows.data?.length)return reply({error:"This decision is no longer available."},404);
 const decisions=(rows.data??[]).slice(0,50) as PurchaseRow[];
 const refs=[...new Set(decisions.flatMap(d=>d.payload.quotes.map(q=>q.documentId)))];
 const base=()=>ctx.supabase.from("quote_reviews").select("document_id,revision,source_version,payload,documents!quote_reviews_document_id_fkey(id,title,updated_at)").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id);
 const [latest,linked]=await Promise.all([mobileSnapshotQuery(ctx.supabase, ctx.user.id, "latestQuotes", () => base().order("updated_at",{ascending:false}).limit(101)),refs.length?mobileSnapshotQuery(ctx.supabase, ctx.user.id, "linkedQuotes", () => base().in("document_id",refs)):Promise.resolve({data:[],error:null})]);
 if(latest.error||linked.error)return reply({error:"Could not check the quote originals. Try again."},503);
 type SourceRow={document_id:string;revision:number;source_version:string;payload:QuoteDraft|null;documents:{id:string;title:string;updated_at:string}|null};
 const found=new Map<string,PurchaseSource>();
 for(const r of [...(latest.data??[]).slice(0,100),...(linked.data??[])] as unknown as SourceRow[]){
  if(!r.documents||!r.payload)continue;
  found.set(r.document_id,{documentId:r.document_id,title:r.documents.title,sourceVersion:r.documents.updated_at,reviewRevision:r.revision,reviewed:r.payload.reviewed,sourceCurrent:r.source_version===r.documents.updated_at,fields:r.payload.fields});
 }
 return reply({homeId:ctx.home.id,homeName:ctx.home.nickname,decisions,sources:[...found.values()],truncated:(rows.data?.length??0)>50||(latest.data?.length??0)>100});
}
export async function POST(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const parsed=purchaseMutationSchema.safeParse(await readBoundedJson(request,45000).catch(()=>null));
 if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??"Check these details."},400);
 const b=parsed.data;
 if(b.homeId!==ctx.home.id)return reply({error:"Return to the home where you started this decision."},409);
 const result=await createAdminClient().rpc("save_rezlee_purchase",{p_user:ctx.user.id,p_home:ctx.home.id,p_id:b.id,p_version:b.version,p_request:b.requestId,p_payload:b.payload});
 if(result.error){
  const status=result.error.code==="PT404"?404:result.error.code==="PT409"?409:result.error.code==="PT400"?400:503;
  return reply({error:status===409?"The saved decision or a quote changed. Check the current originals and reload before saving.":status===404?"This decision or a selected quote is no longer available.":status===400?"Check these details.":"Could not confirm the save. Check the saved decision before retrying."},status);
 }
 const row=result.data.decision;
 return reply({decision:Object.fromEntries(columns.split(",").map(k=>[k,row[k]])),replayed:result.data.replayed});
}

export const GET = withStagingPerformanceTrace(readGET);

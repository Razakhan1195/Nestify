import { mobileSnapshotQuery } from "@/lib/supabase/mobile-read-context";
import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
export const maxDuration=60;
import {createAdminClient} from "@/lib/supabase/admin";
import { after } from "next/server";
import { appNotificationsEnabled, dispatchAppNotifications } from "@/lib/notifications/service";
import { sharedBillDraft } from "@/lib/household/shared-bill-draft";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { readBoundedJson } from "@/lib/security/request";

export const dynamic="force-dynamic";
const uuid=z.string().uuid();
const input=z.object({homeId:uuid,requestId:z.string().regex(/^[a-zA-Z0-9-]{8,96}$/),command:z.record(z.string(),z.unknown())}).strict();
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});}
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {error:reply({error:auth.error.message},auth.error.status)} as const;
 const access=await resolveAccessibleHome(auth.supabase,auth.user.id);
 if(access.error)return {error:reply({error:"Could not check household access. Try again."},503)} as const;
 if(!access.data)return {error:reply({error:"Set up or join a household to share expenses."},409)} as const;
 return {auth,access:access.data} as const;
}
async function readGET(request:Request){
 const ctx=await context(request);if(ctx.error)return ctx.error;
 const {auth,access}=ctx;const url=new URL(request.url),id=url.searchParams.get("id"),before=url.searchParams.get("before");
 const billId=url.searchParams.get("billId");
 if(billId){
  if(!uuid.safeParse(billId).success)return reply({error:"This bill is unavailable."},400);
  const bill=await auth.supabase.from("bills").select("id,name,custom_provider_name,amount,amount_paid,payment_date,currency").eq("id",billId).eq("home_id",access.home.id).eq("user_id",auth.user.id).maybeSingle();
  if(bill.error)return reply({error:"Could not load this bill. Try again."},503);
  if(!bill.data)return reply({error:"This bill is unavailable. Your private bills stay private."},404);
  const draft=sharedBillDraft(bill.data,new Date().toISOString().slice(0,10));
  if(!draft)return reply({error:"Shared expenses currently support CAD bills. No currency conversion has been applied."},400);
  const link=await auth.supabase.from("shared_expense_bill_links").select("entry_id").eq("user_id",auth.user.id).eq("bill_id",billId).maybeSingle();
  if(link.error)return reply({error:"Could not check whether this bill was already shared. Try again."},503);
  return reply({billId,homeId:access.home.id,draft,existingEntryId:link.data?.entry_id??null});
 }

 if((id&&!uuid.safeParse(id).success)||(before&&!uuid.safeParse(before).success))return reply({error:"This entry is unavailable."},400);
 const query=auth.supabase.from("shared_expense_entries").select("id,home_id,created_by,kind,details,version,voided,created_at,updated_at").eq("home_id",access.home.id);
 if(id)query.eq("id",id);
 if(before){
  const cursor=await auth.supabase.from("shared_expense_entries").select("created_at,id").eq("home_id",access.home.id).eq("id",before).maybeSingle();
  if(cursor.error||!cursor.data)return reply({error:"Could not load more entries. Refresh the list."},409);
  query.or("created_at.lt."+cursor.data.created_at+",and(created_at.eq."+cursor.data.created_at+",id.lt."+cursor.data.id+")");
 }
 const [people,balances,entries,changes]=await Promise.all([
  mobileSnapshotQuery(auth.supabase, auth.user.id, "people", () => auth.supabase.rpc("rezlee_expense_people",{target_home:access.home.id})),
  mobileSnapshotQuery(auth.supabase, auth.user.id, "balances", () => auth.supabase.rpc("rezlee_expense_balances",{target_home:access.home.id})),
  mobileSnapshotQuery(auth.supabase, auth.user.id, "entries", () => query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(id?1:41)),
  id?auth.supabase.from("shared_expense_changes").select("id,actor_name,action,version,details,created_at").eq("home_id",access.home.id).eq("entry_id",id).order("version",{ascending:false}).limit(21):Promise.resolve({data:[],error:null}),
 ]);
 if(people.error||balances.error||entries.error||changes.error)return reply({error:"Shared expenses couldn’t be loaded. Your saved entries are unchanged."},503);
 if(id&&!entries.data?.length)return reply({error:"This entry is no longer available in your household."},404);
 const rows=entries.data??[],page=rows.slice(0,40);
 return reply({
  settlementNotices:appNotificationsEnabled(),home:{id:access.home.id,name:access.home.nickname},role:access.role,people:people.data,balances:balances.data,
  entries:page.map(e=>({...e,canEdit:!e.voided&&(access.role==="owner"||e.created_by===auth.user.id)})),
  changes:(changes.data??[]).slice(0,20),moreChanges:(changes.data?.length??0)>20,
  nextCursor:rows.length>40?page[page.length-1].id:null,
 });
}
export async function POST(request:Request){
 const ctx=await context(request);if(ctx.error)return ctx.error;
 const parsed=input.safeParse(await readBoundedJson(request,20000).catch(()=>null));
 if(!parsed.success)return reply({error:"Check this entry and try again."},400);
 const {auth,access}=ctx;
 if(parsed.data.homeId!==access.home.id)return reply({error:"Your household changed. Reopen Shared expenses before saving."},409);

 const sourceBill=parsed.data.command.sourceBillId;
 if(sourceBill!==undefined&&!uuid.safeParse(sourceBill).success)return reply({error:"Choose an available saved bill."},400);
 const guardedRepayment=parsed.data.command.operation==="create"&&parsed.data.command.kind==="repayment"&&parsed.data.command.expectedBalanceCents!==undefined;
 if(guardedRepayment&&!z.number().int().positive().safeParse(parsed.data.command.expectedBalanceCents).success)return reply({error:"Refresh the balance before recording payment."},400);
 const result=sourceBill
  ?await auth.supabase.rpc("rezlee_share_bill_expense",{target_home:access.home.id,request_key:parsed.data.requestId,source_bill:sourceBill,command:parsed.data.command})
  :await auth.supabase.rpc(guardedRepayment?"rezlee_record_shared_repayment":"rezlee_mutate_shared_expense",{target_home:access.home.id,request_key:parsed.data.requestId,command:parsed.data.command});

 if(result.error){
  const code=result.error.code;
  if(code==="42501")return reply({error:"You no longer have permission for this action."},403);
  if(code==="P0002")return reply({error:"This entry is no longer available."},404);
  if(code==="PT409"&&sourceBill){
   const existing=await auth.supabase.from("shared_expense_bill_links").select("entry_id").eq("user_id",auth.user.id).eq("bill_id",sourceBill).maybeSingle();
   if(existing.data)return reply({error:"This bill already has a shared expense.",existingEntryId:existing.data.entry_id},409);
  }
  if(code==="PT409"||code==="40001")return reply({error:"This entry or balance changed. Reload before continuing."},409);
  if(code==="23505")return reply({error:"That person already exists. Choose them from the list."},400);
  if(["22023","22007","22008","22P02","22003"].includes(code))return reply({error:"Check the amount, payment date and people. Shares must add up exactly. If an earlier save succeeded, open it before making changes."},400);
  return reply({error:"We couldn’t confirm the save. Retry the same details to avoid adding it twice."},503);
 }
 if(appNotificationsEnabled()&&(parsed.data.command.kind==="repayment"||parsed.data.command.operation==="void"))after(async()=>{try{await dispatchAppNotifications(createAdminClient(),access.home.id);}catch{console.error("[shared-expenses] Notification delivery deferred");}});
 return reply(result.data);
}

export const GET = withStagingPerformanceTrace(readGET);

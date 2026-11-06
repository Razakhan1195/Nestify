import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid(), requestId = z.string().regex(/^[a-zA-Z0-9-]{8,96}$/), command = z.record(z.string(), z.unknown());
const input = z.discriminatedUnion("action", [
 z.object({action:z.literal("create_group"),requestId,name:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.literal("manage"),groupId:uuid,requestId,command}).strict(),
 z.object({action:z.literal("ledger"),groupId:uuid,requestId,command}).strict(),
 z.object({action:z.literal("accept"),inviteCode:uuid}).strict(),
]);
const publicMessages=new Set(["Choose a group name","Archive a settled group before creating another","Archive a settled group before restoring another","Settle outstanding balances before archiving","Restore this group before making changes","Transfer group ownership before leaving","Enter their account email","This person already joined or has a current invitation","You already belong to this group","Use the same account for this existing participant","This account already joined or was invited","This invitation changed","Choose someone who has joined","This invitation expired or was cancelled","This group is archived","The balance changed. Refresh before recording repayment","This entry changed. Reload before continuing"]);
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});}
function failed(error:{code?:string;message?:string}){
 const code=error.code;
 if(code==="42501")return reply({error:"You don’t have access to this action. For invitations, use the verified email account they were addressed to."},403);
 if(code==="P0002")return reply({error:"This group, entry or invitation is no longer available."},404);
 if(code==="PT409"||code==="40001")return reply({error:publicMessages.has(error.message??"")?error.message:"This group, entry or balance changed. Refresh before continuing."},409);
 if(code==="23505")return reply({error:"That person already exists or has an invitation. Choose them from the list."},400);
 if(["22023","22007","22008","22P02","22003"].includes(code??""))return reply({error:publicMessages.has(error.message??"")?error.message:"Check the name, people, date and amounts. Shares must add up exactly. A group supports up to 40 current participants."},400);
 return reply({error:"We couldn’t confirm this request. Retry the same details to check the save safely."},503);
}
export async function GET(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 const invite=new URL(request.url).searchParams.get("inviteCode");
 if(invite!==null){if(!uuid.safeParse(invite).success)return reply({error:"Check the invitation code."},400);const result=await auth.supabase.rpc("rezlee_preview_expense_group_invite",{invitation_code:invite});return result.error?failed(result.error):reply(result.data);}
 const p=new URL(request.url).searchParams,groupId=p.get("groupId"),id=p.get("id"),before=p.get("before");
 if([groupId,id,before].some(value=>value!==null&&!uuid.safeParse(value).success)||(!groupId&&(id||before)))return reply({error:"Choose an available group or entry."},400);
 // RPCs check expense-only membership. No home or Care membership is resolved or created.
 const result=groupId?await auth.supabase.rpc("rezlee_read_expense_group",{target_group:groupId,entry_id:id,before_id:before}):await auth.supabase.rpc("rezlee_list_expense_groups");
 if(result.error)return failed(result.error);
 if(groupId)return reply(result.data);
 const home=await auth.supabase.from("homes").select("id").limit(1);
 return reply({groups:result.data,hasHome:home.error?null:Boolean(home.data?.length)});
}
export async function POST(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 const parsed=input.safeParse(await readBoundedJson(request,20000).catch(()=>null));if(!parsed.success)return reply({error:"Check this request and try again."},400);
 const v=parsed.data;
 const result=v.action==="create_group"?await auth.supabase.rpc("rezlee_create_expense_group",{request_key:v.requestId,group_name:v.name}):v.action==="accept"?await auth.supabase.rpc("rezlee_accept_expense_group_invite",{invitation_code:v.inviteCode}):await auth.supabase.rpc(v.action==="ledger"?"rezlee_mutate_group_expense":"rezlee_manage_expense_group",{target_group:v.groupId,request_key:v.requestId,command:v.command});
 if(result.error)return failed(result.error);
 return reply(result.data);
}

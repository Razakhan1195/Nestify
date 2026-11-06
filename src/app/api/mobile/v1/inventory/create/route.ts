import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {readBoundedJson} from "@/lib/security/request";
import {inventoryInput} from "@/lib/product/inventory-input";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const input=z.object({requestId:z.string().uuid(),homeId:z.string().uuid(),action:z.enum(["create","cancel"]),fields:inventoryInput.omit({id:true}).strict().optional()}).strict().refine(v=>v.action!=="create"||!!v.fields,"Check the item details.");
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return {response:reply({error:auth.error.message},auth.error.status)} as const;
 const home=await auth.supabase.from("homes").select("id,nickname").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error)return {response:reply({error:"Could not check your home. Try again."},503)} as const;
 if(!home.data)return {response:reply({error:"Set up your own home first."},409)} as const;
 return {...auth,home:home.data} as const;
}
export async function GET(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const requestId=new URL(request.url).searchParams.get("requestId");
 if(requestId&&!z.string().uuid().safeParse(requestId).success)return reply({error:"Choose a valid save."},400);
 const query=ctx.supabase.from("inventory_create_requests").select("request_id,home_id,item_id,state").eq("user_id",ctx.user.id);
 const result=requestId?await query.eq("request_id",requestId).maybeSingle():await query.limit(0);
 if(result.error)return reply({error:"Save recovery is unavailable. Your details stay here; try again shortly."},503);
 if(!requestId)return reply({homeId:ctx.home.id,homeName:ctx.home.nickname,createRecovery:true});
 const row=result.data as {home_id:string;item_id:string|null;state:string}|null;
 if(row&&row.home_id!==ctx.home.id)return reply({error:"Return to the home where you started this save."},409);
 return reply({homeId:ctx.home.id,state:row?row.state==="saved"&&!row.item_id?"deleted":row.state:"unknown",itemId:row?.item_id??null});
}
export async function POST(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const body=input.safeParse(await readBoundedJson(request,8192).catch(()=>null));
 if(!body.success)return reply({error:body.error.issues[0]?.message??"Check the item details."},400);
 const value=body.data;
 if(value.homeId!==ctx.home.id)return reply({error:"Return to the home where you started this save."},409);
 const result=value.action==="cancel"
  ?await ctx.supabase.rpc("cancel_rezlee_home_item_create",{p_home:value.homeId,p_request:value.requestId})
  :await ctx.supabase.rpc("create_rezlee_home_item",{p_home:value.homeId,p_request:value.requestId,p_values:value.fields});
 if(result.error){
  const status=result.error.code==="PT400"?400:result.error.code==="PT409"?409:result.error.code==="PT410"?410:503;
  return reply({error:status===410?"This save was cancelled or its item was deleted. It will not be recreated.":status===409?"This save changed or belongs to another home. Check its saved state before continuing.":status===400?"Check the item details.":"Could not confirm the save. Check its saved state before retrying."},status);
 }
 return reply(result.data);
}

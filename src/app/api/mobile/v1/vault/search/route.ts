import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
export const dynamic="force-dynamic";
const cursorSchema=z.object({time:z.string().datetime({offset:true}),id:z.string().uuid(),kind:z.enum(["document","item"])}).strict();
const inputSchema=z.object({view:z.enum(["documents","items","warranties"]),q:z.string().trim().max(100),cursor:cursorSchema.nullable()});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 const url=new URL(request.url),raw=url.searchParams.get("cursor");let cursor:unknown=null;
 try{if(raw){if(raw.length>300)throw Error();cursor=JSON.parse(raw);}}catch{return reply({error:"Refresh your search and try again."},400);}
 const input=inputSchema.safeParse({view:url.searchParams.get("view")??"documents",q:url.searchParams.get("q")??"",cursor});
 if(!input.success)return reply({error:"Use a search of up to 100 characters and choose a Vault view."},400);
 const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error)return reply({error:"Could not check your home. Try again."},503);if(!home.data)return reply({needsOnboarding:true});
 const b=input.data,result=await auth.supabase.rpc("search_rezlee_vault",{p_home:home.data.id,p_view:b.view,p_query:b.q,p_before_time:b.cursor?.time??null,p_before_id:b.cursor?.id??null,p_before_kind:b.cursor?.kind??null});
 if(result.error)return reply({error:"Could not search your saved entries. Try again."},503);
 return reply({...result.data,view:b.view,query:b.q});
}

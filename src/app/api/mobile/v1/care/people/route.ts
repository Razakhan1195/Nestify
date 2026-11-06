import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { readBoundedJson } from "@/lib/security/request";
const input = z.object({homeId:z.string().uuid(),id:z.string().uuid(),displayName:z.string().trim().min(1).max(80)}).strict();
export async function POST(request:Request) {
  const auth=await authenticateMobileRequest(request);
  if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
  const parsed=input.safeParse(await readBoundedJson(request,2000).catch(()=>null));
  if(!parsed.success)return Response.json({error:"Enter a name or nickname."},{status:400});
  const access=await resolveAccessibleHome(auth.supabase,auth.user.id);
  if(access.error||!access.data||access.data.role!=="owner"||access.data.home.id!==parsed.data.homeId)return Response.json({error:"Only the household owner can add people."},{status:403});
  const {data,error}=await auth.supabase.rpc("rezlee_add_managed_care_person",{target_home:parsed.data.homeId,person_id:parsed.data.id,person_name:parsed.data.displayName});
  if(error)return Response.json({error:error.code==="PT409"?"That name is already in your household. Choose the existing person or use a different nickname.":"Couldn’t add this person. Check your connection and try again."},{status:error.code==="PT409"?409:503});
  return Response.json({member:data},{headers:{"Cache-Control":"no-store"}});
}

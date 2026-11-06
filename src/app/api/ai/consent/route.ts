import {createClient} from "@/lib/supabase/server";
import {aiConsentResponse} from "@/lib/ai/consent-api";
export const dynamic="force-dynamic";
async function handle(request:Request){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return Response.json({error:"Sign in to manage AI privacy."},{status:401,headers:{"Cache-Control":"private, no-store"}});if(request.method==="POST"&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Open this page in Rezlee and try again."},{status:403});return aiConsentResponse(db,request);}
export const GET=handle;
export const POST=handle;

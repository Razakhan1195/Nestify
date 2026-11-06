import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {aiConsentResponse} from "@/lib/ai/consent-api";
export const dynamic="force-dynamic";
async function handle(request:Request){const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status,headers:{"Cache-Control":"private, no-store"}});return aiConsentResponse(auth.supabase,request);}
export const GET=handle;
export const POST=handle;

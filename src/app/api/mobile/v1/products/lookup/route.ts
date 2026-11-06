import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBarcode, productSuggestions } from "@/lib/product/barcode";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic="force-dynamic";
export const maxDuration=30;
export async function POST(request:Request) {
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 const raw=await readBoundedJson(request,1024).catch(()=>null) as {barcode?:unknown}|null;
 const barcode=normalizeBarcode(raw?.barcode);
 if(!barcode)return Response.json({error:"Enter a valid 12-digit UPC or 13-digit EAN product barcode."},{status:400});
 const db=createAdminClient();
 const cached=await db.from("product_lookup_cache").select("payload").eq("barcode",barcode).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(cached.error)return Response.json({error:"Product lookup is unavailable. You can enter details manually."},{status:503});
 if(cached.data)return Response.json(cached.data.payload);
 // Reserve one of 80 daily pilot requests atomically, leaving headroom under the free quota.
 const day=new Date().toISOString().slice(0,10);
 let reserved=false;
 for(let attempt=0;attempt<3&&!reserved;attempt++){
  const used=await db.from("product_lookup_requests").select("slot,user_id").eq("day",day);
  if(used.error)return Response.json({error:"Product lookup is unavailable. Enter details manually."},{status:503});
  const rows=used.data??[];
  if(rows.length>=80||rows.filter(r=>r.user_id===auth.user.id).length>=10)return Response.json({error:"Product lookup has reached its daily limit. You can still scan the product label or enter details manually."},{status:429});
  const slots=new Set(rows.map(r=>r.slot));const slot=Array.from({length:80},(_,i)=>i).find(i=>!slots.has(i))!;
  const result=await db.from("product_lookup_requests").insert({day,slot,user_id:auth.user.id});
  if(result.error&&result.error.code!=="23505")return Response.json({error:"Product lookup is unavailable. Enter details manually."},{status:503});
  reserved=!result.error;
 }
 if(!reserved)return Response.json({error:"Product lookup is busy. Please try again shortly."},{status:429});
 try {
  const key=process.env.UPCITEMDB_API_KEY;
  const endpoint=key?"https://api.upcitemdb.com/prod/v1/lookup":"https://api.upcitemdb.com/prod/trial/lookup";
  const response=await fetch(endpoint+"?upc="+encodeURIComponent(barcode),{headers:{Accept:"application/json",...(key?{user_key:key,key_type:"3scale"}:{})},cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(response.status===429)return Response.json({error:"The product directory is busy or has reached its limit. Try later or enter details manually."},{status:429});
  if(!response.ok)throw new Error("Lookup unavailable");
  const body=await response.json();
  if(body.code!=="OK")throw new Error("Lookup unavailable");
  const suggestions=productSuggestions(body,barcode);
  const payload={barcode,source:"UPCitemdb",suggestions};
  // A cache failure must not discard an otherwise useful lookup result.
  await db.from("product_lookup_cache").upsert({barcode,payload,expires_at:new Date(Date.now()+3600000).toISOString()});
  return Response.json(payload);
 }catch{return Response.json({error:"Could not reach the product directory. Try again or enter the details manually."},{status:503});}
}

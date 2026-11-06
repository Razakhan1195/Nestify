import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
export async function requireProviderOperational(registryId:string|null){
 if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED!=="true"||!registryId)return;
 const r=await createAdminClient().from("rezlee_provider_controls").select("paused").eq("provider_key",registryId).maybeSingle();
 if(r.error)throw Error("We could not check this connection. Try again shortly.");
 if(r.data?.paused)throw Error("This provider connection is temporarily paused while we resolve an issue. Your saved bills are safe; you can upload a statement.");
}


export async function readProviderControls(){
 if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED!=="true")return [];
 const r=await createAdminClient().from("rezlee_provider_controls").select("provider_key,paused,evidence,verified_at").limit(1000);
 if(r.error)throw Error("Connection availability could not be checked.");
 return r.data??[];
}
export async function requireEzgbOperational(name:string|null){
 if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED!=="true")return;
 const {canonicalEzgbUtility}=await import("@/lib/ezgb/connection-attempt");
 const {default:catalog}=await import("@/lib/provider-directory/catalog.json");
 const canonical=canonicalEzgbUtility(name);
 const row=catalog.providers.find(p=>"method" in p&&p.method==="green_button"&&p.name===canonical);
 if(row){await requireProviderOperational("green_button:"+row.id);return;}
 const controls=await readProviderControls();
 if(controls.some(c=>c.paused&&c.provider_key.startsWith("green_button:")))throw Error("Choose a currently available utility in Find your provider.");
}

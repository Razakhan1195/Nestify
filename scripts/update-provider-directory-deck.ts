/** Bounded staging configuration update. No credentials, sessions, task runs or schedules are created. */
import fs from "node:fs";
import { authenticationTask, canadianBillTask } from "../src/lib/deck/canadian-bill-task";
import { allowsNewDeckProvider } from "../src/lib/deck/gta-launch";
type Row = {id:string;name:string;website_url:string;utility_type:string;connectionNote:string;metadata:Record<string,unknown>;deck_source_id?:string;deck_task_id?:string};
async function main() {
 const cp="docs/checkpoints/provider-directory-20261011";
 const settings=JSON.parse(fs.readFileSync(process.env.HOME+"/Library/Application Support/Rezlee/rogers-hosted-staging-settings.json","utf8"));
 if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Isolated staging required");
 const before=JSON.parse(fs.readFileSync(cp+"/registry-before.json","utf8")) as Row[];
 const deckBefore=JSON.parse(fs.readFileSync(cp+"/deck-before.json","utf8")).providers;
 const catalog=JSON.parse(fs.readFileSync("src/lib/deck/canadian-provider-catalog.json","utf8")) as Row[];
 const selected=catalog.filter(p=>allowsNewDeckProvider(p.id)); if(selected.length!==29)throw Error("Expected 29 authorized providers");
 const results:Record<string,unknown>[]=[];
 async function deck(path:string,body?:unknown) {
  const r=await fetch("https://api.deck.co/v2"+path,{method:body?"PATCH":"GET",headers:{Authorization:"Bearer "+settings.DECK_API_KEY,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error("Deck configuration failed "+r.status+" "+path);
  return r.json();
 }
 const apply=process.argv.includes("--apply");
 for(const p of selected) {
  const old=before.find(r=>r.id===p.id)!;const backup=deckBefore.find((r:{id:string})=>r.id===p.id);
  if(!old?.deck_source_id || !backup?.authentication?.id || !backup?.history?.id)throw Error("Missing reviewed configuration "+p.name);
  const authSpec=authenticationTask(p.name,p.name==="Bell",p.website_url,p.connectionNote);
  const historySpec=canadianBillTask(p.name,p.utility_type);
  if(apply) {
   if(p.website_url!==old.website_url)await deck("/sources/"+old.deck_source_id,{url:p.website_url});
   await deck("/tasks/"+backup.authentication.id,{prompt:authSpec.prompt});
   if(p.name!=="Bell")await deck("/tasks/"+backup.history.id,{prompt:historySpec.prompt});
   const r=await fetch(settings.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/provider_registry?id=eq."+p.id,{method:"PATCH",headers:{apikey:settings.SUPABASE_SECRET_KEY,Authorization:"Bearer "+settings.SUPABASE_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({website_url:p.website_url,metadata:{...old.metadata,connection_note:p.connectionNote,portal_reviewed_at:"2026-10-11",deck_prompt_reviewed_at:"2026-10-11",deck_pilot_readiness:"configured_not_live_verified"}}),signal:AbortSignal.timeout(25000)});
   if(!r.ok)throw Error("Staging registry update failed "+r.status+" "+p.name);
   const [source,authentication,history]=await Promise.all([deck("/sources/"+old.deck_source_id),deck("/tasks/"+backup.authentication.id),deck("/tasks/"+backup.history.id)]);
   if(authentication.prompt!==authSpec.prompt || (p.name!=="Bell" && history.prompt!==historySpec.prompt))throw Error("Prompt readback mismatch "+p.name);
   if(p.website_url!==old.website_url && new URL(source.website?.url).href!==new URL(p.website_url).href)throw Error("Source URL readback mismatch "+p.name);
   results.push({id:p.id,name:p.name,websiteUrl:p.website_url,source,authentication,history,liveSignInVerified:false});
   fs.writeFileSync(cp+"/deck-after.json",JSON.stringify({updatedAt:new Date().toISOString(),runsStarted:0,providers:results},null,2));
  }else results.push({id:p.id,name:p.name,urlChanged:p.website_url!==old.website_url,authenticationPrompt:authSpec.prompt,historyPreserved:p.name==="Bell"});
 }
 console.log(JSON.stringify({apply,providers:results.length,runsStarted:0,sourceIdsPreserved:true,bellHistoryPreserved:true}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Configuration update failed");process.exitCode=1;});

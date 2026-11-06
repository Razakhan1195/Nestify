/** Configure customer-started imports only. This script never creates credentials or runs tasks. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {gtaProviderChoice} from "../src/lib/deck/gta-launch";
import {createAdminClient} from "../src/lib/supabase/admin";
import {authenticationTask,canadianBillTask,canadianBillContract} from "../src/lib/deck/canadian-bill-task";
const apply=process.argv.includes("--apply");
const root="docs/checkpoints/deck-customer-pilot-20261011";
type Item={id:string;name:string;status?:string;agent_id?:string;website?:{url:string}};
type Provider={id:string;name:string;website_url:string;utility_type:string;province_region?:string;metadata:Record<string,unknown>;deck_source_id?:string|null;deck_agent_id?:string|null;searchAliases:string[];connectionNote:string;sourceConfig?:Record<string,unknown>;fallback?:boolean};
async function api<T>(path:string,body?:unknown,method?:string):Promise<T>{
 const r=await fetch("https://api.deck.co/v2"+path,{method:method??(body?"POST":"GET"),signal:AbortSignal.timeout(25000),headers:{Authorization:"Bearer "+process.env.DECK_API_KEY,"Content-Type":"application/json",...(body?{"Idempotency-Key":"rezlee-pilot-"+createHash("sha256").update(path+JSON.stringify(body)).digest("hex").slice(0,48)}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error("Deck request failed: "+r.status+" "+path);
 return r.json() as Promise<T>;
}
async function list(path:string){const all:Item[]=[];let cursor:string|undefined;do{const page=await api<{data:Item[];has_more?:boolean;next_cursor?:string}>(path+(path.includes("?")?"&":"?")+"limit=100"+(cursor?"&cursor="+encodeURIComponent(cursor):""));all.push(...page.data);cursor=page.has_more?page.next_cursor:undefined;}while(cursor);return all;}
async function main(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Only isolated staging is authorized by this script.");
 const db=createAdminClient(),catalog=JSON.parse(readFileSync("src/lib/deck/canadian-provider-catalog.json","utf8")) as Provider[];
 const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7);
 const before=await db.from("provider_registry").select("*");if(before.error)throw Error("Registry read failed");
 mkdirSync(root,{recursive:true});
 if(!apply){console.log(JSON.stringify({entries:catalog.length,hosted:catalog.filter(p=>gtaProviderChoice(p.id)?.route==="deck").length,alternatives:catalog.filter(p=>gtaProviderChoice(p.id)?.route==="document").map(p=>p.name),runs:0}));return;}
 if(!process.env.DECK_API_KEY)throw Error("Deck credentials unavailable");
 if(!readFileSync("src/lib/deck/canadian-provider-catalog.json","utf8"))throw Error();
 if(!existsSync(root+"/registry-before.json")) writeFileSync(root+"/registry-before.json",JSON.stringify(before.data,null,2));
 const agents=await list("/agents"),mappings=only && existsSync(root+"/provisioned.json") ? JSON.parse(readFileSync(root+"/provisioned.json","utf8")).mappings.filter((m:{registryId:string})=>m.registryId!==catalog.find(p=>p.name===only)?.id) : [];
 for(const p of catalog){
  if(only && p.name!==only) continue;
  const launchChoice = gtaProviderChoice(p.id);
  if (launchChoice?.route !== "deck" && launchChoice?.route !== "document") continue;
  // Already-provisioned hydro entries are retained for existing connections, never re-provisioned for a second connection.
  if (launchChoice.greenButton) continue;
  const old=before.data.find(r=>r.id===p.id);
  const base={id:p.id,name:p.name,utility_type:p.utility_type,website_url:p.website_url,province_region:old?.province_region??p.province_region??"Canada",metadata:{...old?.metadata,search_aliases:p.searchAliases,connection_note:p.connectionNote,portal_reviewed_at:"2026-10-11",deck_pilot_readiness:p.fallback?"document_alternative":"configured_not_live_verified"}};
  if(p.fallback){const q=await db.from("provider_registry").upsert({...base,status:"needs_mapping",metadata:{...base.metadata,deck_document_alternative:true}},{onConflict:"id"});if(q.error)throw Error("Fallback mapping failed: "+p.name);mappings.push({name:p.name,registryId:p.id,mode:"document_alternative"});continue;}
  const source = await api<Item>("/sources",{name:p.name,type:"website",website:{url:p.website_url}});
  const agentName="Rezlee "+p.name+" Canada";
  let agent=old?.deck_agent_id?agents.find(a=>a.id===old.deck_agent_id):agents.find(a=>a.name===agentName);
  if(!agent){agent=await api<Item>("/agents",{name:agentName,description:"Read-only Canadian original bill retrieval with a customer-selected 1–6 month range. No scheduled pulls."});agents.push(agent);}
  const tasks=await list("/tasks?agent_id="+agent.id);
  const authSpec=authenticationTask(p.name,p.name==="Bell",p.website_url);
  let auth=tasks.find(t=>t.name===authSpec.name);
  if(!auth)auth=await api<Item>("/tasks",{agent_id:agent.id,...authSpec});
  else auth=await api<Item>("/tasks/"+auth.id,{prompt:authSpec.prompt},"PATCH");
  let history:Item|undefined;
  // Preserve the Bell history task that already delivered six verified originals.
  if(p.name==="Bell" && typeof old?.metadata?.deck_telecom_history_task_id==="string") history=await api<Item>("/tasks/"+old.metadata.deck_telecom_history_task_id);
  else {const spec=canadianBillTask(p.name);history=tasks.find(t=>t.name===spec.name);if(!history)history=await api<Item>("/tasks",{agent_id:agent.id,...spec});else history=await api<Item>("/tasks/"+history.id,{prompt:spec.prompt},"PATCH");}
  const patch={...base,status:"active",deck_source_id:source.id,deck_agent_id:agent.id,deck_task_id:history.id,deck_auth_method:p.sourceConfig?"source_fields":"username_password",deck_persistence_enabled:true,deck_task_input:{},metadata:{...base.metadata,primary_sync_mode:"bill",deck_bill_contract:canadianBillContract,deck_authentication_task_id:auth.id,deck_telecom_history_task_id:history.id,deck_session_strategy:"reuse",deck_mapping_status:"pilot_unverified",deck_document_alternative:false,deck_hosted_source_config:p.sourceConfig??null,deck_capabilities:{latest_bill:history.id,bills_since_date:history.id}}};
  const q=await db.from("provider_registry").upsert(patch,{onConflict:"id"});if(q.error)throw Error("Registry mapping failed: "+p.name+" "+q.error.code);
  mappings.push({name:p.name,registryId:p.id,websiteUrl:p.website_url,sourceId:source.id,agentId:agent.id,taskId:history.id,authenticationTaskId:auth.id,mode:"hosted",liveVerified:p.name==="Bell"?"history_only":false});
  writeFileSync(root+"/provisioned.json",JSON.stringify({mappings,runsStarted:0,updatedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify({provider:p.name,configured:true,liveVerified:false}));
 }
 writeFileSync(root+"/provisioned.json",JSON.stringify({mappings,runsStarted:0,updatedAt:new Date().toISOString()},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Provisioning failed");process.exitCode=1;});

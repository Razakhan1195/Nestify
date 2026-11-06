/** Staging activation prerequisite. Never enables public admission, schedules or sends provider credentials. */
import {readFileSync,writeFileSync} from "node:fs";
import {createAdminClient} from "../src/lib/supabase/admin";
import {telecomVersion} from "../src/lib/deck/telecom-spec";
const apply=process.argv.includes("--apply");
async function main(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("This mapping script is restricted to isolated staging.");
 const manifest=JSON.parse(readFileSync("docs/checkpoints/deck-telecom-agents-20261004.json","utf8")) as {mappings:Array<{name:string;sourceId:string;websiteUrl:string;agentId:string;taskId:string;historyTaskId:string}>};
 const db=createAdminClient();const rollback=[];
 for(const m of manifest.mappings){
  const result=await db.from("provider_registry").select("*").ilike("name",m.name).single();if(result.error||!result.data)throw Error(`Could not resolve ${m.name}`);
  const p=result.data;rollback.push(p);
  if(apply)writeFileSync("docs/checkpoints/deck-telecom-registry-before.json",JSON.stringify(rollback,null,2)+"\n");
  const patch={website_url:m.websiteUrl,deck_source_id:m.sourceId,deck_agent_id:m.agentId,deck_task_id:m.taskId,deck_persistence_enabled:true,deck_task_input:{},metadata:{...p.metadata,primary_sync_mode:"bill",deck_session_strategy:"reuse",deck_telecom_contract:telecomVersion,deck_telecom_history_task_id:m.historyTaskId,deck_mapping_status:"pilot_unverified",deck_capabilities:{latest_bill:m.taskId,bills_since_date:m.historyTaskId}}};
  if(apply){const r=await db.from("provider_registry").update(patch).eq("id",p.id);if(r.error)throw Error(`Could not map ${m.name}`);}
  console.log(JSON.stringify({provider:m.name,registryId:p.id,applied:apply,status:"Pilot mapping; not public launch acceptance"}));
 }
 if(apply)writeFileSync("docs/checkpoints/deck-telecom-registry-before.json",JSON.stringify(rollback,null,2)+"\n");
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Mapping failed");process.exitCode=1;});

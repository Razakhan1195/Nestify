/**
 * Safely enforce the same original-PDF retrieval contract on every
 * configured provider-history task. No credentials, task runs or schedules.
 * Target: isolated Rezlee staging provider registry, Deck task configs only.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { originalRetrievalGate, originalRetrievalGateTag } from "../src/lib/deck/original-retrieval-gate";

const apply = process.argv.includes("--apply");
const settings = JSON.parse(readFileSync(join(process.env.HOME!, "Library/Application Support/Rezlee/rogers-hosted-staging-settings.json"), "utf8"));
if (settings.NEXT_PUBLIC_SUPABASE_URL !== "https://gjwvalpxnfbvryosmcbj.supabase.co") throw Error("Refusing non-staging mapping.");
const db = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
type Provider = {name:string;status:string;deck_task_id:string|null;metadata:Record<string,unknown>|null};
type Task = {id:string;name:string;prompt:string;storage?:{enabled?:boolean};input_schema?:{required?:string[];properties?:Record<string,unknown>}};
const checkpoint = join(process.env.HOME!, "Library/Application Support/Rezlee/deck-original-gate-20261014");
mkdirSync(checkpoint, {recursive:true});

async function deckTask(id:string, patch?:{prompt:string}):Promise<Task>{
  const response=await fetch("https://api.deck.co/v2/tasks/"+encodeURIComponent(id),{
    method:patch?"PATCH":"GET",signal:AbortSignal.timeout(25000),
    headers:{"Authorization":"Bearer "+settings.DECK_API_KEY,"Content-Type":"application/json"},
    ...(patch?{body:JSON.stringify(patch)}:{})
  });
  if(!response.ok)throw Error("Deck "+response.status+" for "+id);
  return response.json() as Promise<Task>;
}
async function main(){
  const r=await db.from("provider_registry").select("name,status,deck_task_id,metadata");
  if(r.error)throw Error("Registry read failed: "+r.error.message);
  const providerRows=(r.data as Provider[]).filter(p=>p.status==="active" &&
    (p.metadata?.deck_bill_contract==="ca-bills-20261011-v1" ||
     p.metadata?.deck_telecom_contract==="ca-telecom-20261004-v1") &&
    typeof p.metadata?.deck_telecom_history_task_id==="string");
  if(providerRows.length!==52)throw Error("Expected 52 configured hosted providers, got "+providerRows.length);
  const tasks=new Map<string,string[]>();
  for(const p of providerRows){
    const id=String(p.metadata!.deck_telecom_history_task_id);
    tasks.set(id,[...(tasks.get(id)||[]),p.name]);
  }
  const errors:string[]=[];
  const backups:Array<{id:string;names:string[];originalPrompt:string;patchedPrompt:string}>=[];
  for(const [id,names] of tasks){
    const task=await deckTask(id);
    if(!task.id || !/bill history|original bill history/i.test(task.name))errors.push("Unexpected task name "+id);
    if(task.storage?.enabled!==true)errors.push("Storage disabled "+id);
    if(!task.input_schema?.properties?.since_date||!task.input_schema?.properties?.until_date)errors.push("Missing date boundary inputs "+id);
    if(!task.prompt)errors.push("Missing prompt "+id);
    const base=task.prompt?.split(originalRetrievalGateTag)[0].trimEnd()||"";
    const normalized=base.endsWith(":")?base:base;
    backups.push({id,names,originalPrompt:task.prompt,patchedPrompt:normalized+" "+originalRetrievalGate});
  }
  if(errors.length)throw Error(errors.join("; "));
  writeFileSync(join(checkpoint,"before.json"),JSON.stringify(backups.map(v=>({id:v.id,names:v.names,prompt:v.originalPrompt})),null,2),{mode:0o600});
  console.log(JSON.stringify({apply,providers:providerRows.length,uniqueTasks:backups.length,invalid:errors.length,alreadyConfigured:backups.filter(b=>b.originalPrompt===b.patchedPrompt).length}));
  if(!apply)return;
  const verified:string[]=[];
  for(let i=0;i<backups.length;i+=4){
    const chunk=backups.slice(i,i+4);
    await Promise.all(chunk.map(async row=>{
      if(row.originalPrompt!==row.patchedPrompt)await deckTask(row.id,{prompt:row.patchedPrompt});
      const readback=await deckTask(row.id);
      if(readback.prompt!==row.patchedPrompt||readback.storage?.enabled!==true)throw Error("Readback failed "+row.id);
      verified.push(row.id);
    }));
    console.log("Verified "+verified.length+"/"+backups.length+" bill history tasks");
    writeFileSync(join(checkpoint,"verified.json"),JSON.stringify({updatedAt:new Date().toISOString(),verified,expected:backups.length,range:"customer selected 1–6 months only",runsStarted:0},null,2));
  }
  console.log(JSON.stringify({configuredProviders:providerRows.length,verifiedTasks:verified.length,allVerified:verified.length===backups.length,liveRunsStarted:0}));
}
main().catch(e=>{console.error("ERROR",e instanceof Error?e.message:"Unknown error");process.exitCode=1});

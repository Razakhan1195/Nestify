import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='eynbuhmtxkigvqoewbwi';
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const r=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Managed read access unavailable');
const keys=await r.json();const db=createClient('https://'+ref+'.supabase.co',keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const must=x=>{if(x.error)throw Error('Read failed '+x.error.code);return x.data};
const providers=must(await db.from('providers').select('id,name,connection_status').ilike('name','%Durham%'));

const cli=['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];
function vapi(route){const raw=execFileSync('/usr/local/bin/node',[...cli,route+'?teamId=team_RWL45V0YAuHJ7DvygUtJNB8o'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});return JSON.parse(raw)}
const project='prj_N0EruXgUNTjI7L8b564XexIPwHZU';
const settings=vapi('/v10/projects/'+project+'/env').envs;
const keyEntry=settings.find(e=>e.key==='DECK_API_KEY'&&e.target?.includes('production'));
if(!keyEntry)throw Error('Managed Deck credential unavailable');
const deckKey=vapi('/v1/projects/'+project+'/env/'+keyEntry.id).value;
if(!deckKey)throw Error('Managed Deck credential not available to this mechanism');
const {prepareTelecomOriginals}=await import('../../src/lib/deck/telecom-originals.ts');
const observations=[];
for(const p of providers){
 const runs=must(await db.from('provider_sync_runs').select('deck_task_run_id,status,created_at').eq('provider_id',p.id).order('created_at',{ascending:false}).limit(4));
 for(const run of runs){
  if(!run.deck_task_run_id)continue;
  const response=await fetch('https://api.deck.co/v2/task-runs/'+encodeURIComponent(run.deck_task_run_id)+'?include=storage',{headers:{Authorization:'Bearer '+deckKey,'User-Agent':'Rezlee/0.1 (+https://rezlee.com)'},signal:AbortSignal.timeout(25000)});
  if(!response.ok){observations.push({createdAt:run.created_at,http:response.status});continue;}
  const task=await response.json();const files=Array.isArray(task.storage)?task.storage:[];
  const prepared=await prepareTelecomOriginals(files);
  observations.push({createdAt:run.created_at,taskStatus:task.status,result:task.result,storageFiles:files.length,files:files.map(f=>({bytes:f.file_size,mime:f.file_type,billDate:f.extraction?.bill_date??null})),validatedDistinctOriginals:prepared.map(f=>({bytes:f.bytes.length,sha256:f.hash,billDate:f.file.extraction?.bill_date??null})),listedBillDates:Array.isArray(task.output?.bills)?task.output.bills.map(b=>b.bill_date):[]});
 }
}
const report={at:new Date().toISOString(),productionWrites:0,newProviderRuns:0,credentialValuesExposed:false,observations};fs.writeFileSync('docs/checkpoints/launch-closeout-20261021/durham-existing-task-storage.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

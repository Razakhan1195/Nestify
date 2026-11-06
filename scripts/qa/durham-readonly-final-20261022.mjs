import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='eynbuhmtxkigvqoewbwi';
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const r=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Managed read access unavailable');
const keys=await r.json();const db=createClient('https://'+ref+'.supabase.co',keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const must=x=>{if(x.error)throw Error('Read failed '+x.error.code);return x.data};
const providers=must(await db.from('providers').select('id,name,connection_status').ilike('name','%Durham%'));
const observations=[];
for(const p of providers){
 const imports=must(await db.from('deck_telecom_imports').select('status,since_date,until_date,phase_index,all_complete,created_at,finished_at,bill_ids,original_ids,coverage').eq('provider_id',p.id).order('created_at',{ascending:false}).limit(3));
 const bills=must(await db.from('bills').select('issue_date,pdf_available,original_document_id').eq('provider_id',p.id).order('issue_date',{ascending:false}));
 observations.push({name:p.name,connectionStatus:p.connection_status,imports:imports.map(x=>({status:x.status,since:x.since_date,until:x.until_date,createdAt:x.created_at,finishedAt:x.finished_at,allComplete:x.all_complete,savedBills:x.bill_ids.length,originals:x.original_ids.length,coverage:x.coverage.map(c=>({status:c.status,since:c.since_date,until:c.until_date,listed:c.listed_bill_count,missingDates:c.missing_bill_dates}))})),bills:bills.map(b=>({issueDate:b.issue_date,pdfAvailable:b.pdf_available,originalLinked:!!b.original_document_id}))});
}
const report={at:new Date().toISOString(),productionWrites:0,providerCalls:0,observations};fs.writeFileSync('docs/checkpoints/launch-closeout-20261021/durham-readonly-final.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

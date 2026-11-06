import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {runReleaseSoak} from './release-soak-in-memory.mjs';
const ref='gjwvalpxnfbvryosmcbj',origin='https://'+ref+'.supabase.co';
const output=path.resolve('docs/checkpoints/release-config-20261021/load-acceptance');
fs.mkdirSync(output,{recursive:false,mode:0o700});
const run=randomUUID(),fixtures=[],control={stop:false};let admin,metricsTimer,metricIndex=0,metricBusy=false,metricErrors=0,failure=null,result=null,metricsSecret;
const stamp=()=>new Date().toISOString(),save=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const status=stage=>{save('status.json',{at:stamp(),pid:process.pid,run,stage,fixtures:fixtures.length,metricSamples:metricIndex,metricErrors});console.log(JSON.stringify({at:stamp(),stage,fixtures:fixtures.length}),null,2);};
const must=r=>{if(r.error)throw Error('Staging fixture operation failed '+(r.error.code||r.error.status||'unknown'));return r.data;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
process.on('SIGTERM',()=>{control.stop=true;});process.on('SIGINT',()=>{control.stop=true;});
async function metrics(){
 if(metricBusy)return;metricBusy=true;
 try{
  const r=await fetch(origin+'/customer/v1/privileged/metrics',{headers:{Authorization:'Basic '+Buffer.from('service_role:'+metricsSecret).toString('base64')},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('metrics_status_'+r.status);
  const body=await r.text();fs.writeFileSync(path.join(output,'capacity-'+metricIndex+'.prom'),body);save('capacity-'+metricIndex+'-time.json',{at:stamp()});metricIndex++;
 }catch{metricErrors++;}finally{metricBusy=false;}
}
try{
 const d=JSON.parse(fs.readFileSync(path.resolve('docs/checkpoints/release-config-20261021/staging-alias-acceptance.json')));
 if(d.stagingDeploymentId!=='dpl_6nsQKQ2yDjKxN4jf7wVKYim5njif'||d.hostedExitCode!==0)throw Error('Candidate is not accepted at staging alias');
 status('preparing-synthetic-fixtures');
 const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const keyResponse=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});
 if(!keyResponse.ok)throw Error('Staging management access unavailable');
 const keys=await keyResponse.json(),secret=keys.find(k=>k.name==='service_role')?.api_key,anonKey=keys.find(k=>k.name==='anon')?.api_key;
 if(!secret||!anonKey)throw Error('Staging keys unavailable');
 admin=createClient(origin,secret,options);metricsSecret=secret;
 for(let i=0;i<300;i++){
  if(control.stop)throw Error('Preparation interrupted');await sleep(2000);
  const email='load-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const f={id:user.id};fixtures.push(f);save('fixture-journal.json',{projectRef:ref,run,userIds:fixtures.map(f=>f.id)});
  const client=createClient(origin,anonKey,options),session=must(await client.auth.signInWithPassword({email,password})).session;
  Object.assign(f,{token:session.access_token,refreshToken:session.refresh_token});
  const home=must(await admin.from('homes').insert({user_id:f.id,nickname:'Synthetic load household'}).select('id').single());f.home=home.id;
  must(await admin.from('bills').insert(Array.from({length:12},(_,j)=>({home_id:f.home,user_id:f.id,name:'Synthetic bill '+j,amount:55+j,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'}))));
  must(await admin.from('documents').insert(Array.from({length:8},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic record '+j,document_type:'receipt'}))));
  must(await admin.from('maintenance_tasks').insert(Array.from({length:6},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic task '+j,status:'open',due_date:'2026-10-25'}))));
  if((i+1)%20===0)status('preparing-synthetic-fixtures');
 }
 const earliest=Math.min(...fixtures.map(f=>JSON.parse(Buffer.from(f.token.split('.')[1],'base64url')).exp*1000));
 if(earliest-Date.now()<33*60000){
  status('refreshing-in-memory-sessions');
  for(const f of fixtures){if(control.stop)throw Error('Preparation interrupted');const c=createClient(origin,anonKey,options);const session=must(await c.auth.refreshSession({refresh_token:f.refreshToken})).session;f.token=session.access_token;f.refreshToken=session.refresh_token;await sleep(300);}
 }
 status('running-30-minute-soak');await metrics();metricsTimer=setInterval(metrics,20000);
 result=await runReleaseSoak({run,users:fixtures,anonKey},output,control);
 if(!result.pass)failure='Full soak acceptance failed; see measured report';
}catch(e){failure=String(e.message||e).slice(0,500);}
finally{
 if(metricsTimer)clearInterval(metricsTimer);
 status('cleaning-fixtures');
 const cleanup={at:stamp(),run,created:fixtures.length,deleted:0,verifiedAbsent:0,errors:[],sessionFilesWritten:0};
 if(admin)for(const f of fixtures){
  try{
   const found=must(await admin.auth.admin.getUserById(f.id));if(found.user.user_metadata?.qa_run!==run)throw Error('Fixture ownership mismatch');
   must(await admin.auth.admin.deleteUser(f.id));cleanup.deleted++;
   const after=await admin.auth.admin.getUserById(f.id);if(after.error?.status===404)cleanup.verifiedAbsent++;else throw Error('Fixture remains');
  }catch(e){cleanup.errors.push({userId:f.id,error:String(e.message).slice(0,150)});}
 }
 save('load-cleanup-report.json',cleanup);
 const final={at:stamp(),deploymentId:'dpl_6nsQKQ2yDjKxN4jf7wVKYim5njif',pass:Boolean(result?.pass)&&cleanup.errors.length===0,failure,requests:result?.phases?.[0]?.requests??0,metricSamples:metricIndex,metricErrors,cleanup,phoneAcceptance:false,providerAiUploadCapacityEstablished:false};
 save('summary.json',final);status(final.pass?'finished-pass':'finished-failed');console.log(JSON.stringify(final));if(!final.pass)process.exitCode=1;
}

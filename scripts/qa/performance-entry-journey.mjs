import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

// Isolated staging only. Secrets and sessions stay in memory; no credential files.
const ref = 'gjwvalpxnfbvryosmcbj';
const dbOrigin = 'https://' + ref + '.supabase.co';
const appOrigin = 'https://rezlee-performance-staging.vercel.app';
const project = 'prj_iZTtIewxFdYIKUFtwKFEq9I8lPuS';
const deployment = 'dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ';
const team = 'team_RWL45V0YAuHJ7DvygUtJNB8o';
const cli = '/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js';
const root = path.resolve('docs/checkpoints/performance-entry-journey-20261021');
fs.mkdirSync(root, { recursive: true });
if (fs.existsSync(path.join(root, 'started.json'))) throw Error('Use an untouched run directory');
const stamp = () => new Date().toISOString();
const save = (name, d) => fs.writeFileSync(path.join(root,name),JSON.stringify(d,null,2));
const status = (stage,extra={}) => { const d={at:stamp(),pid:process.pid,stage,...extra};save('status.json',d); console.log(JSON.stringify(d)); };
const api = (url,method='GET') => {
 const result=execFileSync('/usr/local/bin/node',[cli,'api',url+(url.includes('?')?'&':'?')+'teamId='+team,'--method',method],{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']});
 return result.trim()?JSON.parse(result):{};
};
const safeDeployment = () => {
 const a=api('/v4/aliases/rezlee-performance-staging.vercel.app');
 const p=api('/v9/projects/'+project);
 const d=api('/v13/deployments/'+deployment);
 if(a.projectId!==project||a.deploymentId!==deployment||d.projectId!==project||d.target!=='production'||d.readyState!=='READY')throw Error('Deployment safety guard');
 return {at:stamp(),aliasDeployment:a.deploymentId,projectId:p.id,currentProduction:p.targets?.production?.id,measuredDeployment:d.id,target:d.target,fluid:p.resourceConfig?.fluid,regions:d.regions,plan:d.plan};
};
const must = r => {if(r.error)throw Error('Fixture API error '+(r.error.code||r.error.status||'unknown'));return r.data;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pct=(xs,p)=>{const a=xs.slice().sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;};
const journeys=[];const rows=[]; const routeNames=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
let admin,user,home,token,publicKey,phase='preparing',fatal=null,promoted=false,cleanupVerified=false;
const run=randomUUID();
save('started.json',{at:stamp(),pid:process.pid,run,scope:'Authenticated entry request sequence baseline/candidate on one synthetic household. API timing only, not native launch or 300-user acceptance. No deployment, configuration, pool or billing changes.'});
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
async function ask(route,index) {
 const begin=performance.now();let valid=false,http=null,timing=null,ttfb=null,bytes=null,requestId=null;
 try {
  const response=await fetch(appOrigin+'/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+token,'x-rezlee-qa-trace':'promotion_probe'},signal:AbortSignal.timeout(12000)});
  ttfb=performance.now()-begin;http=response.status;requestId=response.headers.get('x-vercel-id');
  timing=JSON.parse(response.headers.get('x-rezlee-perf')||'null');
  const text=await response.text();bytes=text.length;const d=JSON.parse(text);
  valid=http===200&&!d.error&&!d.needsOnboarding&&((route.startsWith('home')||route==='onboarding')?d.home?.id===home:route==='bills'?d.bills?.length>=12:route==='vault'?d.documents?.length>=8:route==='care'?d.tasks?.length>=6:true);
 }catch {}
 const row={at:stamp(),phase,index,route,http,valid,ms:Math.round(performance.now()-begin),ttfbMs:ttfb===null?null:Math.round(ttfb),bytes,requestId,timing};
 rows.push(row);return row;
}
async function burst(label,count=900){
 phase=label;status(label,{targetRequests:count,targetRps:30});const start=performance.now(),pending=[];
 try { for(let i=0;i<count;i++){
  const due=start+i*1000/30;await sleep(Math.max(0,due-performance.now()));
  if(performance.now()-due>1000)throw Error('Generator dispatch lag');
  const recent=rows.filter(r=>r.phase===label).slice(-100);
  if(recent.length===100&&(recent.filter(r=>!r.valid).length>2||pct(recent.map(r=>r.ms),.95)>5000))throw Error('Diagnostic safety threshold exceeded');
  pending.push(ask(routeNames[i%6],i));
  if(i%300===0)status(label,{offered:i+1,completed:recent.length});
 }
 } finally { await Promise.allSettled(pending); }
 if(rows.some(r=>r.phase===label&&!r.valid))throw Error('Functional response validation failed');
 save('rows.json',rows);
 const group=rows.filter(r=>r.phase===label);status(label+'-finished',{requests:group.length,p95Ms:pct(group.map(r=>r.ms),.95),p99Ms:pct(group.map(r=>r.ms),.99)});
}
async function idle(ms,label){
 status(label,{seconds:ms/1000});
 const end=performance.now()+ms;
 while(performance.now()<end){await sleep(Math.min(30000,end-performance.now()));status(label,{remainingSeconds:Math.max(0,Math.ceil((end-performance.now())/1000))});}
}
async function journey(label,duplicateGate){
 phase=label;status(label);const started=performance.now(),before=rows.length;
 const first=await ask('onboarding',0);if(!first.valid)throw Error('Onboarding response failed');
 if(duplicateGate){const second=await ask('onboarding',1);if(!second.valid)throw Error('Second onboarding response failed');}
 const background=[ask('membership',2),ask('notifications',3)];
 const primary=await ask('home?availability=1',4);if(!primary.valid)throw Error('Home response failed');
 const usefulHomeMs=Math.round(performance.now()-started);
 let billsReadyMs=null;
 await Promise.all([ask('bills',5).then(row=>{if(row.valid)billsReadyMs=Math.round(performance.now()-started);}),ask('vault',6),ask('care',7),ask('shared-expenses',8),...background]);
 const group=rows.slice(before);if(group.some(r=>!r.valid))throw Error('Journey response failed');
 journeys.push({label,duplicateGate,requests:group.length,usefulHomeMs,billsReadyMs,allReadyMs:Math.round(performance.now()-started)});
 save('journeys.json',journeys);save('rows.json',rows);status(label+'-finished',journeys.at(-1));
}
try {
 save('before-configuration.json',safeDeployment());
 const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const response=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Management key lookup failed '+response.status);
 const keys=await response.json();
 const secret=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.type==='secret')?.api_key;
 publicKey=keys.find(k=>k.name==='anon')?.api_key??keys.find(k=>k.type==='publishable')?.api_key;
 if(!secret||!publicKey)throw Error('Staging API credentials unavailable');
 const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
 admin=createClient(dbOrigin,secret,opts);
 const email='launch-probe-'+run+'@example.invalid',password=randomUUID()+randomUUID();
 user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user.id;
 save('fixture-cleanup-journal.json',{run,userIds:[user],projectRef:ref});
 const client=createClient(dbOrigin,publicKey,opts);
 token=must(await client.auth.signInWithPassword({email,password})).session.access_token;
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 if(claims.iss!==dbOrigin+'/auth/v1'||claims.sub!==user||claims.user_metadata?.qa_run!==run)throw Error('Synthetic session guard');
 home=must(await admin.from('homes').insert({user_id:user,nickname:'Synthetic launch diagnostic'}).select('id').single()).id;
 must(await admin.from('bills').insert(Array.from({length:12},(_,j)=>({home_id:home,user_id:user,name:'Synthetic bill '+j,amount:55+j,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'}))));
 must(await admin.from('documents').insert(Array.from({length:8},(_,j)=>({home_id:home,user_id:user,title:'Synthetic record '+j,document_type:'receipt'}))));
 must(await admin.from('maintenance_tasks').insert(Array.from({length:6},(_,j)=>({home_id:home,user_id:user,title:'Synthetic task '+j,status:'open',due_date:'2026-10-25'}))));
 status('fixture-ready',{accounts:1});
 must(await admin.from('rezlee_member_accounts').insert({user_id:user}));
 for(let round=0;round<2;round++)for(const mode of ['baseline','candidate','candidate','baseline'])await journey(mode+'-'+round+'-'+journeys.length,mode==='baseline');
 await idle(45000,'candidate-idle-45');await journey('candidate-after-45-seconds',false);
 await idle(600000,'candidate-idle-600');await journey('candidate-after-10-minutes',false);
} catch(e) {
 fatal=String(e.message||'Probe failed').replace(/sb_[a-z]+_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,180);
 process.exitCode=1;
} finally {
 loop.disable();
 if(admin&&user){
  try{
   const current=must(await admin.auth.admin.getUserById(user));
   if(current.user.user_metadata?.qa_run!==run)throw Error('Cleanup identity guard');
   must(await admin.auth.admin.deleteUser(user));
   const verify=await admin.auth.admin.getUserById(user);
   cleanupVerified=Boolean(verify.error&&verify.error.status===404);
  }catch{cleanupVerified=false;process.exitCode=1;}
 }
 token=undefined;
 const phases=[...new Set(rows.map(r=>r.phase))].map(label=>{
  const group=rows.filter(r=>r.phase===label);
  const part=xs=>({requests:xs.length,errors:xs.filter(r=>!r.valid).length,p95Ms:pct(xs.map(r=>r.ms),.95),p99Ms:pct(xs.map(r=>r.ms),.99),maxMs:xs.length?Math.max(...xs.map(r=>r.ms)):null,firstInvocations:xs.filter(r=>r.timing?.firstInvocation).length,handlerP95Ms:pct(xs.filter(r=>r.timing).map(r=>r.timing.appMs),.95)});
  return {phase:label,...part(group),first300:part(group.slice(0,300))};
 });
 save('rows.json',rows);save('summary.json',{at:stamp(),failure:fatal,cleanupVerified,journeys,phases,eventLoopMaxMs:Math.round(loop.max/1e6),scope:'One synthetic account API journey; real component harness separately proves one fewer sequential gate. Not native launch timing or 300-session acceptance. No configuration change.'});
 save('cleanup.json',{at:stamp(),created:user?1:0,deleted:cleanupVerified?1:0,verifiedAbsent:cleanupVerified,sessionFilesWritten:0});
 status('finished',{failure:fatal,promoted,cleanupVerified,requests:rows.length});
 if(!cleanupVerified&&user)process.exitCode=1;
}

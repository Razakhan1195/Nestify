import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const root=process.env.REZLEE_QA_OUTPUT;if(!root)throw Error('Private output required');
const repo='/Users/razakhan/Documents/rezlee-mobile-test';
const cfg=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS));
if(cfg.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging guard');
const state=JSON.parse(fs.readFileSync(root+'/cloud-load-sessions.json'));
if(state.users.length!==2)throw Error('Two synthetic users expected');
for(const u of state.users){const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.sub!==u.id||c.user_metadata?.qa_run!==state.run||c.user_metadata.qa_marker!==true)throw Error('Synthetic fixture guard');}
const admin=createClient(cfg.NEXT_PUBLIC_SUPABASE_URL,cfg.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const pat=execFileSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'}).trim();
const save=(n,d)=>fs.writeFileSync(root+'/'+n,JSON.stringify(d,null,2),{mode:0o600}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sql(query,read_only=true){const r=await fetch('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',{method:'POST',headers:{Authorization:'Bearer '+pat,'Content-Type':'application/json'},body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('SQL request '+r.status);return r.json();}
const lockCheck="select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='rezlee-qa-membership-lock' and l.locktype='advisory' and l.granted) as held";
async function lockProbe(phase,u){
 if((await sql(lockCheck))[0].held)throw Error('Other lock probe active');
 const holder=sql("begin; set local application_name='rezlee-qa-membership-lock'; select pg_advisory_xact_lock(hashtextextended('rezlee-founder-activation-v1',16012026)); select pg_sleep(4); commit;",false);
 let observed=false;for(let i=0;i<10;i++){await sleep(80);if((await sql(lockCheck))[0].held){observed=true;break;}}
 if(!observed){await holder;throw Error('Could not confirm held lock');}
 const began=performance.now(),res=await admin.rpc('rezlee_activate_member',{p_user:u.id}),elapsed=performance.now()-began;
 const stillHeld=(await sql(lockCheck))[0].held;await holder;
 if(res.error)throw Error('Activation RPC '+res.error.code);
 const result={phase,lockObservedBeforeRequest:observed,lockStillHeldWhenRequestReturned:stillHeld,elapsedMs:Math.round(elapsed)};
 console.log(JSON.stringify(result));return result;
}
async function httpRequest(base,init){
 const body=root+'/http-body.private',head=root+'/http-headers.private';
 const args=['--yes','vercel','curl','/api/mobile/v1/membership','--deployment',base,'--','--request',init.method||'GET','--max-time','12','--silent','--output',body,'--dump-header',head,'--write-out','REZLEE_META%{http_code} %{time_total}'];
 for(const [key,value] of Object.entries(init.headers||{}))args.push('--header',key+': '+value);
 if(init.body)args.push('--data',init.body);
 const stdout=execFileSync('/usr/local/bin/npx',args,{cwd:'/Users/razakhan/Library/Application Support/Rezlee/performance-causal-20261021/membership-source',encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
 const match=/REZLEE_META(\d+) ([\d.]+)/.exec(stdout);if(!match)throw Error('CLI HTTP metadata unavailable');
 const headers=new Headers();for(const line of fs.readFileSync(head,'utf8').split('\n')){const i=line.indexOf(':');if(i>0)headers.set(line.slice(0,i).trim(),line.slice(i+1).trim());}
 const response=new Response(fs.readFileSync(body),{status:Number(match[1]),headers});response.measuredMs=Math.round(Number(match[2])*1000);fs.rmSync(body,{force:true});fs.rmSync(head,{force:true});return response;
}
let applied=false,passed=false;const report={at:new Date().toISOString(),lockProbes:[],httpChecks:[],productionTouched:false};
const original=fs.readFileSync(repo+'/docs/checkpoints/performance-causal-20261021/membership-activation-before.sql','utf8');
try{
 const before=(await sql("select pg_get_functiondef('public.rezlee_activate_member(uuid)'::regprocedure) as definition"))[0].definition;
 if(before!==original)throw Error('Function changed since reviewed baseline');
 const campaign=(await sql('select activated from public.rezlee_membership_campaign where singleton'))[0].activated;
 const seed=await admin.from('rezlee_member_accounts').insert(state.users.map(u=>({user_id:u.id})));if(seed.error)throw Error('Fixture member setup failed');
 report.lockProbes.push(await lockProbe('before',state.users[0]));
 if(report.lockProbes[0].elapsedMs<2000)throw Error('Contention baseline did not reproduce');
 await sql(fs.readFileSync(repo+'/supabase/migrations/202610210001_membership_repeat_activation.sql','utf8'),false);applied=true;
 save('migration-applied.json',{at:new Date().toISOString(),migration:'202610210001_membership_repeat_activation.sql',stagingOnly:true,rollbackAvailable:true});
 report.lockProbes.push(await lockProbe('after',state.users[0]));
 if(report.lockProbes[1].elapsedMs>=1000||!report.lockProbes[1].lockStillHeldWhenRequestReturned)throw Error('Fast path still contends');
 const aliases=[['baseline','https://rezlee-performance-staging.vercel.app'],['candidate','https://rezlee-performance-staging-d2eg0sw89-razakhan1195s-projects.vercel.app']];
 for(const [label,base] of aliases){
  for(const [n,u] of state.users.entries()){
   for(const action of ['activate','seen','pro-seen','restore']){
    const begin=performance.now(),r=await httpRequest(base,{method:'POST',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(12000)});let d;try{d=await r.json();}catch{d={};}
    const row={deployment:label,accountIndex:n,action,status:r.status,ms:r.measuredMs??Math.round(performance.now()-begin),enabled:d.enabled===true,plan:d.membership?.plan??null,noStore:r.headers.get('cache-control')?.includes('no-store')??false};
    row.expectedUnconfiguredRestoreFailure=action==='restore'&&r.status===503&&typeof d.error==='string'&&d.error.startsWith('We couldn’t confirm');report.httpChecks.push(row);if(!row.noStore||(!row.expectedUnconfiguredRestoreFailure&&(r.status!==200||!row.enabled||row.plan!=='free')))throw Error('Membership HTTP regression '+label+' '+action+' '+r.status);
   }
  }
  const r=await httpRequest(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"activate"}',signal:AbortSignal.timeout(12000)});
  report.httpChecks.push({deployment:label,action:'missing-auth',status:r.status});if(r.status!==401)throw Error('Missing auth not rejected');
 }
 const finalCampaign=(await sql('select activated from public.rezlee_membership_campaign where singleton'))[0].activated;
 report.campaignUnchanged=campaign===finalCampaign;if(!report.campaignUnchanged)throw Error('Synthetic repeat activation changed founder allocation count');
 report.acceptanceScope='Membership duplicate-read and repeat-activation checks only; not 300-session backend acceptance';
 report.completedAt=new Date().toISOString();report.passed=true;passed=true;save('summary.json',report);
}finally{
 if(applied&&!passed){await sql(original,false);save('migration-rolled-back.json',{at:new Date().toISOString(),restored:true});}
 if(!passed){report.passed=false;save('summary.json',report);}
 for(const u of state.users){const r=await admin.auth.admin.deleteUser(u.id);if(r.error)throw Error('Fixture cleanup failed');}
 const check=await admin.from('homes').select('id').in('user_id',state.users.map(u=>u.id));if(check.error||check.data.length)throw Error('Fixture homes remain');
 fs.rmSync(root+'/cloud-load-sessions.json',{force:true});save('cleanup.json',{at:new Date().toISOString(),removed:2,remainingHomes:0,tokensRemoved:true,productionTouched:false});
}

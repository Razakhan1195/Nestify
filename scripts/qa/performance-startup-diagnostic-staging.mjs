import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const root=process.env.REZLEE_PERF_ROOT;
if(root!=='/Users/razakhan/Library/Application Support/Rezlee/performance-small-20261020')throw Error('Explicit approved staging run required');
const origin='https://gjwvalpxnfbvryosmcbj.supabase.co';
const sessionsPath=path.join(root,'fixtures/cloud-load-sessions.json');
const state=JSON.parse(fs.readFileSync(sessionsPath,'utf8'));
const users=state.users.slice(-100).map(u=>({...u}));
for(const u of users){const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.iss!==origin+'/auth/v1'||c.sub!==u.id||!c.user_metadata?.qa_marker||c.user_metadata.qa_run!==state.run||!/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(c.email||'')||c.exp*1000<Date.now()+12*60000)throw Error('Synthetic session guard failed');}
const warm=JSON.parse(fs.readFileSync(path.join(root,'warm-soak/soak-load-report.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8'));
if(!warm.complete||!warm.pass||prior.stage!=='recovery-observation')throw Error('Wait for successful full warm run before diagnosis');
const owner=prior.controllerPid;
const command=execFileSync('ps',['-p',String(owner),'-o','command='],{encoding:'utf8'}).trim();
if(!command.endsWith(path.join(root,'run-warm-soak.py')))throw Error('Cleanup owner identity mismatch');
const output=path.join(root,'startup-diagnostic');fs.mkdirSync(output,{mode:0o700});
const phases=[];let paused=false,failure=null;const stamp=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(v,p)=>v.length?v.slice().sort((a,b)=>a-b)[Math.ceil(v.length*p)-1]:null;
const routes=['home','bills','vault','care','shared-expenses','purchase-decisions'];
function progress(stage,extra={}){const d={at:stamp(),controllerPid:process.pid,stage,cleanupOwner:owner,...extra};fs.writeFileSync(path.join(root,'status.json'),JSON.stringify(d));console.log(JSON.stringify(d));}
async function rpc(u,route){const start=performance.now();let status=0,valid=false,timing={},upstreamMs=null,error=null;
 try{const home=route==='home';const r=await fetch(origin+'/rest/v1/rpc/'+(home?'rezlee_mobile_read_bootstrap':'rezlee_mobile_screen_bootstrap'),{method:'POST',headers:{apikey:state.anonKey,Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:JSON.stringify(home?{p_snapshot:true,p_effective:true}:{p_screen:route,p_effective:true}),signal:AbortSignal.timeout(20000)});status=r.status;upstreamMs=Number(r.headers.get('x-envoy-upstream-service-time'));const h=r.headers.get('server-timing')||'';for(const m of h.matchAll(/([a-z_]+);dur=([0-9.]+)/g))if(['jwt','parse','plan','transaction','response'].includes(m[1]))timing[m[1]]=Number(m[2]);const b=await r.json();valid=status===200&&b.access==='active'&&b.user?.id===u.id&&b.homeAccess?.home?.id===u.home&&(home?b.homeSnapshot!==null:b.screenSnapshot?.kind===route);}
 catch(e){error=e.name;}return{route,status,valid,ms:Math.round(performance.now()-start),upstreamMs,timing,error};}
async function phase(label,accounts){progress('startup-diagnostic-running',{phase:label});const began=performance.now(),rows=[],pending=[];
 for(let i=0;i<accounts.length;i++){await sleep(Math.max(0,began+i*1000/30-performance.now()));pending.push(rpc(accounts[i],routes[i%6]).then(r=>rows.push(r)));}await Promise.all(pending);
 const result={label,at:stamp(),seconds:Math.round((performance.now()-began)/1000),requests:rows.length,failures:rows.filter(r=>!r.valid).length,p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),maxMs:Math.max(...rows.map(r=>r.ms)),jwtP95Ms:pct(rows.filter(r=>r.timing.jwt!==undefined).map(r=>r.timing.jwt),.95),transactionP95Ms:pct(rows.filter(r=>r.timing.transaction!==undefined).map(r=>r.timing.transaction),.95),rows};phases.push(result);fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({...result,rows:undefined}));if(result.failures)throw Error('Diagnostic response failure');}
try{
 process.kill(owner,'SIGSTOP');paused=true;fs.writeFileSync(path.join(root,'warm-soak/capacity-batch/stop'),'');fs.writeFileSync(path.join(output,'paused-owner.json'),JSON.stringify(prior));
 progress('refreshing-diagnostic-sessions',{users:100});const fresh=[];
 for(let i=0;i<users.length;i++){
  await sleep(2100);const u=users[i];const r=await fetch(origin+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:state.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:u.refreshToken}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Diagnostic session refresh HTTP '+r.status);const b=await r.json();const c=JSON.parse(Buffer.from(b.access_token.split('.')[1],'base64url'));if(c.iss!==origin+'/auth/v1'||c.sub!==u.id||c.user_metadata?.qa_run!==state.run)throw Error('Refreshed identity mismatch');const next={...u,token:b.access_token,refreshToken:b.refresh_token};fresh.push(next);Object.assign(state.users.find(x=>x.id===u.id),next);const tmp=sessionsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,sessionsPath);if((i+1)%25===0)progress('refreshing-diagnostic-sessions',{refreshed:i+1,total:100});
 }
 await phase('cached-tokens',users);await phase('fresh-tokens',fresh);await phase('same-fresh-tokens-repeated',fresh);
 progress('startup-idle-observation',{seconds:90});await sleep(90000);await phase('after-90-seconds-idle',fresh);
}catch(e){failure=e.message;console.log('DIAGNOSTIC_FAILED',failure);process.exitCode=1;}
finally{
 const result={at:stamp(),scope:'100 synthetic accounts; 30 requests/sec short diagnostic, not 300-user acceptance. Normal scheduled jobs remain enabled.',failure,phases:phases.map(({rows,...x})=>x)};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2));
 if(paused){fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({...prior,at:stamp(),stage:'recovery-observation',postRunDiagnosticComplete:true}));process.kill(owner,'SIGCONT');console.log('RESUMED_CLEANUP_OWNER',owner);}
}

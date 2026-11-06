import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const out=process.env.REZLEE_QA_OUTPUT;
const candidate=JSON.parse(fs.readFileSync(process.env.REZLEE_CONNECTION_CANDIDATE,'utf8'));
if(candidate.exitCode!==0||candidate.urls.length!==1||!/^https:\/\/rezlee-performance-staging-[a-z0-9]+-razakhan1195s-projects\.vercel\.app$/.test(candidate.urls[0]))throw Error('Isolated deployment guard');
const origin=process.env.REZLEE_CONNECTION_ORIGIN||candidate.urls[0];
if(origin!==candidate.urls[0]&&origin!=='https://rezlee-performance-staging.vercel.app')throw Error('Staging origin guard');
const state=JSON.parse(fs.readFileSync(out+'/cloud-load-sessions.json','utf8'));
if(state.users.length!==1)throw Error('Single synthetic account required');
const user=state.users[0],claims=JSON.parse(Buffer.from(user.token.split('.')[1],'base64url'));
if(claims.iss!=='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1'||claims.sub!==user.id||claims.user_metadata?.qa_run!==state.run||!claims.user_metadata.qa_marker)throw Error('Staging synthetic identity guard');
const routes=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'],rows=[];
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const pct=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;};
function status(stage,extra={}){fs.writeFileSync(out+'/probe-status.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,stage,...extra}));console.log(JSON.stringify({stage,...extra}));}
async function ask(phase,route){
 const start=performance.now();let statusCode=null,valid=false,timing=null;
 try{
  const r=await fetch(origin+'/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+user.token,'x-rezlee-qa-trace':'connection_observation'},signal:AbortSignal.timeout(12000)});
  statusCode=r.status;timing=JSON.parse(r.headers.get('x-rezlee-perf')||'null');const d=await r.json();
  valid=r.status===200&&!d.error&&!d.needsOnboarding&&(route.startsWith('home')?d.home?.id===user.home:route==='bills'?d.bills?.length>=12:route==='vault'?d.documents?.length>=8:route==='care'?d.tasks?.length>=6:true);
 }catch{}
 const row={at:new Date().toISOString(),phase,route,status:statusCode,valid,ms:Math.round(performance.now()-start),timing};rows.push(row);return row;
}
async function burst(label){
 status(label,{targetRequests:1800,targetRps:30});
 const start=performance.now(),pending=[];let stopped=false;
 for(let i=0;i<1800;i++){
  const until=start+i*1000/30;await sleep(until-performance.now());
  if(performance.now()-until>1000)throw Error('Generator lag');
  const recent=rows.filter(r=>r.phase===label).slice(-100);
  if(recent.length===100&&(recent.some(r=>!r.valid)||pct(recent.map(r=>r.ms),.95)>2000)){stopped=true;break;}
  pending.push(ask(label,routes[i%routes.length]));
  if(i%300===0)status(label,{offered:i+1,completed:rows.filter(r=>r.phase===label).length});
 }
 await Promise.all(pending);if(stopped)throw Error('Diagnostic safety stop');
}
let failure=null;
try{
 status('six-route-cold-probe');
 for(const route of routes){const row=await ask('initial',route);if(!row.valid||!row.timing?.dependencies?.some(d=>d.connection?.attempts?.length))throw Error('Runtime or numeric connection instrumentation unavailable');}
 await burst('initial-burst');
 status('connection-idle-45-seconds');await sleep(45000);
 await burst('after-connection-idle');
}catch(e){failure=e.message;process.exitCode=1;}
finally{
 const phases=[...new Set(rows.map(r=>r.phase))].map(phase=>{
  const group=rows.filter(r=>r.phase===phase),attempts=group.flatMap(r=>r.timing?.dependencies?.flatMap(d=>d.connection?.attempts||[])||[]);
  return {phase,requests:group.length,failures:group.filter(r=>!r.valid).length,p95Ms:pct(group.map(r=>r.ms),.95),p99Ms:pct(group.map(r=>r.ms),.99),maxMs:Math.max(...group.map(r=>r.ms)),observedAttempts:attempts.length,confirmedReusedSocketAttempts:attempts.filter(a=>a.socketReused).length,preSendP95Ms:pct(attempts.filter(a=>a.sentMs!=null).map(a=>a.sentMs),.95),afterSendP95Ms:pct(attempts.filter(a=>a.sentMs!=null&&a.receivedMs!=null).map(a=>a.receivedMs-a.sentMs),.95),slowRows:group.filter(r=>r.ms>500)};
 });
 const summary={at:new Date().toISOString(),failure,phases,scope:'One fixed synthetic account; 30 rps HTTP-transport observation on isolated staging. 45-second connection idle; not the 300-session acceptance or 10-minute idle repeat. Fetch/pool/retry behavior unchanged.'};
 fs.writeFileSync(out+'/connection-rows.json',JSON.stringify(rows));fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2));status('probe-complete',{requests:rows.length,failure});
}

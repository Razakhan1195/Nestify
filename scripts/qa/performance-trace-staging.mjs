import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const dir=process.env.REZLEE_QA_OUTPUT, input=process.env.REZLEE_LOAD_SESSIONS;
if(!dir||!input)throw Error('Explicit private output and fixture paths required');
const s=JSON.parse(fs.readFileSync(input));
for(const u of s.users){const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.iss!=='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1'||c.sub!==u.id||c.user_metadata?.qa_run!==s.run||!c.user_metadata.qa_marker||c.exp*1000<Date.now()+5*60000)throw Error('Live staging fixture guard failed');}
const prefix=process.env.REZLEE_TRACE_LABEL||'baseline';if(!/^[a-z0-9-]+$/.test(prefix))throw Error('Invalid label');
const routes=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
const phases=[], sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(xs,p)=>xs.length?xs.slice().sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]:null;
async function request(index,route,kind){const u=s.users[index%s.users.length],start=performance.now();let status=0,trace=null,upstreamMs=null,error=null,valid=false;
 try{
  const direct=kind==='direct';const response=await fetch(direct?'https://gjwvalpxnfbvryosmcbj.supabase.co/rest/v1/rpc/rezlee_mobile_read_bootstrap':'https://staging.rezlee.com/api/mobile/v1/'+route,{method:direct?'POST':'GET',headers:{Authorization:'Bearer '+u.token,'x-rezlee-qa-trace':prefix+'_'+index+'_'+Math.round(start),...(direct?{apikey:s.anonKey,'Content-Type':'application/json'}:{})},...(direct?{body:JSON.stringify({p_snapshot:false,p_effective:true})}:{}),signal:AbortSignal.timeout(20000)});
  status=response.status;const raw=response.headers.get('x-rezlee-perf');if(raw)trace=JSON.parse(raw);const timing=response.headers.get('x-envoy-upstream-service-time');if(timing!==null)upstreamMs=Number(timing);
  const body=await response.json();valid=status===200&&!body.error&&!body.needsOnboarding;
  if(direct)valid=valid&&body.user?.id===u.id&&body.homeAccess?.home?.id===u.home;
  else if(route.startsWith('home'))valid=valid&&body.home?.id===u.home&&body.availability?.missing?.length===0;
  else if(route==='bills')valid=valid&&body.bills?.length>=12;
  else if(route==='vault')valid=valid&&body.documents?.length>=8;
  else if(route==='care')valid=valid&&body.tasks?.length>=6;
  else if(route==='shared-expenses')valid=valid&&body.home?.id===u.home;
  else valid=valid&&body.homeId===u.home;
 }catch(e){error=e.name;}
 return {route,kind,ms:Math.round(performance.now()-start),status,valid,error,trace,upstreamMs};
}
function save(label,rows){const out={label,requests:rows.length,failures:rows.filter(x=>!x.valid).length,p50:pct(rows.map(x=>x.ms),.5),p95:pct(rows.map(x=>x.ms),.95),p99:pct(rows.map(x=>x.ms),.99),max:Math.max(...rows.map(x=>x.ms)),rows};phases.push(out);fs.writeFileSync(dir+'/'+prefix+'-trace.json',JSON.stringify({at:new Date().toISOString(),fixtures:s.users.length,phases},null,2));console.log(JSON.stringify({...out,rows:undefined}));return out;}
for(const label of ((process.env.REZLEE_TRACE_ONLY_DIRECT==='true'||process.env.REZLEE_TRACE_ONLY_APP==='true')?[]:['first-pass','warm-pass'])){const rows=[];for(let i=0;i<6;i++)rows.push(await request(i,routes[i],'app'));save(label,rows);}
for(const [kind,rate,seconds] of (process.env.REZLEE_TRACE_ONLY_APP==='true'?[['app',30,60]]:process.env.REZLEE_TRACE_ONLY_DIRECT==='true'?[['direct',30,60]]:[['app',3,30],['direct',30,20],['app',10,30],['app',30,30]])){
 const start=performance.now(),pending=new Set(),rows=[];let stopped=false;
 for(let i=0;i<rate*seconds;i++){
  await sleep(Math.max(0,start+i*1000/rate-performance.now()));if(stopped)break;
  const p=request(i,routes[(i+Math.floor(i/s.users.length))%6],kind).then(x=>{rows.push(x);if(rows.length>=30&&(rows.filter(x=>!x.valid).length>1||pct(rows.slice(-30).map(x=>x.ms),.95)>5000))stopped=true;}).finally(()=>pending.delete(p));pending.add(p);
 }
 await Promise.allSettled(pending);const result=save(kind+'-'+rate+'rps'+(stopped?'-safety-stop':''),rows);if(stopped||result.failures)break;await sleep(5000);
}
console.log('TRACE_COMPLETE');

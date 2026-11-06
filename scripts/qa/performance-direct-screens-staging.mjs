import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const output=process.env.REZLEE_QA_OUTPUT,input=process.env.REZLEE_LOAD_SESSIONS;
if(!output||!input)throw Error('Explicit private output and sessions required');
const state=JSON.parse(fs.readFileSync(input));
const origin='https://gjwvalpxnfbvryosmcbj.supabase.co';
if(state.users.length!==300)throw Error('Expected 300 synthetic accounts');
for(const user of state.users){const c=JSON.parse(Buffer.from(user.token.split('.')[1],'base64url'));if(c.iss!==origin+'/auth/v1'||c.sub!==user.id||c.user_metadata?.qa_run!==state.run||c.user_metadata?.qa_marker!==true||!/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(c.email||'')||c.exp*1000<Date.now()+3*60000)throw Error('Synthetic session guard failed');}
const routes=['home','bills','vault','care','shared-expenses','purchase-decisions'];
const rows=[],pending=new Set(),began=performance.now(),startedAt=new Date().toISOString();let stopped=false,maxInFlight=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
async function request(i){const userIndex=i%300,user=state.users[userIndex],route=routes[(userIndex+Math.floor(i/300))%6],start=performance.now();let status=0,upstreamMs=null,valid=false,error=null;
 try{const home=route==='home';const response=await fetch(origin+'/rest/v1/rpc/'+(home?'rezlee_mobile_read_bootstrap':'rezlee_mobile_screen_bootstrap'),{method:'POST',headers:{apikey:state.anonKey,Authorization:'Bearer '+user.token,'Content-Type':'application/json'},body:JSON.stringify(home?{p_snapshot:true,p_effective:true}:{p_screen:route,p_effective:true}),signal:AbortSignal.timeout(20000)});status=response.status;const timing=response.headers.get('x-envoy-upstream-service-time');if(timing!==null)upstreamMs=Number(timing);const body=await response.json();valid=status===200&&body.access==='active'&&body.user?.id===user.id&&body.homeAccess?.home?.id===user.home&&(home?body.homeSnapshot!==null:body.screenSnapshot?.kind===route);}
 catch(e){error=e.name;}
 return {userIndex,route,status,ms:Math.round(performance.now()-start),upstreamMs,valid,error};
}
console.log('DIRECT_SCREENS_STARTED',startedAt);
for(let i=0;i<1800;i++){await sleep(Math.max(0,began+i*1000/30-performance.now()));if(stopped)break;const work=request(i).then(row=>{rows.push(row);if(rows.length>=100){const recent=rows.slice(-100);if(recent.filter(x=>!x.valid).length>1||pct(recent.map(x=>x.ms),.95)>2000)stopped=true;}}).finally(()=>pending.delete(work));pending.add(work);maxInFlight=Math.max(maxInFlight,pending.size);}
await Promise.allSettled(pending);
const summarize=values=>({requests:values.length,failures:values.filter(x=>!x.valid).length,p50Ms:pct(values.map(x=>x.ms),.5),p95Ms:pct(values.map(x=>x.ms),.95),p99Ms:pct(values.map(x=>x.ms),.99),upstreamP95Ms:pct(values.filter(x=>x.upstreamMs!==null).map(x=>x.upstreamMs),.95)});
const report={startedAt,completedAt:new Date().toISOString(),seconds:Math.round((performance.now()-began)/1000),distinctUsers:new Set(rows.map(x=>x.userIndex)).size,targetRequests:1800,targetRps:30,safetyStopped:stopped,maxInFlight,...summarize(rows),routes:routes.map(route=>({route,...summarize(rows.filter(x=>x.route===route))})),scope:'One-minute diagnostic of the same six authenticated screen RPCs directly; not 30-minute application acceptance.',rows};
fs.writeFileSync(output+'/direct-screen-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,rows:undefined}));
if(stopped||report.failures||rows.length!==1800)process.exitCode=1;

import fs from 'node:fs';import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
export async function runReleaseSoak(settings,output,control={}){
fs.mkdirSync(output,{recursive:true,mode:0o700});
if(settings.users.length!==300)throw Error('Expected 300 synthetic users');
for(const user of settings.users){
 const claim=JSON.parse(Buffer.from(user.token.split('.')[1],'base64url').toString());
 if(claim.iss!=='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1'||claim.sub!==user.id||!claim.user_metadata?.qa_marker||claim.user_metadata.qa_run!==settings.run||!/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(claim.email||''))throw Error('Synthetic identity guard failed');
}

function validPayload(route,data,user){switch(route){
 case 'home?availability=1':return data.home?.id===user.home&&Array.isArray(data.availability?.missing)&&data.availability.missing.length===0;
 case 'bills':return Array.isArray(data.bills)&&data.bills.length>=12;
 case 'vault':return Array.isArray(data.documents)&&data.documents.length>=8&&data.summary?.recordsCount>=8;
 case 'care':return Array.isArray(data.tasks)&&data.tasks.length>=6&&data.householdAvailable===true;
 case 'shared-expenses':return data.home?.id===user.home&&Array.isArray(data.entries)&&Array.isArray(data.people);
 case 'purchase-decisions':return data.homeId===user.home&&Array.isArray(data.decisions);
 default:return false;
}}
const earliestExpiry=Math.min(...settings.users.map(u=>JSON.parse(Buffer.from(u.token.split('.')[1],'base64url').toString()).exp*1000));
if(!Number.isFinite(earliestExpiry)||earliestExpiry-Date.now()<32*60000)throw Error('Fixtures need at least 32 minutes of remaining session life');
const runDeadline=Date.now()+31*60000;
const users=settings.users,paths=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'],phases=[],waves=[];let inFlight=0,maxInFlight=0,safetyStopped=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pct=(v,p)=>v.length?v.slice().sort((a,b)=>a-b)[Math.min(v.length-1,Math.ceil(v.length*p)-1)]:null;
async function request(user,route,kind='app'){
 if(Date.now()>runDeadline)return {userIndex:users.indexOf(user),startedAt:new Date().toISOString(),headersMs:null,requestId:null,route,ms:0,status:0,valid:false,errorKind:'BenchmarkBudgetExceeded'};
 let status=0,valid=false,errorKind=null,headersMs=null,requestId=null,timing=null;const start=performance.now(),startedAt=new Date().toISOString();inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
 let url='https://staging.rezlee.com/api/mobile/v1/'+route,headers={Authorization:'Bearer '+user.token,'x-rezlee-qa-trace':'u'+users.indexOf(user)+'_'+Math.round(start)};
 if(kind==='auth'){url='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1/user';headers.apikey=settings.anonKey;}
 if(kind==='context'){url='https://gjwvalpxnfbvryosmcbj.supabase.co/rest/v1/rpc/rezlee_authenticated_mobile_context';headers.apikey=settings.anonKey;}
 if(kind==='database'){url='https://gjwvalpxnfbvryosmcbj.supabase.co/rest/v1/homes?select=id&user_id=eq.'+user.id;headers.apikey=settings.anonKey;}
 const controller=new AbortController();let timeout;
 const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();const e=new Error('Request exceeded 20 seconds');e.name='TimeoutError';reject(e);},20000);});
 try{const response=fetch(url,{method:kind==='context'?'POST':'GET',headers,signal:controller.signal}).then(async r=>{headersMs=Math.round(performance.now()-start);requestId=r.headers.get('x-vercel-id');const rawTiming=r.headers.get('x-rezlee-perf');if(rawTiming)timing=JSON.parse(rawTiming);status=r.status;return r.json();});const data=await Promise.race([response,deadline]);valid=status===200&&!data.error&&!data.needsOnboarding;if(kind==='app')valid=valid&&validPayload(route,data,user);if(kind==='database')valid=valid&&data.length===1;}
 catch(e){errorKind=e.name;valid=false;}finally{clearTimeout(timeout);inFlight--;}
 return {userIndex:users.indexOf(user),startedAt,headersMs,requestId,route:kind==='app'?route:kind,ms:Math.round(performance.now()-start),status,valid,errorKind,timing:performance.now()-start>500?timing:null};
}
function summary(label,rows,elapsed,extra={}){return{label,...extra,requests:rows.length,seconds:+(elapsed/1000).toFixed(2),rps:+(rows.length*1000/elapsed).toFixed(2),p50Ms:pct(rows.map(r=>r.ms),.5),p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),failures:rows.filter(r=>!r.valid).length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),routes:[...new Set(rows.map(r=>r.route))].map(route=>{const z=rows.filter(r=>r.route===route);return{route,requests:z.length,p95Ms:pct(z.map(r=>r.ms),.95),failures:z.filter(r=>!r.valid).length}}),errors:rows.filter(r=>!r.valid).map(r=>({userIndex:r.userIndex,startedAt:r.startedAt,route:r.route,status:r.status,errorKind:r.errorKind,ms:r.ms,headersMs:r.headersMs,requestId:r.requestId})),slowRequests:rows.filter(r=>r.ms>500).map(r=>({userIndex:r.userIndex,startedAt:r.startedAt,route:r.route,status:r.status,ms:r.ms,headersMs:r.headersMs,requestId:r.requestId,timing:r.timing})).slice(0,500)};}

const startedAt=new Date().toISOString(),began=performance.now(),duration=30*60*1000,rate=30,total=54000;
const rows=[],pending=new Set(),busy=new Set();let offered=0,skipped=0,lagExceeded=false,stopReason=null,lastMinute=0,maxDispatchLagMs=0;const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();const cpuStart=process.cpuUsage();
fs.writeFileSync(output+'/soak-run.json',JSON.stringify({dispatchedAt:startedAt,origin:'Mac Toronto',targetRps:rate,durationMinutes:30}));
function save(final=false){
 const elapsed=performance.now()-began;const result=summary('sustained-300-active-sessions',rows,elapsed,{activeSessions:300,targetRps:rate,offered,skipped,maxInFlight});
 const startupRows=rows.slice().sort((a,b)=>a.startedAt.localeCompare(b.startedAt)).slice(0,300);
 const startupWindow=summary('first-300-after-10-minute-idle',startupRows,10000);
 const startupPass=startupRows.length===300&&startupWindow.failures===0&&startupWindow.p95Ms<=2000&&startupWindow.p99Ms<=4000;
 const pass=startupPass&&final&&!safetyStopped&&!lagExceeded&&skipped===0&&rows.length===total&&result.failures===0&&result.p95Ms<=500&&result.p99Ms<=1500&&result.routes.every(r=>r.p95Ms<=500);
 fs.writeFileSync(output+'/soak-load-report.json',JSON.stringify({checkedAt:new Date().toISOString(),startedAt,origin:'Mac Toronto; not a device-render test',nodeVersion:process.version,fixtureRun:settings.run,configuredUsers:300,distinctUsers:new Set(rows.map(row=>row.userIndex)).size,targetDurationMinutes:30,targetRequests:total,elapsedSeconds:Math.round(elapsed/1000),complete:final,startupWindow:{...startupWindow,pass:startupPass,idleSeconds:settings.idleSeconds,targets:{p95Ms:2000,p99Ms:4000}},safetyStopped,stopReason,lagExceeded,pass,phases:[result],scope:'Staging synthetic reads. Hosted mutation/upload acceptance runs, if executed during this window, are reported separately. No provider, AI or payment calls.'},null,2));
 console.log(JSON.stringify({at:new Date().toISOString(),seconds:Math.round(elapsed/1000),complete:final,requests:rows.length,offered,skipped,inFlight,p95Ms:result.p95Ms,p99Ms:result.p99Ms,failures:result.failures,stopReason,pass}));
}
console.log('SOAK_STARTED',startedAt,'target 54000 requests at 30/sec');
for(let i=0;i<total;i++){
 if(control.stop){safetyStopped=true;stopReason='Operator interrupted run';break;}
 const due=began+i*(1000/rate);await sleep(Math.max(0,due-performance.now()));
 maxDispatchLagMs=Math.max(maxDispatchLagMs,performance.now()-due);if(performance.now()-due>1000){lagExceeded=true;stopReason='Generator could not maintain offered rate';break;}
 if(safetyStopped)break;
 offered++;const user=users[i%300],route=paths[(i%300+Math.floor(i/300))%paths.length];
 if(busy.has(user)){skipped++;continue;}busy.add(user);
 const task=request(user,route).then(row=>{rows.push(row);if(rows.length>=100){const recent=rows.slice(-100);if(recent.filter(x=>!x.valid).length>1||pct(recent.map(x=>x.ms),.95)>2000){safetyStopped=true;stopReason='Recent error/latency safety limit';}}}).finally(()=>{busy.delete(user);pending.delete(task);});pending.add(task);
 const minute=Math.floor((performance.now()-began)/60000);if(minute>lastMinute){lastMinute=minute;save();}
}
await Promise.allSettled([...pending]);save(true);console.log('SOAK_COMPLETE');
eventLoop.disable();const final=JSON.parse(fs.readFileSync(output+'/soak-load-report.json'));const cpu=process.cpuUsage(cpuStart);final.generator={maxDispatchLagMs:Math.round(maxDispatchLagMs),eventLoopP99Ms:Math.round(eventLoop.percentile(99)/1e6),cpuMs:Math.round((cpu.user+cpu.system)/1000)};fs.writeFileSync(output+'/soak-load-report.json',JSON.stringify(final,null,2));fs.writeFileSync(output+'/soak-rows.json',JSON.stringify(rows));return final;
}


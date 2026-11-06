import fs from 'node:fs';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {execFileSync,spawn} from 'node:child_process';
const out=process.env.REZLEE_QA_OUTPUT,input=process.env.REZLEE_LOAD_SESSIONS;
if(!out||!input)throw Error('Explicit private output and fixture paths required');
const state=JSON.parse(fs.readFileSync(input)),origin='https://gjwvalpxnfbvryosmcbj.supabase.co',app='https://rezlee-performance-staging.vercel.app';
if(state.users.length!==300)throw Error('300 synthetic accounts required');
const claims=state.users.map(u=>JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')));
for(let i=0;i<300;i++){const c=claims[i];if(c.iss!==origin+'/auth/v1'||c.sub!==state.users[i].id||c.user_metadata?.qa_run!==state.run||c.user_metadata.qa_marker!==true||!/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(c.email||'')||c.exp*1000<Date.now()+15*60000)throw Error('Synthetic identity or expiry guard');}
const paths=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
const pct=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*p)-1]:null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2),{mode:0o600});
const summary=rows=>({requests:rows.length,failures:rows.filter(r=>!r.valid).length,p50Ms:pct(rows.map(r=>r.ms),.5),p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),maxMs:Math.max(0,...rows.map(r=>r.ms)),upstreamP95Ms:pct(rows.filter(r=>r.upstreamMs!==null).map(r=>r.upstreamMs),.95)});
const token=execFileSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'}).trim();
async function sql(query,read_only=true){const r=await fetch('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Staging configuration request failed '+r.status);return r.json();}
function appValid(route,d,u){if(d?.error||d?.needsOnboarding)return false;switch(route){case paths[0]:return d.home?.id===u.home&&Array.isArray(d.availability?.missing)&&d.availability.missing.length===0;case 'bills':return d.bills?.length>=12;case 'vault':return d.documents?.length>=8&&d.summary?.recordsCount>=8;case 'care':return d.tasks?.length>=6&&d.householdAvailable===true;case 'shared-expenses':return d.home?.id===u.home&&Array.isArray(d.entries)&&Array.isArray(d.people);case 'purchase-decisions':return d.homeId===u.home&&Array.isArray(d.decisions);default:return false;}}
async function request(kind,i,phase){
 const userIndex=i%300,u=state.users[userIndex],route=paths[(userIndex+Math.floor(i/300))%6],start=performance.now(),startedAt=new Date().toISOString();
 let status=0,valid=false,error=null,trace=null,upstreamMs=null,serverMs={},bytes=0;
 try{
  const home=route===paths[0],url=kind==='app'?app+'/api/mobile/v1/'+route:origin+'/rest/v1/rpc/'+(home?'rezlee_mobile_read_bootstrap':'rezlee_mobile_screen_bootstrap');
  const headers={Authorization:'Bearer '+u.token,'x-rezlee-qa-trace':phase+'_'+i};
  if(kind==='direct'){headers.apikey=state.anonKey;headers['Content-Type']='application/json';}
  const response=await fetch(url,{method:kind==='app'?'GET':'POST',headers,body:kind==='app'?undefined:JSON.stringify(home?{p_snapshot:true,p_effective:true}:{p_screen:route,p_effective:true}),signal:AbortSignal.timeout(20000)});
  status=response.status;
  const upstream=response.headers.get('x-envoy-upstream-service-time');if(upstream!==null)upstreamMs=Number(upstream);
  const rawTrace=response.headers.get('x-rezlee-perf');if(rawTrace)trace=JSON.parse(rawTrace);
  for(const part of (response.headers.get('server-timing')||'').split(',')){const m=/^(jwt|parse|plan|transaction|response)\s*;\s*dur=([\d.]+)/.exec(part.trim());if(m)serverMs[m[1]]=Number(m[2]);}
  const raw=await response.text();bytes=Buffer.byteLength(raw);const d=JSON.parse(raw);
  valid=status===200&&(kind==='app'?appValid(route,d,u):d.access==='active'&&d.user?.id===u.id&&d.homeAccess?.home?.id===u.home&&(home?!!d.homeSnapshot:d.screenSnapshot?.kind===route));
 }catch(e){error=e.name;}
 return {i,userIndex,route,startedAt,ms:Math.round(performance.now()-start),status,valid,error,bytes,upstreamMs,serverMs,trace};
}
async function functionals(phase){
 await sleep(90000);const rows=[];
 for(const [name,tmp] of [['shared-expenses','/tmp/rezlee-shared-hosted-results.json'],['care-household','/tmp/rezlee-care-hosted-results.json']]){
  const begin=Date.now(),dest=out+'/'+phase+'-'+name;fs.mkdirSync(dest,{recursive:true,mode:0o700});
  const log=fs.openSync(dest+'/run.log','w');
  const child=spawn('/usr/local/bin/node',['/Users/razakhan/Library/Application Support/Rezlee/performance-cold-20261020/qa/'+name+'.mjs'],{cwd:process.cwd(),env:{...process.env,REZLEE_QA_OUTPUT:dest},stdio:['ignore',log,log]});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180000);
  const exitCode=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);fs.closeSync(log);
  let d={};if(fs.existsSync(tmp)&&fs.statSync(tmp).mtimeMs>=begin){d=JSON.parse(fs.readFileSync(tmp));fs.copyFileSync(tmp,dest+'/hosted-results.json');}
  rows.push({suite:name,startedAt:new Date(begin).toISOString(),completedAt:new Date().toISOString(),exitCode,timedOut,checks:d.checks?.length||0,failure:!!d.failure});
  if(exitCode||timedOut||d.failure)break;
 }
 return rows;
}
let monitor=null,timingEnabled=false,results=[];
try{
 const old=await sql("select c from pg_roles r cross join lateral unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.server_timing_enabled=%'");
 if(old.length)throw Error('Timing setting has an existing owner');
 save('timing-owned.json',{at:new Date().toISOString(),originallyUnset:true});
 await sql("alter role authenticator set pgrst.server_timing_enabled='true'; notify pgrst,'reload config';",false);timingEnabled=true;
 const log=fs.openSync(out+'/metrics.log','w');monitor=spawn('python3',['scripts/qa/performance-metrics-staging.py','matched','1200'],{env:process.env,stdio:['ignore',log,log]});fs.closeSync(log);
 save('matched-harness-audit.json',{at:new Date().toISOString(),users:300,distinctTokens:new Set(state.users.map(u=>u.token)).size,distinctSessions:new Set(claims.map(c=>c.session_id)).size,tokenAlgorithms:[...new Set(state.users.map(u=>JSON.parse(Buffer.from(u.token.split('.')[0],'base64url')).alg))],minSessionSecondsRemaining:Math.floor(Math.min(...claims.map(c=>c.exp))-Date.now()/1000),rate:30,phaseSeconds:120,routePattern:'same account/route sequence for every phase',order:['direct','app','app','direct'],fixtureCounts:{billsPerHome:12,documentsPerHome:8,tasksPerHome:6},sessionRefreshDuringMeasurement:false,scope:'Matched backend diagnosis; not phone-render measurement or full acceptance',jobs:'ordinary scheduled jobs unchanged',functionals:'same Sharing and Care suites begin 90 seconds into each phase',limitations:['Cache history carries over; ABBA controls order partially, not a clean independent cold-start experiment','App and direct paths have different network locations; dependency traces separate layers']});
 console.log('SETTLING_AFTER_PREPARATION',new Date().toISOString());await sleep(60000);
 for(const [index,kind] of ['direct','app','app','direct'].entries()){
  const phase=String(index+1)+'-'+kind,startedAt=new Date().toISOString(),began=performance.now(),cpu=process.cpuUsage(),eld=monitorEventLoopDelay({resolution:20});eld.enable();
  const rows=[],pending=new Set(),busy=new Set();let stopped=false,lagExceeded=false,skipped=0,offered=0,maxInFlight=0,maxLagMs=0;
  console.log('PHASE_STARTED',phase,startedAt);
  const mixed=functionals(phase);
  for(let i=0;i<3600;i++){
   const due=began+i*1000/30;await sleep(Math.max(0,due-performance.now()));const lag=performance.now()-due;maxLagMs=Math.max(maxLagMs,lag);
   if(lag>1000){lagExceeded=true;break;}if(stopped)break;offered++;const userIndex=i%300;
   if(busy.has(userIndex)){skipped++;continue;}busy.add(userIndex);
   const p=request(kind,i,phase).then(row=>{rows.push(row);if(rows.length>=100){const last=rows.slice(-100);if(last.filter(r=>!r.valid).length>1||pct(last.map(r=>r.ms),.95)>2000)stopped=true;}}).finally(()=>{pending.delete(p);busy.delete(userIndex);});pending.add(p);maxInFlight=Math.max(maxInFlight,pending.size);
  }
  await Promise.allSettled([...pending]);eld.disable();const duration=performance.now()-began,cpuUsed=process.cpuUsage(cpu),functional=await mixed;
  const report={phase,kind,startedAt,completedAt:new Date().toISOString(),targetRequests:3600,targetRps:30,elapsedSeconds:+(duration/1000).toFixed(2),offered,skipped,safetyStopped:stopped,lagExceeded,maxInFlight,maxDispatchLagMs:Math.round(maxLagMs),generatorCpuMs:Math.round((cpuUsed.user+cpuUsed.system)/1000),generatorEventLoopP99Ms:+(eld.percentile(99)/1e6).toFixed(2),distinctUsers:new Set(rows.map(r=>r.userIndex)).size,...summary(rows),routes:paths.map(route=>({route,...summary(rows.filter(r=>r.route===route))})),windows:Array.from({length:Math.ceil(duration/10000)},(_,n)=>({second:n*10,...summary(rows.filter(r=>Date.parse(r.startedAt)>=Date.parse(startedAt)+n*10000&&Date.parse(r.startedAt)<Date.parse(startedAt)+(n+1)*10000))})),functionals:functional};
  save(phase+'-rows.json',rows);save(phase+'-summary.json',report);results.push(report);save('matched-summary.json',{checkedAt:new Date().toISOString(),complete:false,results});console.log('PHASE_RESULT',JSON.stringify(report));
  if(functional.some(x=>x.exitCode!==0||x.failure||x.timedOut))throw Error('Concurrent functional failure; stopped for review');
  await sleep(30000);
 }
 save('matched-summary.json',{checkedAt:new Date().toISOString(),complete:true,acceptancePassed:false,results,scope:'Diagnostic comparison only; full acceptance not run'});
}finally{
 if(monitor){fs.mkdirSync(out+'/capacity-matched',{recursive:true});fs.writeFileSync(out+'/capacity-matched/stop','');monitor.kill('SIGTERM');}
 if(timingEnabled){await sql("alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';",false);save('timing-restored.json',{at:new Date().toISOString(),restored:true});}
}

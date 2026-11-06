import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
const out=process.env.REZLEE_QA_OUTPUT,input=process.env.REZLEE_LOAD_SESSIONS;
if(!out||!input)throw Error('Explicit private paths required');
const state=JSON.parse(fs.readFileSync(input)),origin='https://gjwvalpxnfbvryosmcbj.supabase.co';
if(state.users.length!==25)throw Error('Expected 25 synthetic accounts');
for(const u of state.users){const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.iss!==origin+'/auth/v1'||c.sub!==u.id||c.user_metadata?.qa_marker!==true||c.user_metadata.qa_run!==state.run||c.exp*1000<Date.now()+5*60000)throw Error('Staging fixture guard');}
const secret=execFileSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'}).trim();
const save=(name,d)=>fs.writeFileSync(out+'/'+name,JSON.stringify(d,null,2),{mode:0o600});
async function sql(query,read_only=true){const r=await fetch('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Staging configuration failed '+r.status);return r.json();}
async function rpc(u){const start=performance.now();const r=await fetch(origin+'/rest/v1/rpc/rezlee_authenticated_mobile_context',{method:'POST',headers:{apikey:state.anonKey,Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});const timing={};for(const part of (r.headers.get('server-timing')||'').split(',')){const m=/^(jwt|transaction)\s*;\s*dur=([\d.]+)/.exec(part.trim());if(m)timing[m[1]]=Number(m[2]);}const data=await r.json();return{status:r.status,valid:r.status===200&&data.access==='active'&&data.user?.id===u.id,ms:Math.round(performance.now()-start),jwtMs:timing.jwt??null,transactionMs:timing.transaction??null};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pct=(a,p)=>a.length?a.slice().sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]:null;
const configQuery="select c from pg_roles r cross join lateral unnest(r.rolconfig) c where r.rolname='authenticator' and (c like 'pgrst.jwt_cache_max_entries=%' or c like 'pgrst.server_timing_enabled=%')";
let owned=false;const phases=[];
try{
 const prior=await sql(configQuery);
 if(prior.length)throw Error('Existing diagnostic configuration must not be overwritten');
 save('settings-owned.json',{at:new Date().toISOString(),originalTimingUnset:true,originalCacheSettingUnset:true});owned=true;
 await sql("alter role authenticator set pgrst.server_timing_enabled='true'; notify pgrst,'reload config';",false);
 for(const setting of [null,1,5000]){
  if(setting!==null)await sql("alter role authenticator set pgrst.jwt_cache_max_entries='"+setting+"'; notify pgrst,'reload config';",false);
  await sleep(3000);
  const stored=await sql(configQuery),total=300,began=performance.now(),rows=[],pending=new Set();let stopped=false,maxLag=0;
  for(let i=0;i<total;i++){
   const due=began+i*1000/30;await sleep(Math.max(0,due-performance.now()));maxLag=Math.max(maxLag,performance.now()-due);if(stopped||maxLag>1000)break;
   const task=rpc(state.users[i%25]).then(r=>{rows.push({i,...r});if(rows.length>=100){const recent=rows.slice(-100);if(recent.filter(r=>!r.valid).length>1||pct(recent.map(r=>r.ms),.95)>2000)stopped=true;}}).catch(()=>{rows.push({i,ms:10000,status:0,valid:false,jwtMs:null,transactionMs:null});stopped=true;}).finally(()=>pending.delete(task));pending.add(task);
  }
  await Promise.allSettled([...pending]);const repeats=rows.filter(r=>r.i>=25),report={setting:setting??'unset',stored,requests:rows.length,targetRequests:total,elapsedSeconds:+((performance.now()-began)/1000).toFixed(2),failures:rows.filter(r=>!r.valid).length,safetyStopped:stopped,maxDispatchLagMs:Math.round(maxLag),p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),repeatedRequests:repeats.length,repeatedJwtOver5Ms:repeats.filter(r=>r.jwtMs>5).length,repeatedMedianJwtMs:pct(repeats.map(r=>r.jwtMs??0),.5),missingTiming:rows.filter(r=>r.jwtMs===null).length};
  phases.push(report);save('phase-'+phases.length+'-rows.json',rows);save('summary.json',{at:new Date().toISOString(),phases,scope:'Runtime effectiveness of in-database cache configuration; diagnostic only, no full application acceptance'});console.log(JSON.stringify(report));if(stopped||maxLag>1000)break;
 }
}finally{
 if(owned){await sql("alter role authenticator reset pgrst.jwt_cache_max_entries; alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload config';",false);const remaining=await sql(configQuery);if(remaining.length)throw Error('Configuration restoration verification failed');save('settings-restored.json',{at:new Date().toISOString(),restored:true,verifiedUnset:true});}
}

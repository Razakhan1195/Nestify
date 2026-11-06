import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out=process.env.REZLEE_QA_OUTPUT,input=process.env.REZLEE_LOAD_SESSIONS;
if(!out||!input)throw Error('Explicit private paths required');
const state=JSON.parse(fs.readFileSync(input)),origin='https://gjwvalpxnfbvryosmcbj.supabase.co';
if(state.users.length!==300)throw Error('Expected retained 300 accounts');
for(const u of state.users){const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.iss!==origin+'/auth/v1'||c.sub!==u.id||c.user_metadata?.qa_marker!==true||c.user_metadata.qa_run!==state.run||c.exp*1000<Date.now()+5*60000)throw Error('Staging fixture guard');}
const secret=execFileSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'}).trim();
const save=(name,d)=>fs.writeFileSync(out+'/'+name,JSON.stringify(d,null,2),{mode:0o600});
async function sql(query,read_only=true){const r=await fetch('https://api.supabase.com/v1/projects/gjwvalpxnfbvryosmcbj/database/query',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Staging diagnostic configuration failed '+r.status);return r.json();}
async function rpc(name,body,u){const start=performance.now();const r=await fetch(origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:state.anonKey,Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const timing={};for(const part of (r.headers.get('server-timing')||'').split(',')){const m=/^(jwt|transaction)\s*;\s*dur=([\d.]+)/.exec(part.trim());if(m)timing[m[1]]=Number(m[2]);}return{status:r.status,data:await r.json(),ms:Math.round(performance.now()-start),timing};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pct=(a,p)=>a.length?a.slice().sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]:null;
let owned=false;
try{
 const exists=await sql("select to_regprocedure('public.rezlee_qa_bearer_match(text)') is not null as exists");
 if(exists[0]?.exists)throw Error('Diagnostic function name already owned');
 const prior=await sql("select c from pg_roles r cross join lateral unnest(r.rolconfig) c where r.rolname='authenticator' and c like 'pgrst.server_timing_enabled=%'");
 if(prior.length)throw Error('Previous timing owner still active');
 save('wire-owned.json',{at:new Date().toISOString(),functionName:'rezlee_qa_bearer_match',originalTimingUnset:true});owned=true;
 await sql(`create function public.rezlee_qa_bearer_match(p_expected text) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
 declare incoming text;
 begin
 if auth.uid() is null or auth.jwt()->'user_metadata'->>'qa_marker' is distinct from 'true' then raise exception using errcode='PT401',message='Synthetic session required';end if;
 incoming:=regexp_replace(current_setting('request.headers',true)::jsonb->>'authorization','^Bearer[ ]+','','i');
 return jsonb_build_object('hasAuthorization',incoming is not null,'sameBearer',encode(extensions.digest(incoming,'sha256'),'hex')=p_expected,'bearerLength',length(incoming));
 end $fn$;
 revoke all on function public.rezlee_qa_bearer_match(text) from public,anon;
 grant execute on function public.rezlee_qa_bearer_match(text) to authenticated;
 alter role authenticator set pgrst.server_timing_enabled='true';
 notify pgrst,'reload schema'; notify pgrst,'reload config';`,false);
 await sleep(2500);
 const matches=[];
 for(const index of [0,149,299]){const u=state.users[index];for(let n=0;n<2;n++){const result=await rpc('rezlee_qa_bearer_match',{p_expected:createHash('sha256').update(u.token).digest('hex')},u);matches.push({index,attempt:n,status:result.status,comparison:result.status===200?result.data:null,timing:result.timing});}}
 save('wire-token-comparison.json',{at:new Date().toISOString(),matches,scope:'Only booleans and lengths; no tokens or token digests retained'});
 if(matches.some(r=>r.status!==200))throw Error('Bearer diagnostic not successful');
 const results=[];
 for(const count of [25,100,200,300,100]){
  const total=Math.max(300,count*4),began=performance.now(),rows=[],pending=new Set();let stopped=false,maxLag=0;
  for(let i=0;i<total;i++){const due=began+i*1000/30;await sleep(Math.max(0,due-performance.now()));maxLag=Math.max(maxLag,performance.now()-due);if(stopped||maxLag>1000)break;
   const task=rpc('rezlee_authenticated_mobile_context',{},state.users[i%count]).then(r=>{rows.push({i,ms:r.ms,jwtMs:r.timing.jwt??null,transactionMs:r.timing.transaction??null,status:r.status,valid:r.status===200&&r.data.access==='active'&&r.data.user?.id===state.users[i%count].id});if(rows.length>=100){const recent=rows.slice(-100);if(recent.filter(r=>!r.valid).length>1||pct(recent.map(r=>r.ms),.95)>2000)stopped=true;}}).catch(()=>{rows.push({i,ms:10000,status:0,valid:false,jwtMs:null,transactionMs:null});stopped=true;}).finally(()=>pending.delete(task));pending.add(task);
  }
  await Promise.allSettled([...pending]);const repeats=rows.filter(r=>r.i>=count),report={count,requests:rows.length,targetRequests:total,elapsedSeconds:+((performance.now()-began)/1000).toFixed(2),failures:rows.filter(r=>!r.valid).length,safetyStopped:stopped,maxDispatchLagMs:Math.round(maxLag),p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),repeatedRequests:repeats.length,repeatedJwtOver5Ms:repeats.filter(r=>r.jwtMs>5).length,repeatedMedianJwtMs:pct(repeats.map(r=>r.jwtMs??0),.5)};
  results.push(report);save('wire-cardinality-summary.json',{at:new Date().toISOString(),results,scope:'Authentication working-set diagnostic only; unchanged fixed tokens and request rate; minimal context RPC, not full application acceptance'});save('wire-cardinality-'+results.length+'-rows.json',rows);console.log(JSON.stringify(report));if(stopped||maxLag>1000)break;await sleep(1000);
 }
}finally{
 if(owned){await sql("drop function if exists public.rezlee_qa_bearer_match(text); alter role authenticator reset pgrst.server_timing_enabled; notify pgrst,'reload schema'; notify pgrst,'reload config';",false);save('wire-restored.json',{at:new Date().toISOString(),diagnosticFunctionRemoved:true,timingRestored:true});}
}

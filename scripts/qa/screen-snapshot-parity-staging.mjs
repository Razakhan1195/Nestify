import fs from 'node:fs';
const dir=process.env.REZLEE_QA_OUTPUT,phase=process.env.REZLEE_PARITY_PHASE;
if(!dir||!['before','after'].includes(phase))throw Error('Explicit output and phase required');
const s=JSON.parse(fs.readFileSync(process.env.REZLEE_LOAD_SESSIONS));
const results=[];
function comparable(route,data){const value=structuredClone(data);if(route.startsWith('home')&&value.availability)delete value.availability.checkedAt;return value;}
function canonical(x){if(Array.isArray(x))return x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return x;}
for(const [index,u] of s.users.slice(0,3).entries()){
 const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.iss!=='https://gjwvalpxnfbvryosmcbj.supabase.co/auth/v1'||c.user_metadata?.qa_run!==s.run||c.sub!==u.id)throw Error('Staging fixture guard');
 for(const route of (process.env.REZLEE_PARITY_ALL==='true'?['home?availability=1','bills','care','vault','shared-expenses','purchase-decisions']:['bills','care'])){
  const res=await fetch('https://staging.rezlee.com/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+u.token,'x-rezlee-qa-trace':'parity_'+phase+'_'+index},signal:AbortSignal.timeout(20000)});
  if(res.status!==200)throw Error('Parity request failed '+res.status);const data=await res.json();
  results.push({index,route,data:canonical(data),trace:JSON.parse(res.headers.get('x-rezlee-perf')||'null')});
 }
}
fs.writeFileSync(dir+'/parity-'+phase+'.json',JSON.stringify(results,null,2),{mode:0o600});
if(phase==='after'){
 const before=JSON.parse(fs.readFileSync(dir+'/parity-before.json'));
 const checks=results.map((x,i)=>({index:x.index,route:x.route,equal:JSON.stringify(comparable(x.route,x.data))===JSON.stringify(comparable(before[i].route,before[i].data)),calls:x.trace?.dependencies?.length,dependencies:x.trace?.dependencies?.map(d=>d.path)}));
 fs.writeFileSync(dir+'/parity-summary.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));if(checks.some(x=>!x.equal||x.calls!==1))process.exitCode=1;
}else console.log('Captured',results.length,'baseline responses');

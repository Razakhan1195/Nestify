import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
const s=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
if(s.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
const fixtures=[],stages=[],waves=[],run=randomUUID(),journal='/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019/load-fixtures.json';
const out='docs/checkpoints/overnight-20261019/load-300.json';
const must=r=>{if(r.error)throw Error('Fixture failure '+(r.error.code||r.error.status));return r.data;};
async function pool(items,n,fn){let i=0;const settled=await Promise.allSettled(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const j=i++;await fn(items[j],j);}}));const failed=settled.find(r=>r.status==="rejected");if(failed)throw failed.reason;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;
let failure=null,cleanup=true,maxInFlight=0,inFlight=0;
try{
 await pool(Array.from({length:300},(_,i)=>i),1,async i=>{
  await sleep(2000);
  const email='load-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const f={id:user.id};fixtures.push(f);fs.writeFileSync(journal,JSON.stringify({run,userIds:fixtures.map(x=>x.id)}),{mode:0o600});
  const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
  f.token=must(await client.auth.signInWithPassword({email,password})).session.access_token;
  const home=must(await admin.from('homes').insert({user_id:f.id,nickname:'Synthetic load household'}).select('id').single());f.home=home.id;
  must(await admin.from('bills').insert(Array.from({length:12},(_,j)=>({home_id:f.home,user_id:f.id,name:'Synthetic bill '+j,amount:55+j,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'}))));
  must(await admin.from('documents').insert(Array.from({length:8},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic record '+j,document_type:'receipt'}))));
  must(await admin.from('maintenance_tasks').insert(Array.from({length:6},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic task '+j,status:'open',due_date:'2026-10-25'}))));
  if((i+1)%25===0)console.log('FIXTURES',i+1);
 });
 const paths=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
 for(const count of [25,75,150,300]){
  const rows=[],started=performance.now();console.log('STAGE',count);
  for(let round=0;round<6;round++){
   await Promise.all(fixtures.slice(0,count).map(async(f,i)=>{
    const route=paths[(i+round)%paths.length],start=performance.now();let status=0,bytes=0,valid=false,errorKind=null;
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    try{const r=await fetch('https://staging.rezlee.com/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+f.token},signal:AbortSignal.timeout(20000)});status=r.status;const text=await r.text();bytes=Buffer.byteLength(text);const data=JSON.parse(text);valid=status===200&&!data.error&&!data.needsOnboarding;}catch(e){errorKind=e.name;}finally{inFlight--;}
    rows.push({route,ms:Math.round(performance.now()-start),status,bytes,valid,errorKind});
   }));
   const recent=rows.slice(-count); const wave={concurrentUsers:count,round,requests:recent.length,p50Ms:pct(recent.map(r=>r.ms),.5),p95Ms:pct(recent.map(r=>r.ms),.95),statuses:recent.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),errors:recent.filter(r=>!r.valid).map(r=>({route:r.route,status:r.status,errorKind:r.errorKind,ms:r.ms})),routes:paths.map(route=>({route,p95Ms:pct(recent.filter(r=>r.route===route).map(r=>r.ms),.95)}))}; waves.push(wave); console.log('WAVE',JSON.stringify(wave)); fs.writeFileSync(out,JSON.stringify({run,stages,waves,running:true},null,2));if(recent.filter(r=>r.status===0||r.status>=500).length/count>0.02||pct(recent.map(r=>r.ms),.95)>10000)throw Error('Safety stop at '+count+' users: errors or p95 exceeded abort threshold');
   await sleep(1000);
  }
  const ms=performance.now()-started;const summary={concurrentUsers:count,requests:rows.length,seconds:Number((ms/1000).toFixed(2)),rps:Number((rows.length*1000/ms).toFixed(2)),p50Ms:pct(rows.map(r=>r.ms),.5),p95Ms:pct(rows.map(r=>r.ms),.95),p99Ms:pct(rows.map(r=>r.ms),.99),failures:rows.filter(r=>!r.valid).length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),routes:paths.map(route=>{const a=rows.filter(r=>r.route===route);return{route,requests:a.length,p95Ms:pct(a.map(r=>r.ms),.95),failures:a.filter(r=>!r.valid).length}})};
  stages.push(summary);console.log(JSON.stringify(summary));fs.writeFileSync(out,JSON.stringify({run,stages,running:true},null,2));await sleep(5000);
 }
}catch(e){failure=e.message;console.log('FAIL',failure);process.exitCode=1;}
finally{
 await pool(fixtures,3,async f=>{const r=await admin.auth.admin.deleteUser(f.id);if(r.error)cleanup=false;});
 if(cleanup)fs.writeFileSync(journal,JSON.stringify({run,cleaned:true,count:fixtures.length}),{mode:0o600});
 const report={checkedAt:new Date().toISOString(),run,environment:'staging.rezlee.com',distinctAuthenticatedUsers:fixtures.length,maxInFlight,stages,waves,failure,cleanup,paidCalls:0,scope:'Authenticated API read load, established synthetic households. Six synchronized request waves per stage with one second think time. Not native frame rate, mobile network, upload, AI/provider throughput or a production capacity guarantee.'};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log('COMPLETE',JSON.stringify({failure,cleanup,maxInFlight,stages:stages.length}));
}

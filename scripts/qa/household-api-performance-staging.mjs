import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import fs from 'node:fs';import {performance} from 'node:perf_hooks';import {createClient} from '@supabase/supabase-js';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://gjwvalpxnfbvryosmcbj.supabase.co');
const options={auth:{persistSession:false,autoRefreshToken:false}},db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options),users=[],results=[];
const must=r=>{if(r.error)throw Error('Fixture operation failed: '+(r.error.code||r.error.status||'unknown'));return r.data;};
let complete=false;
try{
 const email='rezlee-performance-'+randomUUID()+'@example.invalid',password='Fixture-'+randomUUID()+'-Aa1!';const user=must(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:'household-performance-20261013'}})).user;users.push(user.id);
 const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options),token=must(await c.auth.signInWithPassword({email,password})).session.access_token;const home=must(await db.from('homes').insert({user_id:user.id,nickname:'Synthetic established household'}).select('id').single());const owner={user_id:user.id,home_id:home.id};
 must(await db.from('bills').insert(Array.from({length:60},(_,i)=>({...owner,name:'Synthetic monthly bill',amount:50+i,currency:'CAD',status:i%5?'paid':'upcoming',payment_status:i%5?'paid':'unpaid',due_date:'2026-10-'+String(i%28+1).padStart(2,'0')}))));
 must(await db.from('documents').insert(Array.from({length:30},(_,i)=>({...owner,title:'Synthetic saved record '+i,document_type:i%2?'receipt':'warranty'}))));
 must(await db.from('maintenance_tasks').insert(Array.from({length:20},(_,i)=>({...owner,title:'Synthetic care task '+i,status:i%4?'open':'completed',due_date:'2026-11-20'}))));
 const paths=['home?availability=1','bills','vault','care','providers','purchase-decisions'];
 const call=async(route,round)=>{const started=performance.now(),response=await fetch('https://staging.rezlee.com/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const text=await response.text();assert.equal(response.status,200,route);const data=JSON.parse(text);assert.ok(!data.error&&!data.needsOnboarding,route+' customer state');if(route==='vault')assert.equal(data.documents.length,30);if(route==='care')assert.equal(data.tasks.length,20);results.push({route,round,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(text),status:response.status});};
 for(let round=0;round<5;round++)for(let start=0;start<paths.length;start+=3)await Promise.all(paths.slice(start,start+3).map(route=>call(route,round)));
 complete=true;
}finally{
 for(const user of users)must(await db.auth.admin.deleteUser(user));
 const sorted=results.map(r=>r.ms).sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
 const out={checkedAt:new Date().toISOString(),complete,cleanup:true,maxConcurrent:3,requests:results.length,p50Ms:percentile(.5),p95Ms:percentile(.95),results,note:'Bounded synthetic established-household staging smoke, includes real Auth/RLS/network. Not a production capacity test, device frame-rate test or provider/AI load test.',paidCalls:0};fs.writeFileSync('docs/checkpoints/performance-20261013/hosted-api-results.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({complete,cleanup:true,requests:results.length,p50Ms:out.p50Ms,p95Ms:out.p95Ms}));
}

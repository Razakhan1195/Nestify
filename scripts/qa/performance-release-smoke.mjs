import fs from 'node:fs';import {createClient} from '@supabase/supabase-js';import {performance} from 'node:perf_hooks';
const root=process.env.REZLEE_QA_OUTPUT,s=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS)),state=JSON.parse(fs.readFileSync(root+'/cloud-load-sessions.json'));
if(s.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co'||state.users.length!==1)throw Error('Synthetic staging guard');
const admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),u=state.users[0],rows=[];
const c=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url'));if(c.user_metadata?.qa_run!==state.run||!c.user_metadata.qa_marker)throw Error('Fixture guard');
try{
 for(const route of ['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions']){
  const started=performance.now(),r=await fetch('https://rezlee-performance-staging.vercel.app/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+u.token,'x-rezlee-qa-trace':'release_smoke'},signal:AbortSignal.timeout(15000)}),d=await r.json();
  const valid=r.status===200&&!d.error&&!d.needsOnboarding&&(route.startsWith('home')?d.home?.id===u.home:route==='bills'?d.bills?.length>=12:route==='vault'?d.documents?.length>=8:route==='care'?d.tasks?.length>=6:true);
  rows.push({route,status:r.status,valid,ms:Math.round(performance.now()-started)});if(!valid)throw Error('Readiness failed '+route);
 }
 const seed=await admin.from('rezlee_member_accounts').insert({user_id:u.id});if(seed.error)throw Error('Member setup');
 const r=await fetch('https://rezlee-performance-staging.vercel.app/api/mobile/v1/membership',{method:'POST',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:'{"action":"activate"}',signal:AbortSignal.timeout(15000)}),d=await r.json();rows.push({route:'membership activate',status:r.status,valid:r.status===200&&d.membership?.plan==='free'});if(!rows.at(-1).valid)throw Error('Activation failed');
 fs.writeFileSync(root+'/summary.json',JSON.stringify({at:new Date().toISOString(),passed:true,rows,scope:'Single-account promoted runtime smoke only'},null,2));console.log(JSON.stringify({passed:true,rows}));
}finally{
 const result=await admin.auth.admin.deleteUser(u.id);if(result.error)throw Error('Cleanup failed');fs.rmSync(root+'/cloud-load-sessions.json',{force:true});fs.writeFileSync(root+'/cleanup.json',JSON.stringify({at:new Date().toISOString(),removed:1,tokensRemoved:true,productionTouched:false}));
}

import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const out=process.env.REZLEE_QA_OUTPUT;if(!out)throw Error('REZLEE_QA_OUTPUT required');fs.mkdirSync(out,{recursive:true,mode:0o700});
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,opts);
const must=r=>{if(r.error)throw Error('Fixture error '+(r.error.code||r.error.status));return r.data;};
const run=randomUUID(),report={run,startedAt:new Date().toISOString(),origin:'Mac Toronto; isolated larger-history fixture after soak stopped',checks:[],cleanup:false};let user,home;
const save=()=>fs.writeFileSync(out+'/history-report.json',JSON.stringify(report,null,2),{mode:0o600});
try{
 const email='history-qa-'+run+'@example.invalid',password=randomUUID()+randomUUID();user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
 fs.writeFileSync(out+'/history-fixture.json',JSON.stringify({run,userId:user.id}),{mode:0o600});
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const token=must(await client.auth.signInWithPassword({email,password})).session.access_token;
 home=must(await admin.from('homes').insert({user_id:user.id,nickname:'Synthetic history household'}).select('id').single()).id;
 const counts={bills:600,documents:1200,maintenance_tasks:600,shared_expense_entries:500};
 for(const [table,total]of Object.entries(counts))for(let offset=0;offset<total;offset+=50){
  const rows=Array.from({length:Math.min(50,total-offset)},(_,j)=>{
   const i=offset+j,base={home_id:home,user_id:user.id};
   if(table==='bills')return {...base,name:'Synthetic history bill '+i,amount:55+i,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'};
   if(table==='documents')return {...base,title:'Synthetic history record '+i,document_type:'receipt'};
   if(table==='maintenance_tasks')return {...base,title:'Synthetic history task '+i,status:'open',due_date:'2026-10-25'};
   return {home_id:home,created_by:user.id,kind:'expense',details:{title:'Synthetic history expense '+i,amountCents:1,paidBy:user.id,shares:[{personId:user.id,cents:1}],happenedOn:'2026-10-20',note:'Synthetic metadata only'}};
  });must(await admin.from(table).insert(rows));
 }
 report.fixtureCounts=counts;console.log('HISTORY_SEEDED',JSON.stringify(counts));
 for(let wave=0;wave<3;wave++)for(const route of ['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions']){
  const start=performance.now();const res=await fetch('https://staging.rezlee.com/api/mobile/v1/'+route,{headers:{Authorization:'Bearer '+token,'x-rezlee-qa-trace':'history_'+wave+'_'+route.split('?')[0]},signal:AbortSignal.timeout(20000)});const data=await res.json();
  const check={wave,route,status:res.status,ms:Math.round(performance.now()-start),bytes:JSON.stringify(data).length,rows:{bills:data.bills?.length,documents:data.documents?.length,tasks:data.tasks?.length,entries:data.entries?.length},summary:route==='vault'?data.summary:undefined};report.checks.push(check);save();console.log(JSON.stringify(check));
  if(!res.ok||data.needsOnboarding||data.error)throw Error('History response failed '+route);
  if(route==='vault'&&(data.documents?.length!==100||data.summary?.recordsCount!==1200))throw Error('Vault larger-history totals incorrect');
 }
}catch(e){report.failure=String(e.message);console.error(report.failure);process.exitCode=1;}
finally{
 if(user){const own=must(await admin.auth.admin.getUserById(user.id)).user;if(own.user_metadata?.qa_run!==run||own.user_metadata?.qa_marker!==true||!own.email.startsWith('history-qa-'))throw Error('Cleanup ownership guard');must(await admin.auth.admin.deleteUser(user.id));
 const left=[];for(const table of ['homes','bills','documents','maintenance_tasks','shared_expense_entries']){const q=admin.from(table).select('id',{count:'exact',head:true}).eq(table==='homes'?'id':'home_id',home);const res=await q;must(res);left.push({table,count:res.count});}report.remaining=left;report.cleanup=left.every(x=>x.count===0);if(!report.cleanup)process.exitCode=1;}
 report.finishedAt=new Date().toISOString();save();console.log('HISTORY_FINISHED',JSON.stringify({failure:report.failure,cleanup:report.cleanup,checks:report.checks.length}));
}

import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';import {createClient} from '@supabase/supabase-js';
const ref='gjwvalpxnfbvryosmcbj',db='https://'+ref+'.supabase.co',out=path.resolve('docs/checkpoints/release-config-20261021/performance-recovery/matched-diagnostic');
fs.mkdirSync(out,{recursive:false,mode:0o700});
const run=randomUUID(),fixtures=[],rows=[],targets=[{name:'candidate',url:'https://staging.rezlee.com',id:'dpl_GSkktgeKJL5MJzhws8RkMBLV1UDm'},{name:'baseline',url:'https://rezlee-performance-staging.vercel.app',id:'dpl_4McUweE9FSh9LYst5oFrqfRnZxxZ'}],routes=['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions'];
let admin,anonKey,failure,stop=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms)),stamp=()=>new Date().toISOString(),save=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n'),must=r=>{if(r.error)throw Error('Fixture operation failed '+(r.error.code||r.error.status));return r.data;},pct=(xs,p)=>xs.length?xs.slice().sort((a,b)=>a-b)[Math.min(xs.length-1,Math.ceil(xs.length*p)-1)]:null;
const status=stage=>{save('status.json',{at:stamp(),pid:process.pid,stage,fixtures:fixtures.length,requests:rows.length});console.log(JSON.stringify({at:stamp(),stage,fixtures:fixtures.length,requests:rows.length}));};
process.on('SIGTERM',()=>stop=true);process.on('SIGINT',()=>stop=true);
function api(p){const raw=execFileSync('/usr/local/bin/node',['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api',p+'?teamId=team_RWL45V0YAuHJ7DvygUtJNB8o'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});return JSON.parse(raw);}
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(20000)})}};
async function request(target,user,route,phase,kind='app'){
 const start=performance.now();let status=0,valid=false,timing=null,requestId=null,errorKind=null,headersMs=null;
 const headers={Authorization:'Bearer '+user.token,'x-rezlee-qa-trace':'diag_'+run.slice(0,8)+'_'+rows.length+'_'+Math.round(start)};
 let url=target.url+'/api/mobile/v1/'+route,method='GET';
 if(kind!=='app'){headers.apikey=anonKey;url=db+(kind==='auth'?'/auth/v1/user':kind==='context'?'/rest/v1/rpc/rezlee_authenticated_mobile_context':'/rest/v1/homes?select=id&user_id=eq.'+user.id);if(kind==='context')method='POST';}
 try {const r=await fetch(url,{headers,method,signal:AbortSignal.timeout(20000)});headersMs=Math.round(performance.now()-start);status=r.status;requestId=r.headers.get('x-vercel-id');const raw=r.headers.get('x-rezlee-perf');if(raw)timing=JSON.parse(raw);const data=await r.json();valid=status===200&&!data.error&&!data.needsOnboarding;if(kind==='app')valid=valid&&(route==='home?availability=1'?data.home?.id===user.home:route==='bills'?data.bills?.length>=12:route==='vault'?data.documents?.length>=8:route==='care'?data.tasks?.length>=6:route==='shared-expenses'?data.home?.id===user.home:data.homeId===user.home);}
 catch(e){errorKind=e.name;}
 const row={at:stamp(),phase,target:kind==='app'?target.name:'direct',userIndex:fixtures.indexOf(user),route:kind==='app'?route:kind,status,valid,ms:Math.round(performance.now()-start),headersMs,requestId,errorKind,timing};rows.push(row);return row;
}
try{
 for(const t of targets)if(api('/v4/aliases/'+new URL(t.url).host).deploymentId!==t.id)throw Error('Deployment changed before diagnostic');
 save('manifest.json',{at:stamp(),run,targets,sourceChange:false,fixtureCount:30,scope:'Matched diagnostic only; not acceptance. Same fixture set and aggregate 30 requests/second across both deployments.'});
 status('preparing');
 const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const kr=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});if(!kr.ok)throw Error('Management access unavailable');const keys=await kr.json(),secret=keys.find(k=>k.name==='service_role')?.api_key;anonKey=keys.find(k=>k.name==='anon')?.api_key;if(!secret||!anonKey)throw Error('Staging keys unavailable');admin=createClient(db,secret,options);
 for(let i=0;i<30;i++){if(stop)throw Error('Interrupted');await sleep(1200);const email='load-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID(),u=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user,f={id:u.id};fixtures.push(f);save('fixture-journal.json',{projectRef:ref,run,userIds:fixtures.map(f=>f.id)});const client=createClient(db,anonKey,options);f.token=must(await client.auth.signInWithPassword({email,password})).session.access_token;f.home=must(await admin.from('homes').insert({user_id:f.id,nickname:'Synthetic diagnostic household'}).select('id').single()).id;
 must(await admin.from('bills').insert(Array.from({length:12},(_,j)=>({home_id:f.home,user_id:f.id,name:'Synthetic bill '+j,amount:55+j,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'}))));
 must(await admin.from('documents').insert(Array.from({length:8},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic record '+j,document_type:'receipt'}))));
 must(await admin.from('maintenance_tasks').insert(Array.from({length:6},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic task '+j,status:'open',due_date:'2026-10-25'}))));
 }
 status('sequential-comparison');
 for(let i=0;i<6;i++)for(const t of (i%2?targets.slice().reverse():targets)){await request(t,fixtures[i],routes[i],'initial');if(stop)throw Error('Interrupted');}
 for(const kind of ['auth','context','database'])await request(targets[0],fixtures[0],'','direct-before',kind);
 for(let wave=0;wave<2;wave++){
  status('matched-wave-'+wave);const pending=[],begin=performance.now();
  for(let i=0;i<300;i++){if(stop)throw Error('Interrupted');await sleep(Math.max(0,begin+i*1000/15-performance.now()));const user=fixtures[i%30],route=routes[(i%30+Math.floor(i/30))%6];for(const t of (wave?targets.slice().reverse():targets))pending.push(request(t,user,route,'wave-'+wave));}
  await Promise.all(pending);save('timing-rows.json',rows);
  for(const kind of ['auth','context','database'])await request(targets[0],fixtures[0],'','direct-after-'+wave,kind);
  if(rows.filter(r=>!r.valid).length>5){failure='Diagnostic error limit reached';break;}await sleep(2000);
 }
}catch(e){failure=String(e.message||e).slice(0,300);}
finally{
 status('cleaning');const cleanup={at:stamp(),created:fixtures.length,deleted:0,verifiedAbsent:0,errors:[],sessionFilesWritten:0};
 if(admin)for(const f of fixtures)try{const u=must(await admin.auth.admin.getUserById(f.id)).user;if(u.user_metadata?.qa_run!==run)throw Error('Ownership mismatch');must(await admin.auth.admin.deleteUser(f.id));cleanup.deleted++;const after=await admin.auth.admin.getUserById(f.id);if(after.error?.status!==404)throw Error('Fixture remains');cleanup.verifiedAbsent++;}catch(e){cleanup.errors.push({id:f.id,error:String(e.message).slice(0,100)});}
 save('cleanup.json',cleanup);save('timing-rows.json',rows);
 const summary={at:stamp(),acceptance:false,failure,cleanup,groups:[...new Set(rows.map(r=>r.phase+'|'+r.target))].map(g=>{const x=rows.filter(r=>r.phase+'|'+r.target===g);return{group:g,count:x.length,errors:x.filter(r=>!r.valid).length,p50Ms:pct(x.map(r=>r.ms),.5),p95Ms:pct(x.map(r=>r.ms),.95),p99Ms:pct(x.map(r=>r.ms),.99),traced:x.filter(r=>r.timing).length,appP95Ms:pct(x.filter(r=>r.timing).map(r=>r.timing.appMs),.95)};})};save('summary.json',summary);status('finished');console.log(JSON.stringify(summary));if(failure||cleanup.errors.length)process.exitCode=1;
}

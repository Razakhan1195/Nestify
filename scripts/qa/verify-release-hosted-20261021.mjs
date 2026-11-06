import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
const ref='gjwvalpxnfbvryosmcbj',dbOrigin='https://'+ref+'.supabase.co';
const root=path.resolve(process.env.REZLEE_RELEASE_HOSTED_OUTPUT||'docs/checkpoints/release-config-20261021/hosted-acceptance');
assert.ok(root.startsWith(path.resolve('docs/checkpoints/release-config-20261021')+path.sep));
fs.mkdirSync(root,{recursive:true});
const deployment=JSON.parse(fs.readFileSync(path.resolve('docs/checkpoints/release-config-20261021/release-preparation.json')));
assert.equal(deployment.projectId,'prj_N0EruXgUNTjI7L8b564XexIPwHZU');
assert.equal(deployment.deploymentId,process.env.REZLEE_RELEASE_EXPECTED_DEPLOYMENT||'dpl_6nsQKQ2yDjKxN4jf7wVKYim5njif');
const origin='https://staging.rezlee.com',run=randomUUID(),users=[],groups=[],checks=[],requests=[];
let admin,job,failure=null;
const stamp=()=>new Date().toISOString();
const save=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2));
const status=stage=>{save('hosted-status.json',{at:stamp(),pid:process.pid,stage,checks:checks.length,requests:requests.length});console.log(JSON.stringify({at:stamp(),stage,checks:checks.length}));};
const must=r=>{if(r.error)throw Error('Supabase request failed '+(r.error.code||r.error.status||'unknown'));return r.data;};
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}};
const step=async(name,fn)=>{await fn();checks.push({name,passed:true,at:stamp()});status(name);};
async function api(user,body=null,query='',expected=200){
 const start=performance.now();
 const response=await fetch(origin+'/api/mobile/v1/expense-groups'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({invalidJson:true}));
 requests.push({at:stamp(),method:body?'POST':'GET',http:response.status,ms:Math.round(performance.now()-start),expected});
 assert.equal(response.status,expected,'HTTP response for '+(body?.action||'read')+' '+(data.error||''));
 assert.match(response.headers.get('cache-control')||'',/no-store/);
 return data;
}
const ledger=(u,g,command,key=randomUUID(),expected=200)=>api(u,{action:'ledger',groupId:g,requestId:key,command},'',expected);
const manage=(u,g,command,key=randomUUID(),expected=200)=>api(u,{action:'manage',groupId:g,requestId:key,command},'',expected);
const read=(u,g,id)=>api(u,null,'?groupId='+g+(id?'&id='+id:''));
try{
 assert.ok(!fs.existsSync(path.join(root,'hosted-summary.json')),'Use a fresh run after reviewing earlier results');
 status('preparing-synthetic-accounts');
 const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const res=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});
 assert.ok(res.ok,'Staging management access');
 const keys=await res.json(),secret=keys.find(k=>k.name==='service_role')?.api_key,publicKey=keys.find(k=>k.name==='anon')?.api_key;
 assert.ok(secret&&publicKey);admin=createClient(dbOrigin,secret,opts);
 for(let i=0;i<3;i++){
  const email='expense-qa-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_run:run,qa_marker:true}})).user;
  users.push({id:user.id,email,client:null,token:null,deleted:false});
  save('hosted-fixture-journal.json',{projectRef:ref,run,userIds:users.map(u=>u.id),groupIds:groups});
  const client=createClient(dbOrigin,publicKey,opts),session=must(await client.auth.signInWithPassword({email,password})).session;
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
  assert.equal(claims.iss,dbOrigin+'/auth/v1');assert.equal(claims.user_metadata.qa_run,run);
  Object.assign(users.at(-1),{client,token:session.access_token});
  must(await admin.from('rezlee_member_accounts').insert({user_id:user.id}));
 }
 const [a,b,c]=users,day=new Date().toISOString().slice(0,10);
 const home=must(await admin.from('homes').insert({user_id:a.id,nickname:'QA private home'}).select('id').single()).id;
 must(await admin.from('bills').insert({user_id:a.id,home_id:home,name:'QA private bill',amount:55,currency:'CAD'}));
 must(await admin.from('documents').insert({user_id:a.id,home_id:home,title:'QA private original',document_type:'receipt'}));
 must(await admin.from('maintenance_tasks').insert({user_id:a.id,home_id:home,title:'QA private task',status:'open'}));

 const feature=async(user,route,body,expected=200)=>{
  const began=performance.now(),res=await fetch(origin+'/api/mobile/v1/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.token,'x-rezlee-qa-trace':'release_'+run.slice(0,8),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const raw=res.headers.get('x-rezlee-perf'),timing=raw?JSON.parse(raw):null;
  requests.push({timing,route,method:body?'POST':'GET',http:res.status,expected,ms:Math.round(performance.now()-began)});assert.equal(res.status,expected,route+' status');return res.json();
 };
 await step('assembled candidate Home Bills Vault Care and decisions reads',async()=>{
  for(const route of ['home?availability=1','bills','vault','care','shared-expenses','purchase-decisions']){const value=await feature(a,route);assert.ok(!value.error&&!value.needsOnboarding,route+' response');if(process.env.REZLEE_REQUIRE_COMBINED_READS==='true'){const deps=requests.at(-1).timing?.dependencies;assert.equal(deps?.length,1,route+' must use one validated combined read');assert.equal(deps[0].path,route.startsWith('home')?'/rest/v1/rpc/rezlee_mobile_read_bootstrap':'/rest/v1/rpc/rezlee_mobile_screen_bootstrap');}}
 });
 await step('membership configuration and authoritative empty-account restore',async()=>{
  const m=await feature(a,'membership');assert.equal(m.enabled,true);assert.equal(m.restoreAvailable,true);assert.equal(m.purchasesAvailable,true);assert.ok(m.storeProductIds.length>=2);assert.equal(m.membership.plan,'free');
  const restored=await feature(a,'membership',{action:'restore'});assert.equal(restored.membership.plan,'free');
 });
 await step('referral staging link one-month claim replay and sender isolation',async()=>{
  const invite=await feature(a,'rewards');assert.match(invite.code,/^[A-F0-9]{12}$/);assert.equal(new URL(invite.url).origin,origin);
  await feature(a,'rewards',{code:invite.code},400);
  const claimed=await feature(b,'rewards',{code:invite.code});assert.equal(claimed.status,'claimed');const expiry=Date.parse(claimed.expiresAt);assert.ok(expiry-Date.now()>27*86400000&&expiry-Date.now()<32*86400000);
  const replay=await feature(b,'rewards',{code:invite.code});assert.equal(replay.expiresAt,claimed.expiresAt);
  assert.equal((await feature(b,'membership')).membership.plan,'pro');assert.equal((await feature(a,'membership')).membership.plan,'free');
 });
 let g,self,member,entry,invitation;
 await step('concurrent group creation is idempotent',async()=>{
  const payload={action:'create_group',requestId:randomUUID(),name:'QA Roommates'};
  const results=await Promise.all(Array.from({length:5},()=>api(a,payload)));
  g=results[0].groupId;groups.push(g);assert.ok(results.every(v=>v.groupId===g));
  assert.equal((await api(a)).groups.length,1);
  self=(await read(a,g)).people.find(p=>p.self).id;
 });
 await step('verified invitation preview and acceptance; foreign account denied',async()=>{
  member=(await ledger(a,g,{operation:'add_person',name:'Alex'})).id;
  invitation=await manage(a,g,{operation:'invite',personId:member,email:b.email});
  await api(c,null,'?inviteCode='+invitation.inviteCode,403);
  await api(b,null,'?groupId='+g,403);
  assert.equal((await api(b,null,'?inviteCode='+invitation.inviteCode)).name,'QA Roommates');
  const payload={action:'accept',inviteCode:invitation.inviteCode};
  const results=await Promise.all([api(b,payload),api(b,payload)]);
  assert.ok(results.every(v=>v.groupId===g));
 });
 await step('expense-only membership keeps Home Bills Vault Care and raw invitations private',async()=>{
  for(const table of ['homes','bills','documents','maintenance_tasks','household_members','expense_group_people'])
   assert.deepEqual(must(await b.client.from(table).select('*')),[],table+' access');
  const res=await fetch(origin+'/api/mobile/v1/onboarding',{headers:{Authorization:'Bearer '+b.token},signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,200);const onboarding=await res.json();assert.equal(onboarding.expenseGroupsAvailable,true);assert.ok(!onboarding.home);
  assert.equal((await api(b)).hasHome,false);
  must(await b.client.from('expense_groups').update({name:'Unauthorized'}).eq('id',g));
  assert.equal((await read(a,g)).home.name,'QA Roommates');
 });
 const details=()=>({title:'Internet',amountCents:10001,paidBy:self,happenedOn:day,note:'Synthetic only',shares:[{personId:self,cents:5001},{personId:member,cents:5000}]});
 await step('concurrent expense replay creates one canonical record with exact cents',async()=>{
  const cmd={operation:'create',kind:'expense',details:{...details(),privateOriginal:'must-not-copy'}},key=randomUUID();
  const results=await Promise.all(Array.from({length:5},()=>ledger(a,g,cmd,key)));
  entry=results[0].id;assert.ok(results.every(v=>v.id===entry));
  const p=await read(b,g);assert.equal(p.entries.length,1);assert.equal('privateOriginal' in p.entries[0].details,false);
  assert.deepEqual(p.balances,[{from:member,to:self,cents:5000}]);
  await ledger(b,g,{operation:'edit',id:entry,version:1,details:details()},randomUUID(),403);
 });
 await step('partial and concurrent full repayment cannot overpay or duplicate',async()=>{
  const part={operation:'create',kind:'repayment',expectedBalanceCents:5000,details:{from:member,to:self,amountCents:1500,happenedOn:day,note:''}},key=randomUUID();
  const replay=await Promise.all([ledger(b,g,part,key),ledger(b,g,part,key)]);assert.equal(replay[0].id,replay[1].id);
  assert.deepEqual((await read(b,g)).balances,[{from:member,to:self,cents:3500}]);
  const final={...part,expectedBalanceCents:3500,details:{...part.details,amountCents:3500}};
  // Two independently submitted payments for the same balance: one must conflict.
  const send=async()=>{const res=await fetch(origin+'/api/mobile/v1/expense-groups',{method:'POST',headers:{Authorization:'Bearer '+b.token,'Content-Type':'application/json'},body:JSON.stringify({action:'ledger',groupId:g,requestId:randomUUID(),command:final}),signal:AbortSignal.timeout(15000)});requests.push({at:stamp(),method:'POST',http:res.status,expected:'one 200, one 409'});return res.status;};
  assert.deepEqual((await Promise.all([send(),send()])).sort(),[200,409]);
  assert.deepEqual((await read(a,g)).balances,[]);
 });
 await step('corrections reject stale versions and preserve financial history',async()=>{
  await ledger(a,g,{operation:'edit',id:entry,version:1,details:{...details(),amountCents:8000,shares:[{personId:self,cents:4000},{personId:member,cents:4000}]}});
  await ledger(a,g,{operation:'edit',id:entry,version:1,details:details()},randomUUID(),409);
  assert.equal((await read(a,g,entry)).changes.length,2);
  assert.deepEqual((await read(a,g)).balances,[{from:self,to:member,cents:1000}]);
  await ledger(a,g,{operation:'create',kind:'repayment',expectedBalanceCents:1000,details:{from:self,to:member,amountCents:1000,happenedOn:day,note:''}});
 });
 await step('member departure preserves debt and revokes reads and writes',async()=>{
  await ledger(a,g,{operation:'create',kind:'expense',details:{...details(),amountCents:100,shares:[{personId:member,cents:100}]}});
  await manage(a,g,{operation:'archive'},randomUUID(),409);
  await manage(b,g,{operation:'leave'});
  await api(b,null,'?groupId='+g,403);
  await ledger(b,g,{operation:'create',kind:'expense',details:details()},randomUUID(),403);
  assert.deepEqual((await read(a,g)).balances,[{from:member,to:self,cents:100}]);
  await ledger(a,g,{operation:'create',kind:'expense',details:details()},randomUUID(),400);
  await ledger(a,g,{operation:'create',kind:'repayment',details:{from:member,to:self,amountCents:100,happenedOn:day,note:''}});
 });
 await step('rejoin preserves identity; archived history remains readable and immutable',async()=>{
  await manage(a,g,{operation:'invite',personId:member,email:c.email},randomUUID(),400);
  invitation=await manage(a,g,{operation:'invite',personId:member,email:b.email});
  await api(b,{action:'accept',inviteCode:invitation.inviteCode});
  assert.equal((await read(b,g)).people.find(p=>p.self).id,member);
  await manage(a,g,{operation:'archive'});
  assert.equal((await read(b,g)).archived,true);
  await ledger(a,g,{operation:'create',kind:'expense',details:details()},randomUUID(),409);
  await manage(a,g,{operation:'restore'});
 });
 await step('account deletion freezes access and leaves surviving participants in control',async()=>{
  job=randomUUID();
  must(await admin.rpc('begin_rezlee_account_deletion',{p_user:a.id,p_id:job,p_receipt_hash:createHash('sha256').update(randomUUID()).digest('hex')}));
  await api(a,null,'?groupId='+g,423);
  assert.equal(must(await a.client.rpc('rezlee_has_expense_groups')),false);
  assert.deepEqual(must(await a.client.rpc('rezlee_list_expense_groups')),[]);
  must(await admin.from('account_deletion_jobs').update({phase:'account'}).eq('id',job));
  must(await admin.rpc('clean_rezlee_account_links',{p_user:a.id}));
  must(await admin.rpc('clean_rezlee_account_links',{p_user:a.id}));
  must(await admin.auth.admin.deleteUser(a.id));a.deleted=true;
  must(await admin.from('account_deletion_jobs').update({status:'completed',user_id:null,completed_at:stamp()}).eq('id',job));
  const p=await read(b,g);assert.equal(p.role,'owner');assert.ok(p.entries.length>0);assert.equal(p.people.find(v=>v.id===self).state,'former');
  await manage(b,g,{operation:'invite',personId:self,email:c.email},randomUUID(),400);
  await manage(b,g,{operation:'rename',name:'QA retained history'});
 });
 await step('combined authentication rejects forged banned revoked and deleted sessions',async()=>{
  const parts=c.token.split('.');parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
  await feature({...c,token:parts.join('.')},'home',null,401);
  await feature({...c,token:''},'home',null,401);
  must(await admin.auth.admin.updateUserById(c.id,{ban_duration:'1h'}));
  await feature(c,'home',null,401);
  must(await admin.auth.admin.updateUserById(c.id,{ban_duration:'none'}));
  await feature(c,'home');
  must(await admin.auth.admin.signOut(c.token,'global'));
  await feature(c,'home',null,401);
  await feature(a,'home',null,401);
 });
 status('verification-complete');
}catch(e){failure=String(e.message||'Hosted check failed').slice(0,1000);process.exitCode=1;console.log(JSON.stringify({stage:'failed',failure}));}
finally{
 const cleanup={at:stamp(),created:users.length,deleted:0,verifiedAbsent:0,groupsDeleted:0,sessionFilesWritten:0,errors:[]};
 if(admin){
  try{
   for(const u of users){if(!u.deleted){const check=must(await admin.auth.admin.getUserById(u.id));assert.equal(check.user.user_metadata?.qa_run,run);}}
   const owned=must(await admin.from('expense_groups').select('id').in('owner_id',users.map(u=>u.id)));
   const ids=[...new Set([...groups,...owned.map(g=>g.id)])];
   if(ids.length){must(await admin.from('expense_groups').delete().in('id',ids));assert.equal(must(await admin.from('expense_groups').select('id').in('id',ids)).length,0);cleanup.groupsDeleted=ids.length;}
   for(const u of users){if(!u.deleted)must(await admin.auth.admin.deleteUser(u.id));cleanup.deleted++;const v=await admin.auth.admin.getUserById(u.id);if(v.error?.status===404)cleanup.verifiedAbsent++;}
   if(job)must(await admin.from('account_deletion_jobs').delete().eq('id',job));
  }catch(e){cleanup.errors.push(String(e.message).slice(0,300));process.exitCode=1;}
 }
 save('hosted-cleanup.json',cleanup);
 save('hosted-summary.json',{at:stamp(),deploymentId:deployment.deploymentId,origin,projectRef:ref,failure,checks,requests,cleanup,scope:'Hosted API and database checks, synthetic accounts only. Not native device or provider authentication acceptance.'});
 status(failure?'failed-cleaned':'finished');
}

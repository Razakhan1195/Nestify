import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const out='docs/checkpoints/ux-polish-20261026',run=randomUUID(),ref='gjwvalpxnfbvryosmcbj',db='https://'+ref+'.supabase.co',base='https://staging.rezlee.com',users=[],checks=[],cleanup=[];
const save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2));
const must=r=>{if(r.error)throw Error('Database operation failed '+(r.error.code||'unknown'));return r.data;};
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
let admin,failure=null;
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=','base64');
function form(requestId,patch={},fileBytes=bytes,type='image/png'){
 const f=new FormData();for(const [k,v] of Object.entries({requestId,title:'Synthetic QA original',category:'Manual',issued_on:'',expires_on:'',notes:'Synthetic launch verification',...patch}))f.set(k,v);
 if(fileBytes!==null)f.set('file',new Blob([fileBytes],{type}),'synthetic.png');return f;
}
async function api(u,query='',method='GET',body){
 const r=await fetch(base+'/api/mobile/v1/vault/records'+query,{method,headers:u?{Authorization:'Bearer '+u.token}:{},body,signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json()};
}
try{
 const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const res=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});
 assert.ok(res.ok,'Staging management access');const keys=await res.json(),secret=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key;assert.ok(secret&&anon);
 admin=createClient(db,secret,opts);
 for(let i=0;i<1;i++){
  const email='vault-qa-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const u={id:user.id};users.push(u);save('vault-latency-fixture-journal.json',{run,projectRef:ref,userIds:users.map(x=>x.id)});
  must(await admin.from('rezlee_member_accounts').insert({user_id:u.id}));
  u.client=createClient(db,anon,opts);u.token=must(await u.client.auth.signInWithPassword({email,password})).session.access_token;
  u.home=must(await u.client.from('homes').insert({user_id:u.id,nickname:'Disposable Vault QA'}).select('id').single()).id;
 }
 const owner=users[0];
 const docs=Array.from({length:100},(_,i)=>({id:randomUUID(),user_id:owner.id,home_id:owner.home,title:'Synthetic receipt '+i,document_type:'receipt',source:'manual'}));
 must(await admin.from('documents').insert(docs));
 must(await admin.from('email_capture_jobs').insert(docs.map((d,i)=>({id:randomUUID(),user_id:owner.id,home_id:owner.home,source_hash:createHash('sha256').update(run+':'+i).digest('hex'),status:'saved',document_id:d.id,source_type:'gmail'}))));
 const timings=[];
 for(let i=0;i<31;i++){
  const start=performance.now();const response=await fetch(base+'/api/mobile/v1/vault',{headers:{Authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(20000)});const body=await response.json();const ms=performance.now()-start;
  assert.equal(response.status,200);assert.equal(body.documents.length,100);assert.ok(body.documents.every(x=>x.sourceLabel==='Gmail import'&&x.category==='Receipt'));timings.push(ms);
 }
 const warm=timings.slice(1).sort((a,b)=>a-b);const result={at:new Date().toISOString(),sampleCount:31,warmSampleCount:30,documentsPerResponse:100,firstMs:timings[0],warmP50Ms:warm[Math.ceil(.5*warm.length)-1],warmP95Ms:warm[Math.ceil(.95*warm.length)-1],warmMaxMs:warm.at(-1),errors:0,scope:'Sequential populated-route diagnostic from Mac; not a concurrent capacity or full load-test claim'};save('vault-latency-measurements.json',result);console.log(JSON.stringify(result));check('31 populated Vault reads returned all 100 correctly labelled records',true);
}catch(e){failure=e instanceof assert.AssertionError?e.message:(e.name+': '+(e.message?.startsWith('Database')?e.message:'hosted check failed'));console.log('FAIL',failure);}
finally{
 for(const u of users){
  try{
   const owned=must(await admin.auth.admin.getUserById(u.id)).user;assert.equal(owned.user_metadata.qa_run,run);
   if(u.home){const root=u.id+'/'+u.home,bucket=admin.storage.from('rezlee-documents');
    async function listFiles(prefix,depth=0){assert.ok(prefix.startsWith(root)&&depth<5);const entries=must(await bucket.list(prefix,{limit:1000}));assert.ok(entries.length<1000);let found=[];for(const e of entries){assert.ok(!e.name.includes('/')&&!e.name.includes('..'));const path=prefix+'/'+e.name;if(e.id)found.push(path);else found.push(...await listFiles(path,depth+1));}return found;}
    const paths=await listFiles(root);if(paths.length)must(await bucket.remove(paths));
    assert.equal((await listFiles(root)).length,0);
   }
   must(await admin.auth.admin.deleteUser(u.id));
   const remaining=await admin.auth.admin.getUserById(u.id);assert.ok(!remaining.data.user);
   cleanup.push({userId:u.id,accountAbsent:true,ownedFilesAbsent:true});
  }catch(e){cleanup.push({userId:u.id,failed:true});failure=failure||'Synthetic fixture cleanup incomplete';}
 }
 if(admin&&users.length){const left=await admin.from('documents').select('id').in('user_id',users.map(u=>u.id));if(left.error||left.data.length)failure=failure||'Document fixture residue';}
 save('vault-latency-results.json',{at:new Date().toISOString(),run,base,checks,failure,cleanup,paidProviderCalls:0,aiCalls:0,emailsSent:0,nativeUIObserved:false});
 console.log(JSON.stringify({checks:checks.length,failure,cleanupAccounts:cleanup.length,cleanupFailures:cleanup.filter(x=>x.failed).length}));
}
process.exitCode=failure?1:0;

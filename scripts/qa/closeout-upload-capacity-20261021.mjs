import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const out='docs/checkpoints/launch-closeout-20261021',run=randomUUID(),ref='gjwvalpxnfbvryosmcbj',db='https://'+ref+'.supabase.co',base='https://staging.rezlee.com',users=[],checks=[],cleanup=[];
const save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2));
const must=r=>{if(r.error)throw Error('Database operation failed '+(r.error.code||'unknown'));return r.data;};
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
let admin,failure=null;
const bytes=fs.readFileSync(out+'/synthetic-upload.png');const timings=[];
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
 for(let i=0;i<6;i++){
  const email='vault-qa-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const u={id:user.id};users.push(u);save('upload-capacity-fixture-journal.json',{run,projectRef:ref,userIds:users.map(x=>x.id)});
  must(await admin.from('rezlee_member_accounts').insert({user_id:u.id}));
  u.client=createClient(db,anon,opts);u.token=must(await u.client.auth.signInWithPassword({email,password})).session.access_token;
  u.home=must(await u.client.from('homes').insert({user_id:u.id,nickname:'Disposable Vault QA'}).select('id').single()).id;
 }
 const settled=await Promise.allSettled(users.map(async(u)=>{
 const key=randomUUID(),start=Date.now();const saved=await api(u,'','POST',form(key));
 timings.push({operation:'upload',ms:Date.now()-start,status:saved.status,bytes:bytes.length});
 check('upload commits for synthetic account',saved.status===200&&saved.data.ok);
 const id=saved.data.id,startRead=Date.now(),file=await api(u,'?id='+id+'&file=1');
 assert.equal(file.status,200);assert.equal(new URL(file.data.url).origin,db);
 const response=await fetch(file.data.url,{signal:AbortSignal.timeout(20000)}),got=Buffer.from(await response.arrayBuffer());
 timings.push({operation:'download',ms:Date.now()-startRead,status:response.status,bytes:got.length});
 check('exact original bytes round trip',response.ok&&got.equals(bytes));
 const replay=await api(u,'','POST',form(key));check('retry preserves one record',replay.status===200&&replay.data.id===id);
 }));
 save('upload-capacity-measurements.json',{at:new Date().toISOString(),concurrentUsers:6,fileBytes:bytes.length,timings,failures:settled.filter(x=>x.status==='rejected').length,scope:'Six simultaneous manual Vault uploads, downloads and retries. Not AI scan/provider capacity or300 simultaneous uploads.'});
 assert.ok(settled.every(x=>x.status==='fulfilled'),'Concurrent upload journey failed');
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
 save('upload-capacity-results.json',{at:new Date().toISOString(),run,base,checks,failure,cleanup,paidProviderCalls:0,aiCalls:0,emailsSent:0,nativeUIObserved:false});
 console.log(JSON.stringify({checks:checks.length,failure,cleanupAccounts:cleanup.length,cleanupFailures:cleanup.filter(x=>x.failed).length}));
}
process.exitCode=failure?1:0;

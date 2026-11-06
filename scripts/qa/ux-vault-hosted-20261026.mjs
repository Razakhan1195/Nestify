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
 for(let i=0;i<2;i++){
  const email='vault-qa-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const u={id:user.id};users.push(u);save('vault-fixture-journal.json',{run,projectRef:ref,userIds:users.map(x=>x.id)});
  must(await admin.from('rezlee_member_accounts').insert({user_id:u.id}));
  u.client=createClient(db,anon,opts);u.token=must(await u.client.auth.signInWithPassword({email,password})).session.access_token;
  u.home=must(await u.client.from('homes').insert({user_id:u.id,nickname:'Disposable Vault QA'}).select('id').single()).id;
 }
 const [owner,other]=users,key=randomUUID();
 check('anonymous original lookup denied',(await api(null,'?id='+randomUUID())).status===401);
 const saved=await api(owner,'','POST',form(key));check('actual PNG upload commits',saved.status===200&&saved.data.ok);
 const id=saved.data.id;
 const replay=await api(owner,'','POST',form(key));check('same upload retry returns same record',replay.status===200&&replay.data.id===id);
 check('retry creates exactly one record',must(await owner.client.from('documents').select('id').eq('home_id',owner.home)).length===1);
 const recovered=await api(owner,'?requestId='+key);check('lost response recovery identifies saved record',recovered.status===200&&recovered.data.documentId===id);
 const record=await api(owner,'?id='+id);check('saved record reports original without storage path',record.status===200&&record.data.record.hasFile&&!('storage_path' in record.data.record));
 const file=await api(owner,'?id='+id+'&file=1');check('owner can request original',file.status===200&&typeof file.data.url==='string');
 assert.equal(new URL(file.data.url).origin,db,'Signed original stays on staging');
 const original=await fetch(file.data.url,{signal:AbortSignal.timeout(15000)});const downloaded=Buffer.from(await original.arrayBuffer());
 check('downloaded original matches exact uploaded bytes',original.ok&&createHash('sha256').update(downloaded).digest('hex')===createHash('sha256').update(bytes).digest('hex'));
 check('other account cannot read record',(await api(other,'?id='+id)).status===404);
 check('other account cannot obtain original',(await api(other,'?id='+id+'&file=1')).status===404);
 check('other account cannot recover save',(await api(other,'?requestId='+key)).status===404);
 check('changed retry is rejected',(await api(owner,'','POST',form(key,{title:'Changed retry'}))).status===409);
 check('wrong home save is rejected',(await api(owner,'','POST',form(randomUUID(),{expectedHomeId:other.home}))).status===409);
 check('mismatched file format is rejected',(await api(owner,'','POST',form(randomUUID(),{},Buffer.from('not a png')))).status===400);
 check('unsupported file type is rejected',(await api(owner,'','POST',form(randomUUID(),{},Buffer.from('plain text'),'text/plain'))).status===400);
 check('empty original is rejected',(await api(owner,'','POST',form(randomUUID(),{},Buffer.alloc(0)))).status===400);
 const tooLarge=Buffer.alloc(4*1024*1024+1);bytes.copy(tooLarge);
 check('file above mobile limit gets recoverable 413',(await api(owner,'','POST',form(randomUUID(),{},tooLarge))).status===413);
 check('invalid date is rejected',(await api(owner,'','POST',form(randomUUID(),{issued_on:'2026-02-30'},null))).status===400);
 const manual=await api(owner,'','POST',form(randomUUID(),{title:'Manual record without file'},null));check('manual record works without original',manual.status===200&&manual.data.ok);
 check('manual record clearly reports no original',(await api(owner,'?id='+manual.data.id+'&file=1')).status===404);
 const foreignDelete=await api(other,'?id='+id,'DELETE');check('foreign deletion is non-disclosing no-op',foreignDelete.status===200&&foreignDelete.data.ok);

 const list=async(u)=>{const res=await fetch(base+'/api/mobile/v1/vault',{headers:{Authorization:'Bearer '+u.token},signal:AbortSignal.timeout(20000)});assert.equal(res.status,200);return res.json();};
 must(await admin.from('documents').update({title:'Synthetic appliance receipt',document_type:'receipt',source:'manual'}).eq('id',id).eq('user_id',owner.id));
 let listed=await list(owner);let row=listed.documents.find(x=>x.id===id);
 check('manual source does not override receipt category',row?.category==='Receipt');
 check('ordinary uploaded record has no invented email provenance',row?.sourceLabel===null);
 must(await admin.from('email_capture_jobs').insert({id:randomUUID(),user_id:owner.id,home_id:owner.home,source_hash:createHash('sha256').update(run).digest('hex'),status:'saved',document_id:id,source_type:'gmail'}));
 listed=await list(owner);row=listed.documents.find(x=>x.id===id);
 check('saved Gmail provenance is shown from trusted receipt',row?.sourceLabel==='Gmail import');
 check('other account cannot list owner Gmail record',!(await list(other)).documents.some(x=>x.id===id));
 check('foreign deletion leaves owner record intact',(await api(owner,'?id='+id)).status===200);
 const retainedOriginal=await api(owner,'?id='+id+'&file=1');assert.equal(new URL(retainedOriginal.data.url).origin,db);
 const retained=await fetch(retainedOriginal.data.url,{signal:AbortSignal.timeout(15000)});
 check('foreign deletion leaves original bytes intact',retained.ok&&Buffer.from(await retained.arrayBuffer()).equals(bytes));
 check('owner deletion succeeds',(await api(owner,'?id='+id,'DELETE')).status===200);
 check('deleted record cannot be reopened',(await api(owner,'?id='+id)).status===404);
 const afterDelete=await api(owner,'','POST',form(key));check('retry cannot resurrect deleted original',afterDelete.status===410);
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
 save('vault-hosted-results.json',{at:new Date().toISOString(),run,base,checks,failure,cleanup,paidProviderCalls:0,aiCalls:0,emailsSent:0,nativeUIObserved:false});
 console.log(JSON.stringify({checks:checks.length,failure,cleanupAccounts:cleanup.length,cleanupFailures:cleanup.filter(x=>x.failed).length}));
}
process.exitCode=failure?1:0;

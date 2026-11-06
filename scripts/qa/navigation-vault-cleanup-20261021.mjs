import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const out='docs/checkpoints/navigation-audit-20261021',ref='gjwvalpxnfbvryosmcbj';
const access=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const res=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});assert.ok(res.ok);
const keys=await res.json(),secret=keys.find(k=>k.name==='service_role')?.api_key;assert.ok(secret);
const admin=createClient('https://'+ref+'.supabase.co',secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});
const bucket=admin.storage.from('rezlee-documents'),results=[];
const must=r=>{assert.ok(!r.error,'Storage operation failed');return r.data;};
async function paths(prefix,root,depth=0){
 assert.ok(prefix.startsWith(root)&&depth<5);const list=must(await bucket.list(prefix,{limit:1000}));assert.ok(list.length<1000);
 let found=[];for(const f of list){assert.ok(!f.name.includes('/')&&!f.name.includes('..'));const p=prefix+'/'+f.name;if(f.id)found.push(p);else found.push(...await paths(p,root,depth+1));}return found;
}
for(const name of ['vault-fixture-journal-initial.json','vault-fixture-journal.json']){
 const j=JSON.parse(fs.readFileSync(out+'/'+name));assert.equal(j.projectRef,ref);
 for(const id of j.userIds){
  assert.match(id,/^[a-f0-9-]{36}$/);const account=await admin.auth.admin.getUserById(id);
  if(account.data.user)assert.equal(account.data.user.user_metadata.qa_run,j.run);
  const before=await paths(id,id);if(before.length)must(await bucket.remove(before));
  assert.equal((await paths(id,id)).length,0);
  results.push({userId:id,nestedFilesRemoved:before.length,remainingFiles:0,accountAbsent:!account.data.user});
 }
}
fs.writeFileSync(out+'/vault-storage-cleanup-verified.json',JSON.stringify({at:new Date().toISOString(),projectRef:ref,results},null,2));
console.log(JSON.stringify({accountsChecked:results.length,nestedFilesRemoved:results.reduce((a,x)=>a+x.nestedFilesRemoved,0),remainingFiles:0,accountsAbsent:results.every(x=>x.accountAbsent)}));

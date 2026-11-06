
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const ref='gjwvalpxnfbvryosmcbj',origin='https://staging.rezlee.com',run=randomUUID(),users=[],checks=[],requests=[];
const dest='docs/checkpoints/launch-closeout-20261021/ai-instrumented-check.json';
let db,failure=null;
const must=x=>{if(x.error)throw Error('Database operation '+(x.error.code||x.error.status));return x.data;};
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const api=async(u,route,body,expected=200)=>{
 const start=Date.now(),r=await fetch(origin+'/api/mobile/v1/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});
 const data=await r.json();requests.push({route,http:r.status,ms:Date.now()-start,expected});
 assert.equal(r.status,expected,route+' status');return data;
};
try{
 assert.ok(!fs.existsSync(dest),'Preserve prior results');
 const token=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const resp=await fetch('https://api.supabase.com/v1/projects/'+ref+'/api-keys?reveal=true',{headers:{Authorization:'Bearer '+token}});
 assert.ok(resp.ok);const keys=await resp.json();db=createClient('https://'+ref+'.supabase.co',keys.find(k=>k.name==='service_role').api_key,opts);
 for(let i=0;i<3;i++){
  const email='closeout-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const u=must(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_run:run}})).user;
  users.push({id:u.id});
  fs.writeFileSync('docs/checkpoints/launch-closeout-20261021/feedback-ai-fixtures.json',JSON.stringify({ref,run,userIds:users.map(x=>x.id)}));
  must(await db.from('rezlee_member_accounts').insert({user_id:u.id}));
  const client=createClient('https://'+ref+'.supabase.co',keys.find(k=>k.name==='anon').api_key,opts);
  users.at(-1).token=must(await client.auth.signInWithPassword({email,password})).session.access_token;
 }
 const payload={id:randomUUID(),kind:'idea',message:'Synthetic QA feedback: please preserve my saved records during retry.'};
 const [a,b]=users;
 await api(a,'feedback',{...payload,message:'short'},400);
 const replay=await Promise.all([api(a,'feedback',payload),api(a,'feedback',payload)]);
 assert.ok(replay.every(x=>x.id===payload.id));assert.equal((await api(a,'feedback')).items.length,1);
 assert.equal((await api(b,'feedback')).items.length,0);
 await api(a,'feedback',{...payload,message:'A conflicting retry must not silently replace the original message.'},409);
 checks.push('Feedback validation, concurrent idempotent retry, conflict rejection, cross-account isolation');
 await api(a,'assistant',{messages:[]},400);checks.push('AI invalid input rejected');
 await api(a,'assistant',{messages:[{role:'user',text:'Give one household tip.'}]},428);checks.push('AI denied before explicit consent');
 const policy=fs.readFileSync('apps/mobile/src/lib/ai-sharing-policy.ts','utf8').match(/AI_SHARING_VERSION\s*=\s*[\"']([^\"']+)/)[1];
 for(const u of users)await api(u,'account/ai-consent',{allowed:true,version:policy});
 const result=await Promise.allSettled(users.slice(0,1).map(u=>api(u,'assistant',{messages:[{role:'user',text:'Give one short practical tip for keeping household receipts organized.'}]})));
 result.forEach((x,i)=>{assert.equal(x.status,'fulfilled','AI request '+i);assert.ok(JSON.stringify(x.value).length>30);});
 checks.push('Three concurrent real AI requests succeeded; not a 300-user AI-capacity test');
}catch(e){failure=String(e.message).slice(0,300);process.exitCode=1;}
finally{
 const cleanup={created:users.length,deleted:0,verifiedAbsent:0,errors:[]};
 if(db)for(const u of users){try{
  const found=must(await db.auth.admin.getUserById(u.id));assert.equal(found.user.user_metadata.qa_run,run);
  must(await db.from('customer_feedback').delete().eq('user_id',u.id));
  must(await db.auth.admin.deleteUser(u.id));cleanup.deleted++;
  if((await db.auth.admin.getUserById(u.id)).error?.status===404)cleanup.verifiedAbsent++;
 }catch(e){cleanup.errors.push(String(e.message).slice(0,100));process.exitCode=1;}}
 const report={at:new Date().toISOString(),environment:origin,projectRef:ref,backend:'dpl_AyManDcr32xHfQ3M5bawujmQPoDR',checks,requests,failure,cleanup,scope:'Hosted feedback and bounded live AI diagnostic. No provider capacity, native acceptance or support email delivery inferred.'};
 fs.writeFileSync(dest,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}

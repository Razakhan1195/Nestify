import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/package.json');
const {createClient}=require('@supabase/supabase-js');
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error('Set REZLEE_STAGING_QA_SETTINGS to the external staging settings file.');
const s=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
if(s.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
let id;
try {
 const email='invite-readiness-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:'invitation-readiness-20261008'}});
 if(made.error)throw Error('Fixture creation failed'); id=made.data.user.id;
 const c=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
 const auth=await c.auth.signInWithPassword({email,password});if(auth.error)throw Error('Fixture login failed');
 const h=await c.from('homes').insert({user_id:id,nickname:'Disposable invitation readiness QA',city:'Pickering',province:'Ontario',home_type:'house',ownership_type:'owner'}).select('id').single();if(h.error)throw Error('Fixture home failed');
 const r=await fetch((process.env.INVITE_CHECK_BASE||'https://staging.rezlee.com')+'/api/mobile/v1/household',{method:'POST',headers:{Authorization:'Bearer '+auth.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({displayName:'Self-invite readiness probe',email}),signal:AbortSignal.timeout(30000)});
 const d=await r.json(); console.log(JSON.stringify({status:r.status,error:d.error,emailSendingConfigured:r.status===400&&d.error==='You are already part of this household.',emailsSent:0}));
 if(r.status!==400||d.error!=='You are already part of this household.')throw Error('Invitation sending is not configured');
 const shared=await fetch((process.env.INVITE_CHECK_BASE||'https://staging.rezlee.com')+'/api/mobile/v1/household',{method:'POST',headers:{Authorization:'Bearer '+auth.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({displayName:'Disposable invalid participant',email:'not-sent@example.invalid',expensePersonId:randomUUID()}),signal:AbortSignal.timeout(30000)});
 if(shared.status!==400)throw Error('Shared-expense invitation did not reach participant validation');
 console.log('Shared-expense invitation passed email readiness and rejected an invalid participant. Emails sent: 0.');
} finally {if(id){const r=await admin.auth.admin.deleteUser(id); if(r.error)throw Error('Fixture cleanup failed'); console.log('Disposable fixture removed');}}

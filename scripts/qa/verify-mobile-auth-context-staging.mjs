import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const P='/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019',s=JSON.parse(fs.readFileSync(P+'/staging-diagnostic-config.json')).env;
assert.equal(s.NEXT_PUBLIC_SUPABASE_URL,'https://gjwvalpxnfbvryosmcbj.supabase.co');
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts),checks=[];
async function call(token){const r=await fetch(s.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/rezlee_authenticated_mobile_context',{method:'POST',headers:{apikey:s.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});return {status:r.status,data:await r.json()};}
const fixtures=JSON.parse(fs.readFileSync(P+'/cloud-load-sessions.json'));for(const u of fixtures.users.slice(0,3)){const r=await call(u.token);assert.equal(r.status,200);assert.equal(r.data.user.id,u.id);assert.equal(r.data.access,'active');checks.push('existing synthetic identity and session verified');}
const token=fixtures.users[0].token,parts=token.split('.');parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);assert.equal((await call(parts.join('.'))).status,401);checks.push('forged signature rejected');
assert.ok([401,403].includes((await call(s.NEXT_PUBLIC_SUPABASE_ANON_KEY)).status));checks.push('anonymous access rejected');
let id;const email='auth-context-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
try {
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});if(made.error)throw Error(made.error.code);id=made.data.user.id;
 const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);let signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error(signed.error.code);
 const jwt=signed.data.session.access_token;assert.equal((await call(jwt)).status,200);
 const banned=await admin.auth.admin.updateUserById(id,{ban_duration:'1h'});if(banned.error)throw Error(banned.error.code);assert.equal((await call(jwt)).status,401);checks.push('current banned user rejected');
 const unban=await admin.auth.admin.updateUserById(id,{ban_duration:'none'});if(unban.error)throw Error(unban.error.code);
 signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error(signed.error.code);const second=signed.data.session.access_token;assert.equal((await call(second)).status,200);
 const out=await admin.auth.admin.signOut(second,'global');if(out.error)throw Error(out.error.code);assert.equal((await call(second)).status,401);checks.push('revoked durable session rejected');
} finally {if(id){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error('Synthetic auth cleanup failed');}}
const report={checkedAt:new Date().toISOString(),environment:'staging',checks,passed:checks.length,cleanup:true,productionWrites:0};fs.writeFileSync(P+'/auth-context-live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

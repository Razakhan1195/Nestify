import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://gjwvalpxnfbvryosmcbj.supabase.co');
const preview=process.env.REZLEE_QA_PREVIEW;assert.match(preview,/^https:\/\/nestify-[a-z0-9]+-razakhan1195s-projects\.vercel\.app$/);
const opts={auth:{persistSession:false,autoRefreshToken:false}},db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,opts);
const users=[],checks=[],tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rezlee-vault-qa-'));fs.chmodSync(tmp,0o700);
const must=r=>{if(r.error)throw Error('Fixture operation failed: '+(r.error.code||r.error.status||'unknown'));return r.data;};
const check=(name,yes)=>{assert.ok(yes,name);checks.push({name,pass:true});console.log('PASS',name);};
async function fixture(){const email='rezlee-vault-'+randomUUID()+'@example.invalid',password='Fixture-'+randomUUID()+'-Aa1!';const u=must(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:'ai-sharing-20261013'}})).user;users.push(u.id);const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const token=must(await c.auth.signInWithPassword({email,password})).session.access_token;const home=must(await db.from('homes').insert({user_id:u.id,nickname:'Synthetic Vault home'}).select('id').single());return {id:u.id,home:home.id,c,token};}
function api(user,route){const headers=path.join(tmp,randomUUID()+'.headers');fs.writeFileSync(headers,user?'Authorization: Bearer '+user.token+'\n':'Accept: application/json\n',{mode:0o600});try{const output=execFileSync('node',['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','curl',route,'--deployment',preview,'--scope','razakhan1195s-projects','--','--silent','--show-error','--max-time','30','--header','@'+headers,'--write-out','\n%{http_code}'],{cwd:'/tmp/rezlee-overnight-staging-20261013',encoding:'utf8',stdio:['ignore','pipe','pipe']});const lines=output.trim().split('\n'),status=Number(lines.pop());return {status,data:JSON.parse(lines.join('\n'))};}catch{throw Error('Protected preview request failed without printing credentials');}finally{fs.rmSync(headers,{force:true});}}
let complete=false;
try{
 check('anonymous consent is denied',api(null,'/api/mobile/v1/account/ai-consent').status===401);
 const a=await fixture(),b=await fixture();
 const r=api(a,'/api/mobile/v1/account/ai-consent');check('returning account is not silently opted in',r.status===200&&r.data.allowed===false);
 const denied=await a.c.rpc('reserve_rezlee_ai_request_v2');check('actual hosted admission blocks content before consent',!denied.error&&denied.data==='consent_required');
 const post=(user,body)=>{const headers=path.join(tmp,randomUUID()+'.headers'),input=path.join(tmp,randomUUID()+'.json');fs.writeFileSync(headers,'Authorization: Bearer '+user.token+'\nContent-Type: application/json\n',{mode:0o600});fs.writeFileSync(input,JSON.stringify(body),{mode:0o600});try{const output=execFileSync('node',['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','curl','/api/mobile/v1/account/ai-consent','--deployment',preview,'--scope','razakhan1195s-projects','--','--silent','--show-error','--request','POST','--header','@'+headers,'--data-binary','@'+input,'--write-out','\n%{http_code}'],{cwd:'/tmp/rezlee-overnight-staging-20261013',encoding:'utf8',stdio:['ignore','pipe','pipe']});const lines=output.trim().split('\n');return{status:Number(lines.pop()),data:JSON.parse(lines.join('\n'))};}finally{fs.rmSync(headers,{force:true});fs.rmSync(input,{force:true});}};
 check('old disclosure versions are rejected',post(a,{allowed:true,version:'old'}).status===400);
 check('another user cannot be selected in the consent body',post(a,{allowed:true,version:'2026-10-13',userId:b.id}).status===400);
 const grant=post(a,{allowed:true,version:'2026-10-13'});check('explicit permission is durably saved',grant.status===200&&grant.data.allowed===true);
 check('subsequent device reads see the permission',api(a,'/api/mobile/v1/account/ai-consent').data.allowed===true);
 check('other account keeps its own choice',api(b,'/api/mobile/v1/account/ai-consent').data.allowed===false);
 check('ordinary user cannot edit consent storage directly',Boolean((await a.c.from('rezlee_ai_consents').update({allowed:false}).eq('user_id',a.id)).error));
 check('ordinary user cannot inspect another permission row',must(await b.c.from('rezlee_ai_consents').select('user_id').eq('user_id',a.id)).length===0);
 check('withdrawal is saved',post(a,{allowed:false,version:'2026-10-13'}).data.allowed===false);
 const revoked=await a.c.rpc('reserve_rezlee_ai_request_v2');check('withdrawal blocks subsequent hosted model admission',!revoked.error&&revoked.data==='consent_required');
 complete=true;
}finally{
 for(const id of users)must(await db.auth.admin.deleteUser(id));
 check('account removal cascades permission records',must(await db.from('rezlee_ai_consents').select('user_id').in('user_id',users)).length===0);
 fs.rmSync(tmp,{recursive:true,force:true});fs.writeFileSync('docs/checkpoints/ai-sharing-20261013/hosted-api-results.json',JSON.stringify({complete,passed:checks.length,checks,cleanup:true,preview,paidCalls:0,realPhones:false},null,2)+'\n');console.log(JSON.stringify({complete,passed:checks.length,cleanup:true}));
}

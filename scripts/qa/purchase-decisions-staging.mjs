import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {emptyPurchase} from '../../apps/mobile/src/lib/purchase-decision.ts';
import {emptyQuote} from '../../apps/mobile/src/lib/quote-review.ts';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://gjwvalpxnfbvryosmcbj.supabase.co');
const preview=process.env.REZLEE_QA_PREVIEW;assert.equal(preview,'https://nestify-e318o0nso-razakhan1195s-projects.vercel.app');
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,opts);
const users=[],checks=[],tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rezlee-purchase-qa-'));fs.chmodSync(tmp,0o700);
const must=x=>{if(x.error)throw Error('Fixture operation failed: '+(x.error.code||x.error.status||'unknown'));return x.data;};
const check=(name,yes)=>{assert.ok(yes,name);checks.push({name,pass:true});console.log('PASS',name);};
async function fixture(){const email='rezlee-purchase-'+randomUUID()+'@example.invalid',password=randomUUID()+'-Fixture-Aa1!';const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:'purchase-decisions-20261013'}})).user;users.push(user.id);const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const token=must(await c.auth.signInWithPassword({email,password})).session.access_token;const home=must(await admin.from('homes').insert({user_id:user.id,nickname:'Synthetic decision home'}).select('id').single());return {id:user.id,token,c,homeId:home.id};}
function api(user,method,body,route='/api/mobile/v1/purchase-decisions'){
 const headers=path.join(tmp,randomUUID()+'.headers'),input=path.join(tmp,randomUUID()+'.json');fs.writeFileSync(headers,'Content-Type: application/json\n'+(user?'Authorization: Bearer '+user.token+'\n':''),{mode:0o600});
 const curl=['--silent','--show-error','--max-time','30','--request',method,'--header','@'+headers,'--write-out','\n%{http_code}'];if(body!==undefined){fs.writeFileSync(input,JSON.stringify(body),{mode:0o600});curl.push('--data-binary','@'+input);}
 try{const result=execFileSync('node',['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','curl',route,'--deployment',preview,'--scope','razakhan1195s-projects','--',...curl],{cwd:'/tmp/rezlee-overnight-staging-20261013',encoding:'utf8',stdio:['ignore','pipe','pipe']});const lines=result.trim().split('\n');const status=Number(lines.pop());return {status,data:JSON.parse(lines.join('\n'))};}catch{throw Error('Protected preview request failed without printing credentials');}
 finally{fs.rmSync(headers,{force:true});fs.rmSync(input,{force:true});}
}
let complete=false;
try{
 check('anonymous decisions are denied',api(null,'GET').status===401);
 const a=await fixture(),b=await fixture();let index=api(a,'GET');check('new home starts with an empty private index',index.status===200&&index.data.homeId===a.homeId&&index.data.decisions.length===0);
 const d={...emptyPurchase('replace'),title:'Repair washing machine',repairCost:'350',replacementCost:'600',installationCost:'125',disposalCost:'0',costsComplete:true};
 const save={id:randomUUID(),homeId:a.homeId,version:0,requestId:randomUUID(),payload:d};let result=api(a,'POST',save);check('repair versus replace worksheet saves',result.status===200&&result.data.decision.revision===1);
 result=api(a,'POST',save);check('lost-response retry replays once',result.status===200&&result.data.replayed===true&&result.data.decision.revision===1);
 check('same retry identity cannot change the accepted payload',api(a,'POST',{...save,payload:{...d,repairCost:'500'}}).status===409);
 check('a second device with an old revision cannot overwrite',api(a,'POST',{...save,requestId:randomUUID()}).status===409);
 check('other account cannot read a private decision',api(b,'GET',undefined,'/api/mobile/v1/purchase-decisions?id='+save.id).status===404);
 check('wrong household cannot accept a save',api(b,'POST',save).status===409);
 result=api(a,'POST',{...save,version:1,requestId:randomUUID(),payload:{...d,outcome:'Repair completed. Check again after a month.'}});check('later evidence is saved as the next revision',result.status===200&&result.data.decision.revision===2);
 check('customer role cannot invoke privileged save RPC',(await a.c.rpc('save_rezlee_purchase',{p_user:a.id,p_home:a.homeId,p_id:randomUUID(),p_version:0,p_request:randomUUID(),p_payload:d})).error?.code==='42501');
 const quotes=[];for(let i=0;i<2;i++){const doc=must(await admin.from('documents').insert({user_id:a.id,home_id:a.homeId,title:'Synthetic quote '+i,document_type:'quote'}).select('id,updated_at').single());const payload={...emptyQuote(),reviewed:true};payload.fields.price='CAD '+(1000+i*200)+' total';must(await admin.from('quote_reviews').insert({document_id:doc.id,user_id:a.id,home_id:a.homeId,revision:1,source_version:doc.updated_at,payload}));quotes.push({documentId:doc.id,sourceVersion:doc.updated_at,reviewRevision:1,total:String(1000+i*200),allIn:true,scopeConfirmed:true});}
 const comparison={id:randomUUID(),homeId:a.homeId,version:0,requestId:randomUUID(),payload:{...emptyPurchase('compare'),title:'Compare like-for-like work',quotes}};
 check('current reviewed originals support a saved comparison',api(a,'POST',comparison).status===200);
 must(await admin.from('documents').update({title:'Changed synthetic source'}).eq('id',quotes[0].documentId));
 index=api(a,'GET');check('index marks a revised original as stale',index.status===200&&index.data.sources.find(s=>s.documentId===quotes[0].documentId)?.sourceCurrent===false);
 check('stale original blocks new comparison revision',api(a,'POST',{...comparison,version:1,requestId:randomUUID()}).status===409);
 const compatibility={id:randomUUID(),homeId:a.homeId,version:0,requestId:randomUUID(),payload:{...emptyPurchase('compatibility'),title:'Exact model fit',existingModel:'Fixture A',candidateModel:'Fixture B',context:'tenant',permission:'Landlord approval required'}};
 check('unresolved tenant compatibility worksheet remains saveable',api(a,'POST',compatibility).status===200);
 check('unknown input fields are rejected',api(a,'POST',{...compatibility,userId:b.id}).status===400);
 check('Apple status endpoint returns a safe status',api(a,'GET',undefined,'/api/mobile/v1/account/apple-status').status===200);
 check('unsigned Apple event is rejected by enabled endpoint',[400,401].includes(api(null,'POST',{payload:'not-a-signed-event'},'/api/auth/apple/notifications').status));
 complete=true;
}finally{
 for(const id of users)must(await admin.auth.admin.deleteUser(id));
 check('account removal cascades the disposable decisions',must(await admin.from('purchase_decisions').select('id').in('user_id',users)).length===0);
 fs.rmSync(tmp,{recursive:true,force:true});
 fs.writeFileSync('docs/checkpoints/purchase-decisions-20261013/hosted-api-results.json',JSON.stringify({passed:checks.length,complete,checks,cleanup:true,preview,paidCalls:0,realAppleDelivery:false,realDevices:false},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,complete,cleanup:true}));
}

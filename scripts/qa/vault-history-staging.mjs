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
async function fixture(){const email='rezlee-vault-'+randomUUID()+'@example.invalid',password='Fixture-'+randomUUID()+'-Aa1!';const u=must(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:'vault-history-20261013'}})).user;users.push(u.id);const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const token=must(await c.auth.signInWithPassword({email,password})).session.access_token;const home=must(await db.from('homes').insert({user_id:u.id,nickname:'Synthetic Vault home'}).select('id').single());return {id:u.id,home:home.id,c,token};}
function api(user,route){const headers=path.join(tmp,randomUUID()+'.headers');fs.writeFileSync(headers,user?'Authorization: Bearer '+user.token+'\n':'Accept: application/json\n',{mode:0o600});try{const output=execFileSync('node',['/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','curl',route,'--deployment',preview,'--scope','razakhan1195s-projects','--','--silent','--show-error','--max-time','30','--header','@'+headers,'--write-out','\n%{http_code}'],{cwd:'/tmp/rezlee-overnight-staging-20261013',encoding:'utf8',stdio:['ignore','pipe','pipe']});const lines=output.trim().split('\n'),status=Number(lines.pop());return {status,data:JSON.parse(lines.join('\n'))};}catch{throw Error('Protected preview request failed without printing credentials');}finally{fs.rmSync(headers,{force:true});}}
const route=(view='documents',q='',cursor=null)=>'/api/mobile/v1/vault/search?view='+view+'&q='+encodeURIComponent(q)+(cursor?'&cursor='+encodeURIComponent(JSON.stringify(cursor)):'');
let complete=false;
try{
 check('anonymous history is denied',api(null,route()).status===401);
 const a=await fixture(),b=await fixture(),owner={user_id:a.id,home_id:a.home},expiry=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
 const docIds=must(await db.from('documents').insert(Array.from({length:137},(_,i)=>({...owner,title:i===0?'Older needle %_ warranty':'Synthetic record '+i,document_type:i===0?'warranty':'receipt',expires_on:i===0?expiry:null,created_at:new Date(Date.UTC(2025,0,1+i)).toISOString()}))).select('id,title')).map(d=>d.id);
 must(await db.from('inventory_items').insert(Array.from({length:137},(_,i)=>({...owner,name:i===0?'Older needle covered item':'Synthetic item '+i,category:'Appliance',warranty_expires_on:i===0?expiry:null,created_at:new Date(Date.UTC(2025,0,1+i)).toISOString()}))));
 const overview=api(a,'/api/mobile/v1/vault');check('overview stays bounded but counts all entries and older warranties',overview.status===200&&overview.data.documents.length===100&&overview.data.items.length===100&&overview.data.summary.recordsCount===137&&overview.data.summary.itemsCount===137&&overview.data.summary.warrantyCount===2&&overview.data.summary.expiringSoonCount===2);
 const first=api(a,route());check('first page contains 50 of 137 records',first.status===200&&first.data.rows.length===50&&first.data.total===137&&!!first.data.nextCursor);
 must(await db.from('documents').insert({...owner,title:'Inserted while paging',document_type:'receipt'}));
 const second=api(a,route('documents','',first.data.nextCursor)),third=api(a,route('documents','',second.data.nextCursor));
 check('new inserts do not skip or duplicate the older pages',second.status===200&&third.status===200&&second.data.rows.length===50&&third.data.rows.length===37&&third.data.nextCursor===null&&new Set([...first.data.rows,...second.data.rows,...third.data.rows].map(d=>d.id)).size===137);
 const old=api(a,route('documents','needle %_'));check('literal search finds an original outside the recent 100',old.status===200&&old.data.total===1&&docIds.includes(old.data.rows[0].id));
 check('search results do not expose storage paths, notes or owner IDs',!Object.keys(old.data.rows[0]).some(k=>['storage_path','notes','user_id','home_id'].includes(k)));
 const warranties=api(a,route('warranties'));check('warranties include older documents and covered items',warranties.status===200&&warranties.data.total===2&&new Set(warranties.data.rows.map(d=>d.kind)).size===2);
 const items=api(a,route('items','needle'));check('home item history is searchable',items.status===200&&items.data.total===1);
 const other=api(b,route('documents','needle'));check('another account cannot discover the first household records',other.status===200&&other.data.total===0);
 const direct=await b.c.rpc('search_rezlee_vault',{p_home:a.home,p_view:'documents',p_query:''});check('direct RPC rejects a foreign home',direct.error?.code==='PT404');
 check('invalid cursor is rejected',api(a,route()+'&cursor=bad').status===400);
 check('oversized searches are rejected',api(a,route('documents','x'.repeat(101))).status===400);
 complete=true;
}finally{
 for(const id of users)must(await db.auth.admin.deleteUser(id));
 check('disposable records are removed',must(await db.from('documents').select('id').in('user_id',users)).length===0);
 fs.rmSync(tmp,{recursive:true,force:true});
 fs.writeFileSync('docs/checkpoints/vault-history-20261013/hosted-api-results.json',JSON.stringify({checkedAt:new Date().toISOString(),complete,passed:checks.length,checks,cleanup:true,preview,paidCalls:0,realPhones:false},null,2)+'\n');
 console.log(JSON.stringify({complete,passed:checks.length,cleanup:true}));
}

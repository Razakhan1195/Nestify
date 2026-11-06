import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
const s=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
if(s.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
const output=process.env.REZLEE_QA_OUTPUT;
if(!output)throw Error('Set a private REZLEE_QA_OUTPUT directory');
fs.mkdirSync(output,{recursive:true,mode:0o700});
if(fs.existsSync(output+'/cloud-load-fixtures.json'))throw Error('Use a fresh output directory');
const count=Number(process.env.REZLEE_QA_USERS||300);
if(!Number.isInteger(count)||count<1||count>300)throw Error('Expected 1 to 300 synthetic users');
const fixtures=[],run=randomUUID(),journal=output+'/cloud-load-fixtures.json';
const saveSessions=()=>fs.writeFileSync(output+'/cloud-load-sessions.json',JSON.stringify({run,createdAt:new Date().toISOString(),users:fixtures,anonKey:s.NEXT_PUBLIC_SUPABASE_ANON_KEY}),{mode:0o600});
const out='docs/checkpoints/overnight-20261019/cloud-load-preparation.json';
const must=r=>{if(r.error)throw Error('Fixture failure '+(r.error.code||r.error.status));return r.data;};
async function pool(items,n,fn){let i=0;const settled=await Promise.allSettled(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const j=i++;await fn(items[j],j);}}));const failed=settled.find(r=>r.status==="rejected");if(failed)throw failed.reason;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;
let failure=null,cleanup=true,maxInFlight=0,inFlight=0;
try{
 await pool(Array.from({length:count},(_,i)=>i),1,async i=>{
  await sleep(2000);
  const email='load-'+run+'-'+i+'@example.invalid',password=randomUUID()+randomUUID();
  const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true,qa_run:run}})).user;
  const f={id:user.id};fixtures.push(f);fs.writeFileSync(journal,JSON.stringify({run,userIds:fixtures.map(x=>x.id)}),{mode:0o600});
  const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
  const session=must(await client.auth.signInWithPassword({email,password})).session;
  f.token=session.access_token;f.refreshToken=session.refresh_token;saveSessions();
  const home=must(await admin.from('homes').insert({user_id:f.id,nickname:'Synthetic load household'}).select('id').single());f.home=home.id;
  must(await admin.from('bills').insert(Array.from({length:12},(_,j)=>({home_id:f.home,user_id:f.id,name:'Synthetic bill '+j,amount:55+j,currency:'CAD',status:'paid',payment_status:'paid',due_date:'2026-10-20'}))));
  must(await admin.from('documents').insert(Array.from({length:8},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic record '+j,document_type:'receipt'}))));
  must(await admin.from('maintenance_tasks').insert(Array.from({length:6},(_,j)=>({home_id:f.home,user_id:f.id,title:'Synthetic task '+j,status:'open',due_date:'2026-10-25'}))));
  saveSessions();
  if((i+1)%25===0)console.log('FIXTURES',i+1);
 });
 saveSessions();console.log('CLOUD_FIXTURES_READY',fixtures.length);
}catch(e){console.error(e.message);await pool(fixtures,3,async f=>{await admin.auth.admin.deleteUser(f.id);});process.exitCode=1;}

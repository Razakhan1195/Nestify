// Explicit opt-in: creates disposable users/data in the configured Supabase project.
// Uses localhost by default. Does not call provider retrieval or AI generation.
if(process.env.REZLEE_RUN_LIVE_CARE_QA !== 'yes') {
 console.error('Set REZLEE_RUN_LIVE_CARE_QA=yes to run disposable live Care fixtures.');
 process.exit(1);
}
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=process.cwd();
import { createClient } from '@supabase/supabase-js';
const env={};for(const line of fs.readFileSync(root+'/.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'').replace(/\\n/g,'\n');}
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const api=process.env.REZLEE_QA_API_URL||'http://localhost:3101';const run=crypto.randomUUID();let users=[];let failures=[];const checks=[];
function check(ok,label){if(!ok)throw Error(label);checks.push(label);console.log('PASS',label);}
async function apiRequest(token,path,body,method='POST'){const res=await fetch(api+'/api/mobile/v1'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const json=await res.json();return {status:res.status,data:json};}
async function account(label){const email='care-qa-'+label+'-'+run+'@example.invalid',password=crypto.randomBytes(28).toString('base64url');const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw Error('Temporary account creation failed: '+error.code);users.push(data.user.id);const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error('Temporary account authentication failed');return {id:data.user.id,token:signed.data.session.access_token};}
(async()=>{try{
 const owner=await account('owner'),guest=await account('guest');const home=crypto.randomUUID(),om=crypto.randomUUID(),gm=crypto.randomUUID();
 const added=await admin.from('homes').insert({id:home,user_id:owner.id,nickname:'Temporary Care verification'});if(added.error)throw Error('Temporary home creation failed');
 const members=await admin.from('household_members').insert([{id:om,home_id:home,created_by_user_id:owner.id,linked_user_id:owner.id,display_name:'QA owner',role:'owner',status:'active'},{id:gm,home_id:home,created_by_user_id:owner.id,linked_user_id:guest.id,display_name:'QA member',role:'member',status:'active'}]);if(members.error)throw Error('Temporary household membership creation failed');
 const task=(title,recurrence)=>({title,category:'Cleaning',description:'Isolated verification fixture',recurrence,priority:'normal',due_date:new Date().toISOString().slice(0,10)});
 const body={requestId:'qa-'+run,tasks:[task('One-time verification',''),task('Recurring verification','weekly')],assignment:{mode:'rotate',memberIds:[om,gm]}};
 const saved=await Promise.all([apiRequest(owner.token,'/care/routine',body),apiRequest(owner.token,'/care/routine',body)]);
 check(saved.every(r=>r.status===200&&r.data.count===2),'concurrent HTTP retries both succeed');
 const read=await admin.from('maintenance_tasks').select('id,title,status,assigned_member_id').eq('home_id',home);if(read.error)throw Error('Fixture read failed');check(read.data.length===2,'only two tasks persisted after retries');
 const changed=await apiRequest(owner.token,'/care/routine',{...body,tasks:[task('Changed task','daily')]});check(changed.status===400,'same key with different choices rejected');
 const list=await apiRequest(owner.token,'/care',null,'GET');check(list.status===200&&list.data.tasks.length===2,'created routine returned through Care API');
 const repeating=read.data.find(t=>t.assigned_member_id===gm);const done=await apiRequest(guest.token,'/care/'+repeating.id+'/complete',{});if(done.status!==200||!done.data.nextDate) console.log('Completion response',JSON.stringify(done));check(done.status===200&&!!done.data.nextDate,'assigned member completion schedules next occurrence');
 const repeated=await apiRequest(guest.token,'/care/'+repeating.id+'/complete',{});check(repeated.status===400,'duplicate completion rejected');
 const after=await admin.from('maintenance_tasks').select('id,status,assigned_member_id').eq('home_id',home);const next=after.data.filter(t=>!read.data.some(b=>b.id===t.id));check(next.length===1&&next[0].assigned_member_id===om,'exactly one next occurrence rotates to owner');
 const forbidden=await apiRequest(guest.token,'/care/'+next[0].id+'/complete',{});check(forbidden.status>=400,'member cannot complete owner-assigned turn');
 const once=read.data.find(t=>t.assigned_member_id===om);const onceDone=await apiRequest(owner.token,'/care/'+once.id+'/complete',{});check(onceDone.status===200&&onceDone.data.nextDate===null,'one-time task closes without recurrence');
 const removed=await apiRequest(owner.token,'/care/'+next[0].id,null,'DELETE');check(removed.status===200,'owner can stop the next recurring task');
 const final=await apiRequest(owner.token,'/care',null,'GET');check(final.status===200&&final.data.tasks.length===2&&final.data.tasks.every(t=>t.displayStatus==='completed'),'completed history retained with no open repeats');
 const guestSave=await apiRequest(guest.token,'/care/routine',{...body,requestId:'qa-member-'+run});check(guestSave.status>=400,'member cannot activate owner-only routines');
 }catch(e){failures.push(e.message);console.log('FAIL',e.message);}finally{
  for(const id of [...users].reverse()){const result=await admin.auth.admin.deleteUser(id);if(result.error){failures.push('Temporary account cleanup failed');console.log('CLEANUP FAILED for one temporary account');}else console.log('CLEANUP temporary account removed');}
  console.log(JSON.stringify({passed:checks.length,failures,temporaryAccounts:users.length}));process.exitCode=failures.length?1:0;
 }})();

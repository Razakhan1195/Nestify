// Explicitly invoked durable demo, isolated from founder/customer homes. No paid calls.
import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {demoKey,demoStatements,statementPdf,stableId} from './household-fixtures.mjs';
import {parseIntakeEvidence} from '../../apps/mobile/src/lib/statement-intake-evidence.ts';
import {manualHistoryAccounts} from '../../apps/mobile/src/lib/manual-history-insights.ts';
import {buildSavedBillStory} from '../../apps/mobile/src/lib/saved-bill-story.ts';

if(process.env.REZLEE_CREATE_DEMO!=='yes')throw Error('Explicit REZLEE_CREATE_DEMO=yes required');
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL,'https://gjwvalpxnfbvryosmcbj.supabase.co','Staging only');
const base='https://staging.rezlee.com',options={auth:{persistSession:false,autoRefreshToken:false}};
const dir=join(homedir(),'Documents','Rezlee-Demo-Access');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const statePath=join(dir,'demo-home.json');
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options);
const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{demoKey,email:'demo.home@rezlee.com',password:randomBytes(18).toString('base64url')+'!7a',bills:{},checks:[]};
assert.equal(state.demoKey,demoKey);const save=()=>{writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});chmodSync(statePath,0o600);};
// Persist credentials before creation, so interruptions never orphan access.
save();
if(!state.userId){
 const made=await admin.auth.admin.createUser({email:state.email,password:state.password,email_confirm:true,user_metadata:{full_name:'Alex Demo',first_name:'Alex',demo_household:demoKey,qa_marker:true},app_metadata:{demo_household:demoKey}});
 if(made.error)throw Error('Demo account creation failed: '+made.error.message);
 state.userId=made.data.user.id;save();
}
const user=await admin.auth.admin.getUserById(state.userId);
assert.equal(user.data.user?.app_metadata.demo_household,demoKey,'Refuse non-demo account');
assert.equal(user.data.user?.email,state.email,'Refuse mismatched account');
const login=await client.auth.signInWithPassword({email:state.email,password:state.password});
if(login.error)throw Error('Demo sign-in failed');
const token=login.data.session.access_token;
async function api(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();if(!response.ok)throw Error(`${method} ${path}: ${response.status} ${data.error??'Request failed'}`);return data;
}
const existing=await client.from('homes').select('id,nickname').eq('user_id',state.userId);
if(existing.error)throw Error('Cannot inspect demo household');
assert.ok(existing.data.length<=1,'Demo must own only one home');
if(!state.homeId){
 if(existing.data.length){assert.equal(existing.data[0].nickname,'Demo Home · Sample data');state.homeId=existing.data[0].id;}
 else{const home=await api('/api/mobile/v1/onboarding','POST',{nickname:'Demo Home · Sample data',city:'Pickering',province:'Ontario',postal_code:'Demo',home_type:'Townhouse',ownership_type:'Own'});state.homeId=home.home.id;}
 save();
}
assert.equal((await client.from('homes').select('user_id').eq('id',state.homeId).single()).data?.user_id,state.userId);
const output=join(dir,'sample-statements');mkdirSync(output,{recursive:true,mode:0o700});
for(const s of demoStatements()){
 assert.ok(parseIntakeEvidence(s.supporting),'Fixture evidence validates');
 assert.equal(Math.round(Number(s.supporting.fields.subtotal)*100)+Math.round(Number(s.supporting.fields.tax)*100)-Math.round(Number(s.supporting.fields.credits)*100),Math.round(Number(s.amount)*100));
 const file=statementPdf(s);writeFileSync(join(output,s.key+'.pdf'),file);
 if(state.bills[s.key])continue;
 const body=new FormData();
 for(const [k,v] of Object.entries({requestId:stableId(s.key),expectedHomeId:state.homeId,bill_title:`${s.provider} · ${s.periodStart.slice(0,7)} · Sample`,provider_name:s.provider,category:{electricity:'Electricity',gas:'Gas',internet:'Internet'}[s.service],account_number:s.account,amount:s.amount,billing_period_start:s.periodStart,billing_period_end:s.periodEnd,issue_date:s.issue,notes:s.notes,reviewed:'true',currency:'CAD',supporting_details:JSON.stringify(s.supporting)}))body.append(k,v);
 body.append('file',new Blob([file],{type:'application/pdf'}),s.key+'-sample.pdf');
 const saved=await api('/api/mobile/v1/bills/history/upload','POST',body);assert.ok(saved.ok&&saved.billId);
 state.bills[s.key]=saved.billId;save();console.log('Saved',s.key);
}
// A calm populated Home with two useful sample reminders; idempotent API receipts.
for(const task of [{title:'Check the furnace filter',due_date:'2026-10-05',category:'Maintenance'},{title:'Review home insurance renewal',due_date:'2026-10-19',category:'Reminder'}]){
 await api('/api/mobile/v1/care','POST',{...task,requestId:stableId(task.title),priority:'normal',description:'Sample task for the Demo Home. Not a real maintenance or insurance obligation.'});
}
const bills=await api('/api/mobile/v1/bills');
const accounts=manualHistoryAccounts(bills.bills??[]);assert.equal(accounts.length,3,'Exactly three sample accounts');
const expected=demoStatements();const results=[];
for(const account of accounts){
 assert.equal(account.bills.length,12);
 const story=buildSavedBillStory(account,{today:'2026-09-30',complete:true});
 assert.equal(story.history.points.length,12);assert.equal(story.history.excluded,0);assert.equal(story.history.gapDays,0);assert.equal(story.breakdownDifference,0);assert.ok(story.change);assert.equal(story.analysis.issues.length,0);
 if(story.kind){assert.equal(story.history.missingUsage,0);assert.equal(story.energySummary.matched,true);assert.ok(story.energyChanges);}
 if(story.kind==='electricity')assert.equal(story.timeBands.length,3);
 if(account.provider==='Rogers'){assert.equal(story.change.changeMinor,2260);assert.equal(story.change.chargeBreakdown.creditEffect,2000);assert.equal(story.change.chargeBreakdown.taxChange,260);}
 for(const bill of account.bills){
  assert.ok(bill.originalDocumentId);
  const source=expected.find(s=>state.bills[s.key]===bill.id);assert.ok(source);assert.equal(bill.amount,Number(source.amount));
  assert.equal(bill.reviewedEvidence.amountDue,source.supporting.fields.amountDue);
 }
 // Download one private original per account, and compare bytes exactly.
 const latest=account.bills[0],source=expected.find(s=>state.bills[s.key]===latest.id);
 const original=await api('/api/mobile/v1/bills/'+latest.id+'/original');
 const download=await fetch(original.url,{signal:AbortSignal.timeout(15000)});assert.ok(download.ok);
 assert.ok(Buffer.from(await download.arrayBuffer()).equals(statementPdf(source)));
 results.push({provider:account.provider,statements:12,graphPoints:story.history.points.length,latestCharges:story.minor/100,latestChange:story.change.changeMinor/100,usageUnit:story.usage?.unit??null,timeBands:story.timeBands?.length??0,originalVerified:true});
}
const home=await api('/api/mobile/v1/home');assert.ok(!home.needsOnboarding);
const care=await api('/api/mobile/v1/care');assert.equal(care.tasks.length,2);
const vault=await api('/api/mobile/v1/vault');assert.equal(vault.documents.length,36);
const providers=await client.from('providers').select('id').eq('user_id',state.userId);assert.equal(providers.data?.length,0,'No simulated connection masquerades as live');
const integration=await client.from('provider_integrations').select('id').eq('user_id',state.userId);assert.equal(integration.data?.length,0);
const blocked=await fetch(base+'/api/mobile/v1/bills/'+accounts[0].bills[0].id+'/original');assert.equal(blocked.status,401);
state.verifiedAt=new Date().toISOString();state.summary=results;save();
const report={demoKey,environment:'staging',home:'Demo Home · Sample data',accountEmail:state.email,verifiedAt:state.verifiedAt,accounts:results,careTasks:care.tasks.length,privateOriginals:vault.documents.length,loginVerified:true,homeApiVerified:true,unauthenticatedOriginalRejected:true,liveConnections:0,paidCalls:0,scheduledPulls:false,phoneVisualVerified:false};
writeFileSync('docs/demo-household-results-2026-09-30.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));console.log('Access saved privately in Documents/Rezlee-Demo-Access/demo-home.json');

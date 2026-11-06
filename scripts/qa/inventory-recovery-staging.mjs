// Run only after the additive migration and API are deployed to staging.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/package.json'),{createClient}=require('@supabase/supabase-js');
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options);
const base='https://staging.rezlee.com',path='/api/mobile/v1/inventory/create',out=process.env.REZLEE_QA_OUTPUT||'docs/checkpoints/inventory-recovery-20261011';
const ids=[],checks=[];let completed=false,fixturesCleaned=false;
mkdirSync(out,{recursive:true});
const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
async function call(token,url,body,method){const response=await fetch(base+url,{method:method??(body?'POST':'GET'),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});return{status:response.status,data:await response.json()};}
async function fixture(){
 const email='inventory-qa-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:'inventory-recovery-20261011'}});
 if(made.error)throw Error('Fixture creation failed');ids.push(made.data.user.id);
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error('Fixture login failed');
 const home=await client.from('homes').insert({user_id:made.data.user.id,nickname:'Disposable inventory QA',city:'Pickering',province:'Ontario',home_type:'house',ownership_type:'owner'}).select('id').single();
 if(home.error)throw Error('Fixture home failed');
 return {id:made.data.user.id,client,homeId:home.data.id,token:login.data.session.access_token};
}
try{
 const a=await fixture(),b=await fixture();
 const caps=await call(a.token,path);assert(caps.status===200&&caps.data.createRecovery&&caps.data.homeId===a.homeId,'Recovery capability available for owned home');
 const fields={name:'Synthetic kitchen dishwasher',brand:'QA',model_number:'DW100',serial_number:'',room_or_area:'Kitchen',category:'Appliance',product_barcode:'',warranty_expires_on:''};
 const intent={requestId:randomUUID(),homeId:a.homeId,action:'create',fields};
 const saves=await Promise.all(Array.from({length:4},()=>call(a.token,path,intent)));
 const itemId=saves[0].data.itemId;
 assert(Boolean(itemId)&&saves.every(r=>r.status===200&&r.data.itemId===itemId),'Four concurrent attempts return one saved item');
 const rows=await a.client.from('inventory_items').select('id').eq('home_id',a.homeId);
 assert(!rows.error&&rows.data.length===1,'Concurrent retries create exactly one row');
 const found=await call(a.token,path+'?requestId='+intent.requestId);
 assert(found.status===200&&found.data.state==='saved'&&found.data.itemId===itemId,'Lost response recovered with a read');
 const changed=await call(a.token,path,{...intent,fields:{...fields,name:'Changed payload'}});
 assert(changed.status===409,'A changed payload cannot reuse the save request');
 const correction=await call(a.token,'/api/mobile/v1/inventory',{...fields,id:itemId,name:'Corrected saved name'});
 assert(correction.status===200,'Existing edit route remains usable');
 const replay=await call(a.token,path,intent),detail=await call(a.token,'/api/mobile/v1/inventory?id='+itemId);
 assert(replay.status===200&&detail.data.item.name==='Corrected saved name','Retry does not overwrite a later correction');
 const separate=await call(a.token,path,{...intent,requestId:randomUUID()});
 assert(separate.status===200&&separate.data.itemId!==itemId,'A deliberate identical appliance gets its own item');
 const cancelSaved=await call(a.token,path,{requestId:intent.requestId,homeId:a.homeId,action:'cancel'});
 assert(cancelSaved.status===200&&cancelSaved.data.state==='saved'&&cancelSaved.data.itemId===itemId,'Cancelling a completed save opens it without deleting it');
 const cancelled={...intent,requestId:randomUUID()};
 assert((await call(a.token,path,{requestId:cancelled.requestId,homeId:a.homeId,action:'cancel'})).data.state==='cancelled','Unsent request can be cancelled');
 assert((await call(a.token,path,cancelled)).status===410,'Delayed create cannot follow cancellation');
 const deleted=await call(a.token,'/api/mobile/v1/inventory?id='+itemId,undefined,'DELETE');
 assert(deleted.status===200,'Saved item can be deleted normally');
 assert((await call(a.token,path,intent)).status===410,'Old retry cannot recreate a deleted item');
 assert((await call(a.token,path+'?requestId='+intent.requestId)).data.state==='deleted','Recovery explains the previous deletion');
 const foreign=await call(b.token,path+'?requestId='+intent.requestId);
 assert(foreign.status===200&&foreign.data.state==='unknown'&&!foreign.data.itemId,'Other account cannot read the receipt');
 assert((await call(b.token,path,intent)).status===409,'Other account cannot submit to the first home');
 const raw=await b.client.from('inventory_create_requests').select('request_id').eq('user_id',a.id);
 assert(!raw.error&&raw.data.length===0,'Direct RLS hides another account receipts');
 const denied=await a.client.from('inventory_create_requests').delete().eq('request_id',intent.requestId);
 assert(Boolean(denied.error),'Clients cannot remove replay tombstones');
 const invalid=await call(a.token,path,{...intent,requestId:randomUUID(),fields:{...fields,warranty_expires_on:'2026-02-30'}});
 assert(invalid.status===400,'Impossible warranty date rejected');
 completed=true;
}finally{
 const cleanup=[];
 for(const id of ids){const result=await admin.auth.admin.deleteUser(id);if(result.error)cleanup.push('Fixture account deletion failed');}
 fixturesCleaned=cleanup.length===0;
 writeFileSync(out+'/hosted-results.json',JSON.stringify({checks,completed,fixturesCleaned,paidCalls:0,realCustomerDataChanged:false},null,2));
 if(cleanup.length)throw Error(cleanup.join('; '));
 console.log(checks.length+' checks; completed='+completed+'; disposable fixtures cleaned.');
}

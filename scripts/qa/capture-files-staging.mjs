import{createRequire}from'node:module';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{randomUUID,createHash}from'node:crypto';
const require=createRequire(process.cwd()+'/package.json'),{createClient}=require('@supabase/supabase-js');
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,'utf8'));if(settings.NEXT_PUBLIC_SUPABASE_URL!=='https://gjwvalpxnfbvryosmcbj.supabase.co')throw Error('Staging only');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),base='https://staging.rezlee.com';
const ids=[],checks=[];let home,completed=false;const evidence=process.env.REZLEE_QA_OUTPUT||'docs/checkpoints/capture-files-20261011';
const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
function pdf(text){const parts=['%PDF-1.4\n'],offsets=[0];const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];const stream='BT /F1 12 Tf 20 150 Td ('+text+') Tj ET';objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(parts.join('')));parts.push((i+1)+' 0 obj\n'+objects[i]+'\nendobj\n');}const x=Buffer.byteLength(parts.join(''));parts.push('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF');return Buffer.from(parts.join(''));}
async function fixture(){const email='capture-qa-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:'capture-recovery-20261008'}});if(made.error)throw Error('Fixture creation failed');ids.push(made.data.user.id);const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error('Fixture login failed');return{id:made.data.user.id,client,token:signed.data.session.access_token};}
async function call(token,path,method='GET',body){const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token},body,signal:AbortSignal.timeout(45000)});return{status:response.status,data:await response.json()};}
const digest=b=>createHash('sha256').update(b).digest('hex');

try{
 const user=await fixture();const made=await user.client.from('homes').insert({user_id:user.id,nickname:'Disposable file QA',city:'Pickering',province:'Ontario',home_type:'house',ownership_type:'owner'}).select('id').single();if(made.error)throw Error('Fixture home failed');home=made.data.id;
 const other=await fixture();
 const otherHome=await other.client.from("homes").insert({user_id:other.id,nickname:"Other disposable home",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"});if(otherHome.error)throw Error("Other fixture home failed");
 for(const name of ['complete-two-page.pdf','conflicting-two-page.pdf','clear-first-page.png','unreadable-image.png']){
  const bytes=readFileSync('scripts/qa/fixtures/quote-files/'+name),requestId=randomUUID(),type=name.endsWith('.pdf')?'application/pdf':'image/png';
  const form=(extra={})=>{const f=new FormData();for(const[k,v]of Object.entries({requestId,expectedHomeId:home,title:'Synthetic '+name,category:'Other',issued_on:'',expires_on:'',notes:'Synthetic QA only',...extra}))f.set(k,v);f.set('file',new File([bytes],name,{type}));return f;};
  const saved=await call(user.token,'/api/mobile/v1/vault/records','POST',form());assert(saved.status===200&&saved.data.id,name+': saved original');
  const retry=await call(user.token,'/api/mobile/v1/vault/records','POST',form());assert(retry.status===200&&retry.data.id===saved.data.id,name+': same request replay returns same record');
  const recovered=await call(user.token,'/api/mobile/v1/vault/records?requestId='+requestId,'PATCH');assert(recovered.status===200&&recovered.data.id===saved.data.id,name+': recover without uploading bytes');
  const detail=await call(user.token,'/api/mobile/v1/vault/records?id='+saved.data.id);assert(detail.status===200&&detail.data.record.hasFile,name+': reopened original record');
  const signed=await call(user.token,'/api/mobile/v1/vault/records?id='+saved.data.id+'&file=1');assert(signed.status===200&&signed.data.url,name+': private original available');
  const response=await fetch(signed.data.url,{signal:AbortSignal.timeout(15000)});assert(response.ok&&digest(Buffer.from(await response.arrayBuffer()))===digest(bytes),name+': exact bytes retained including later PDF pages');
  const denied=await call(other.token,'/api/mobile/v1/vault/records?id='+saved.data.id+'&file=1');assert([403,404].includes(denied.status),name+': another account cannot obtain original');
  const quote=await call(user.token,'/api/mobile/v1/quotes?id='+saved.data.id);assert(quote.status===200&&quote.data.document.hasFile&&!quote.data.review,name+': quote opens without an automatic AI read');
  const correction=new FormData();for(const[k,v]of Object.entries({id:saved.data.id,requestId:randomUUID(),expectedHomeId:home,expectedVersion:detail.data.record.updated_at,title:'Corrected QA title',category:'Other',issued_on:'',expires_on:'',notes:'Customer correction retained'}))correction.set(k,v);
  const corrected=await call(user.token,'/api/mobile/v1/vault/records','POST',correction);assert(corrected.status===200&&corrected.data.id===saved.data.id,name+': metadata correction saved without reupload');
  const reopened=await call(user.token,'/api/mobile/v1/vault/records?id='+saved.data.id);assert(reopened.status===200&&reopened.data.record.title==='Corrected QA title'&&reopened.data.record.hasFile,name+': corrected title and original coexist');
 }
 mkdirSync(evidence,{recursive:true});
 writeFileSync(evidence+'/hosted-results.json',JSON.stringify({checks,paidCalls:0,realCustomerDataChanged:false,fixturesCleaned:false},null,2));
 completed=true;console.log('Passed '+checks.length+' hosted file checks.');
}finally{
 for(const id of ids){const docs=await admin.from('documents').select('storage_path').eq('user_id',id);if(docs.error)throw Error('Fixture cleanup lookup failed');const paths=(docs.data??[]).map(d=>d.storage_path).filter(Boolean);if(paths.some(p=>!p.startsWith(id+'/')))throw Error('Cleanup path outside fixture');if(paths.length){const removed=await admin.storage.from('rezlee-documents').remove(paths);if(removed.error)throw Error('Fixture storage cleanup failed');}const removed=await admin.auth.admin.deleteUser(id);if(removed.error)throw Error('Fixture user cleanup failed');}
 writeFileSync(evidence+'/hosted-results.json',JSON.stringify({checks,paidCalls:0,realCustomerDataChanged:false,fixturesCleaned:true,completed},null,2));console.log('Disposable users and uploaded originals removed.');
}

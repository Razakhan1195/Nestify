'use strict';
// Build-time validation. Never reads local environment or credential files.
const PRODUCTION_REF='eynbuhmtxkigvqoewbwi';
const required={
 core:['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL'],
 providers:['DECK_API_KEY','DECK_WEBHOOK_SIGNING_SECRET','DECK_IMPORT_WORKER_SECRET','DECK_MOCK_MODE','REZLEE_DECK_HOSTED_ENABLED','REZLEE_DECK_TELECOM_ENABLED','REZLEE_DECK_LAUNCH_PROVIDERS','REZLEE_DECK_TESTING_ENABLED','EZGB_CLIENT_ID','EZGB_CLIENT_SECRET','EZGB_BASE_URL','EZGB_PUBLIC_APP_URL','EZGB_CUSTOMER_CODE'],
 email:['RESEND_API_KEY','RESEND_FROM_EMAIL','APP_NOTIFICATION_WORKER_SECRET','REZLEE_APP_NOTIFICATIONS_ENABLED','REZLEE_EMAIL_CODE_ENABLED'],
 places:['GOOGLE_PLACES_API_KEY','GOOGLE_PLACES_ENABLED'],
 ai:['REZLEE_AI_DISABLED','AI_ASSISTANT_PROVIDER'],
 subscriptions:['REVENUECAT_SECRET_KEY','REVENUECAT_WEBHOOK_AUTH','REVENUECAT_ALLOW_SANDBOX','REZLEE_STORE_PRODUCTS','REZLEE_MEMBERSHIPS_ENABLED','REZLEE_PURCHASES_ENABLED'],
 scheduledWork:['CRON_SECRET','RECALL_BACKGROUND_ENABLED','REZLEE_GMAIL_SCHEDULE_READY'],
 preservedFeatures:['REZLEE_APPLE_NOTIFICATIONS_ENABLED','REZLEE_MOBILE_SCREEN_SNAPSHOT_ENABLED','ACCOUNT_DELETION_ENABLED','REZLEE_HOME_SNAPSHOT_ENABLED','REZLEE_MOBILE_AUTH_CONTEXT_ENABLED','REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED','REZLEE_MOBILE_READ_BUDGET_ENABLED','REZLEE_BILL_RECORD_REVIEW','REZLEE_RECEIPT_DEDUP','REZLEE_STATEMENT_READING_ENABLED','REZLEE_GMAIL_ENABLED','REZLEE_EMAIL_CAPTURE_ENABLED','REZLEE_EMAIL_AI_PRIVACY_APPROVED'],
};
const requiredNames=[...new Set(Object.values(required).flat())];
function validate(env){
 const failures=[];
 failures.push(...requiredNames.filter(k=>typeof env[k]!=='string'||!env[k].trim()).map(name=>({name,reason:'missing'})));
 const exact={NEXT_PUBLIC_SUPABASE_URL:'https://'+PRODUCTION_REF+'.supabase.co',NEXT_PUBLIC_APP_URL:'https://rezlee.com',NEXT_PUBLIC_SITE_URL:'https://rezlee.com',GOOGLE_PLACES_ENABLED:'true',DECK_MOCK_MODE:'false',REZLEE_AI_DISABLED:'false',REVENUECAT_ALLOW_SANDBOX:'false',REZLEE_DECK_TESTING_ENABLED:'false',REZLEE_MEMBERSHIPS_ENABLED:'true',REZLEE_PURCHASES_ENABLED:'true',ACCOUNT_DELETION_ENABLED:'true',REZLEE_APPLE_NOTIFICATIONS_ENABLED:'true',REZLEE_MOBILE_SCREEN_SNAPSHOT_ENABLED:'true',REZLEE_HOME_SNAPSHOT_ENABLED:'true',REZLEE_MOBILE_AUTH_CONTEXT_ENABLED:'true',REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED:'true',REZLEE_MOBILE_READ_BUDGET_ENABLED:'true'};
 for(const name of ['REZLEE_APP_NOTIFICATIONS_ENABLED','REZLEE_EMAIL_CODE_ENABLED','REZLEE_BILL_RECORD_REVIEW','REZLEE_RECEIPT_DEDUP','REZLEE_STATEMENT_READING_ENABLED']) exact[name]='true';
 // Gmail remains explicitly gated until its separate verification work is complete.
 if(env.REZLEE_EMAIL_CAPTURE_ENABLED==='true'&&env.REZLEE_EMAIL_AI_PRIVACY_APPROVED!=='true')failures.push({name:'REZLEE_EMAIL_AI_PRIVACY_APPROVED',reason:'enabled_email_capture_requires_approval'});
 if(env.REZLEE_GMAIL_SCHEDULE_READY==='true'&&env.REZLEE_GMAIL_ENABLED!=='true')failures.push({name:'REZLEE_GMAIL_SCHEDULE_READY',reason:'gmail_schedule_requires_enabled_gmail'});
 for(const [name,expected] of Object.entries(exact))if(env[name]&&env[name].replace(/\/$/,'')!==expected)failures.push({name,reason:'does_not_match_production_contract'});
 function claims(key){try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{return null;}}
 for(const [name,role,prefix] of [['NEXT_PUBLIC_SUPABASE_ANON_KEY','anon','sb_publishable_'],['SUPABASE_SECRET_KEY','service_role','sb_secret_']]){
  const key=env[name]||'';if(!key||key.startsWith(prefix))continue;const c=claims(key);
  if(!c||c.role!==role||c.ref!==PRODUCTION_REF)failures.push({name,reason:'wrong_project_or_key_role'});
 }
 if(env.AI_ASSISTANT_PROVIDER){
  const p=env.AI_ASSISTANT_PROVIDER.toLowerCase(),google=Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),gateway=Boolean(env.AI_GATEWAY_API_KEY||env.VERCEL_OIDC_TOKEN);
  if(!['auto','google','gateway'].includes(p)||!(p==='google'?google:p==='gateway'?gateway:google||gateway))failures.push({name:'AI_ASSISTANT_PROVIDER',reason:'selected_provider_has_no_authentication'});
 }
 if(env.EZGB_PUBLIC_APP_URL&&env.EZGB_PUBLIC_APP_URL.replace(/\/$/,'')!=='https://rezlee.com')failures.push({name:'EZGB_PUBLIC_APP_URL',reason:'wrong_production_callback_origin'});
 if(env.REZLEE_GMAIL_ENABLED==='true'){
  for(const name of ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','REZLEE_GMAIL_ENCRYPTION_KEY'])if(!env[name])failures.push({name,reason:'enabled_gmail_requires_setting'});
  if(env.REZLEE_GMAIL_ENCRYPTION_KEY&&Buffer.from(env.REZLEE_GMAIL_ENCRYPTION_KEY,'base64').length!==32)failures.push({name:'REZLEE_GMAIL_ENCRYPTION_KEY',reason:'expected_32_byte_key'});
  if(env.REZLEE_EMAIL_AI_PRIVACY_APPROVED!=='true')failures.push({name:'REZLEE_EMAIL_AI_PRIVACY_APPROVED',reason:'enabled_gmail_requires_approval'});
 }
 if(env.REZLEE_DECK_LAUNCH_PROVIDERS){
  try{
   const providers=JSON.parse(env.REZLEE_DECK_LAUNCH_PROVIDERS);
   const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if(!Array.isArray(providers)||providers.length>100||new Set(providers.map(x=>x.registryId)).size!==providers.length||providers.some(x=>!x||!idPattern.test(x.registryId)||!/^src_[a-zA-Z0-9_-]{4,}$/.test(x.sourceId)||!/^task_[a-zA-Z0-9_-]{4,}$/.test(x.taskId)||!(x.agentId===null||typeof x.agentId==='string'&&/^agt_[a-zA-Z0-9_-]{4,}$/.test(x.agentId))||(()=>{const u=new URL(x.websiteUrl);return u.protocol!=='https:'||Boolean(u.username||u.password);})()))throw Error();
   if(!providers.length)failures.push({name:'REZLEE_DECK_LAUNCH_PROVIDERS',reason:'no_admitted_production_provider'});
  }catch{failures.push({name:'REZLEE_DECK_LAUNCH_PROVIDERS',reason:'invalid_provider_policy'});}
 }
 if(env.REZLEE_STORE_PRODUCTS){
  const products=env.REZLEE_STORE_PRODUCTS.split(',').map(x=>x.trim()).filter(Boolean);
  if(products.length<2||products.length>4||new Set(products).size!==products.length)failures.push({name:'REZLEE_STORE_PRODUCTS',reason:'expected_two_to_four_distinct_products'});
 }
 for(const name of requiredNames.filter(k=>k.endsWith('_ENABLED')||k.endsWith('_READY')||k.endsWith('_APPROVED')||['DECK_MOCK_MODE','REZLEE_AI_DISABLED','REVENUECAT_ALLOW_SANDBOX'].includes(k))){
  if(env[name]&&!['true','false'].includes(env[name]))failures.push({name,reason:'expected_explicit_boolean'});
 }
 return {ok:failures.length===0,failures,environment:'production',requiredNames};
}
async function verifyKeys(env,request=fetch){
 const config=validate(env);if(!config.ok)return config.failures;
 const errors=[];
 for(const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY']){
  try{
   const response=await request('https://'+PRODUCTION_REF+'.supabase.co/auth/v1/settings',{headers:{apikey:env[name]},signal:AbortSignal.timeout(8000)});
   if(!response.ok){errors.push({name,reason:'production_key_rejected'});continue;}
   const settings=await response.json();
   if(!['apple','google','email'].every(x=>settings.external?.[x]===true))errors.push({name:'production_auth_providers',reason:'expected_provider_not_enabled'});
  }catch{errors.push({name,reason:'production_key_check_unavailable'});}
 }
 return errors;
}
module.exports={required,requiredNames,validate,verifyKeys};
if(require.main===module){
 verifyKeys(process.env).then(errors=>{
  if(errors.length){console.error('Production release blocked: '+errors.map(x=>x.name+' ('+x.reason+')').join(', '));process.exitCode=1;return;}
  console.log('Production configuration and read-only key checks passed. Live integration acceptance remains required.');
 }).catch(()=>{console.error('Production configuration check failed. No credentials were logged.');process.exitCode=1;});
}

/* eslint-disable @typescript-eslint/no-require-imports -- This .cjs test intentionally exercises a CommonJS release guard. */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {validate,requiredNames,verifyKeys}=require('./verify-production-runtime.cjs');
function baseline(){
 const env=Object.fromEntries(requiredNames.map(k=>[k,'true']));
 Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:'https://eynbuhmtxkigvqoewbwi.supabase.co',NEXT_PUBLIC_APP_URL:'https://rezlee.com',NEXT_PUBLIC_SITE_URL:'https://rezlee.com',EZGB_PUBLIC_APP_URL:'https://rezlee.com',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',DECK_MOCK_MODE:'false',REZLEE_AI_DISABLED:'false',REZLEE_DECK_TESTING_ENABLED:'false',REVENUECAT_ALLOW_SANDBOX:'false',AI_ASSISTANT_PROVIDER:'gateway',VERCEL_OIDC_TOKEN:'synthetic-test-only',GMAIL_CLIENT_ID:'synthetic',GMAIL_CLIENT_SECRET:'synthetic',REZLEE_GMAIL_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64'),REZLEE_STORE_PRODUCTS:'com.rezlee.pro.monthly,com.rezlee.pro.annual',REZLEE_DECK_LAUNCH_PROVIDERS:JSON.stringify([{registryId:'00000000-0000-4000-8000-000000000001',sourceId:'src_test1',taskId:'task_test1',agentId:null,websiteUrl:'https://example.com'}])});
 return env;
}
test('complete production contract retains established EZGB secret fallback',()=>assert.equal(validate(baseline()).ok,true));
for(const [name,value] of [
 ['NEXT_PUBLIC_SUPABASE_URL','https://gjwvalpxnfbvryosmcbj.supabase.co'],
 ['EZGB_PUBLIC_APP_URL','https://staging.rezlee.com'],
 ['REVENUECAT_ALLOW_SANDBOX','true'],['REZLEE_DECK_TESTING_ENABLED','true'],
 ['REZLEE_DECK_LAUNCH_PROVIDERS','[]'],['REZLEE_GMAIL_ENABLED','false'],
 ['REZLEE_EMAIL_AI_PRIVACY_APPROVED','false'],['REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED','false'],
 ['GMAIL_CLIENT_SECRET',''],['REZLEE_GMAIL_ENCRYPTION_KEY','invalid'],['VERCEL_OIDC_TOKEN',''],
 ['REZLEE_APP_NOTIFICATIONS_ENABLED','false']
])test('rejects invalid '+name,()=>{const e=baseline();e[name]=value;assert.equal(validate(e).ok,false)});
test('legacy Supabase JWT from staging is rejected',()=>{const e=baseline();e.NEXT_PUBLIC_SUPABASE_ANON_KEY='x.'+Buffer.from(JSON.stringify({ref:'gjwvalpxnfbvryosmcbj',role:'anon'})).toString('base64url')+'.x';assert.equal(validate(e).ok,false)});
test('key verification stops before network on invalid config',async()=>{let calls=0;await verifyKeys({},async()=>{calls++;});assert.equal(calls,0)});
test('key acceptance still requires all three authentication methods',async()=>{const out=await verifyKeys(baseline(),async()=>({ok:true,json:async()=>({external:{apple:false,google:true,email:true}})}));assert(out.some(x=>x.name==='production_auth_providers'))});
test('read-only key verification accepts enabled auth providers',async()=>assert.equal((await verifyKeys(baseline(),async()=>({ok:true,json:async()=>({external:{apple:true,google:true,email:true}})}))).length,0));

const staging=require('./verify-staging-runtime.cjs');
function stage(){return {...baseline(),NEXT_PUBLIC_SUPABASE_URL:'https://gjwvalpxnfbvryosmcbj.supabase.co',NEXT_PUBLIC_APP_URL:'https://staging.rezlee.com',NEXT_PUBLIC_SITE_URL:'https://staging.rezlee.com',HOUSEHOLD_INVITE_BASE_URL:'https://staging.rezlee.com',EZGB_USER_IDENTIFIER_SECRET:'synthetic-only',REVENUECAT_ALLOW_SANDBOX:'true'};}
test('staging accepts explicit staging invitation origin',()=>assert.equal(staging.validate(stage()).ok,true));
test('staging rejects production invitation origin',()=>assert.equal(staging.validate({...stage(),HOUSEHOLD_INVITE_BASE_URL:'https://rezlee.com'}).ok,false));
test('staging rejects stale utility-test invitation origin',()=>assert.equal(staging.validate({...stage(),HOUSEHOLD_INVITE_BASE_URL:'https://ezgb-test.rezlee.com'}).ok,false));
test('staging rejects absent invitation origin instead of production fallback',()=>{const e=stage();delete e.HOUSEHOLD_INVITE_BASE_URL;assert.equal(staging.validate(e).ok,false)});

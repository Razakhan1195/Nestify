const fs=require('node:fs'),assert=require('node:assert/strict'),esbuild=require('esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root=process.cwd(),deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=root+'/docs/qa/apple-lifecycle-20261012/render';
const stubs={
'expo-router':'import React from "react";const router={replace:d=>window.__routes.push(d),push:d=>window.__routes.push(d),canGoBack:()=>false};export const useRouter=()=>router;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Stack={Screen:()=>null};',
'expo-router/react-navigation':'export const usePreventRemove=()=>{};',
'react-native-safe-area-context':'export {View as SafeAreaView} from "react-native";',
'expo-haptics':'export const ImpactFeedbackStyle={Light:"Light"};export const impactAsync=async()=>{};',
'expo-secure-store':'export const deleteItemAsync=async()=>{};',
'@expo/vector-icons':'export const Feather=()=>null;',
'@/auth/AuthProvider':'import React from "react";export function useAuth(){const[u,set]=React.useState(window.__user);React.useEffect(()=>{const f=()=>set(window.__user);window.addEventListener("qa-account",f);return()=>window.removeEventListener("qa-account",f)},[]);return React.useMemo(()=>({session:u?{user:{id:u,email:u+"@example.invalid",app_metadata:{provider:window.__scenario==="social"?"google":"email"}}}:null}),[u]);}',
'@/components/ScreenNavigation':'import React from "react";import{Text}from"react-native";export const ScreenNavigation=({title})=><Text>{title}</Text>;',
'@/auth/confirm-password':'export async function confirmAccountPassword(){window.__verifications++;if(window.__scenario==="wrong-password")throw Error("wrong");if(window.__scenario==="account-switch")await new Promise(r=>window.__resolvePassword=r);}',
'@/auth/email-code':`import{createEmailCodeFlow}from"${root}/apps/mobile/src/auth/email-code-core";export const emailCodeReady=["otp","email-login"].includes(window.__scenario);export const emailCode=createEmailCodeFlow({send:async()=>{},currentUser:async()=>window.__user,verify:async(_,code)=>{if(code!=="87654321")throw Error("Invalid");return{userId:window.__user||"00000000-0000-4000-8000-000000000001",session:{access_token:"fixture",refresh_token:"fixture"}}},apply:async()=>{window.__verifiedCode=true;}});`,
'@/lib/supabase':'export const supabase={auth:{getSession:async()=>({data:{session:window.__user?{user:{id:window.__user}}:null}}),signOut:async()=>{window.__signedOut++;window.__user=null;return{error:null}}}};',
'@/lib/api':'export class ApiError extends Error{constructor(message,status){super(message);this.status=status}};',
'@/lib/account-deletion':`import{ApiError}from"@/lib/api";import{createDeletionReceiptStore}from"${root}/apps/mobile/src/lib/account-deletion-receipt";
const store=createDeletionReceiptStore({getItemAsync:async k=>{if(window.__scenario==="corrupt")return "{broken";return sessionStorage.getItem(k)},setItemAsync:async(k,v)=>{if(window.__scenario==="storage-failure")throw Error("storage");sessionStorage.setItem(k,v)},deleteItemAsync:async k=>sessionStorage.removeItem(k)},async(userId,requestId)=>({userId,requestId:requestId||"11111111-1111-4111-8111-111111111111",receiptToken:"a".repeat(64)}));
export const readDeletionReceipt=(u)=>store.read(u);export const prepareDeletionReceipt=(u,r)=>store.prepare(u,r);export const clearDeletionReceipt=(u,r)=>store.clear(u,r);
export const deletionPreview=async()=>({enabled:window.__scenario!=="disabled",emailCodeAvailable:window.__scenario==="otp",impact:{homes:1,sharedMemberships:1,joinedHomes:1}});
export const deletionStatus=async r=>{if(window.__scenario==="offline")throw Error("network");const status=sessionStorage.getItem("qa-status");if(!status)throw new ApiError("missing",404);return{requestId:r.requestId,status,phase:"connections"};};
export const submitDeletion=async r=>{window.__submits.push(r);if(window.__scenario==="lost-response")throw Error("network");sessionStorage.setItem("qa-status","queued");return{requestId:r.requestId,status:"queued",phase:"connections"};};
window.__prepare=prepareDeletionReceipt;`,
'@/lib/inventory-create':'export const inventoryCreateStore={load:async()=>null,forget:async()=>{}};',
'@/lib/statement-batch':'export const statementBatches={removeAccount:async()=>{}};',
'@/lib/receipt-batch':'export const receiptBatches={removeAccount:async()=>{}};',
'@/lib/vault-pending':'export const vaultPending={clear:async()=>{}};',
'@/lib/statement-draft':'export const statementDrafts={clear:async()=>{}};',
'@/lib/onboarding-draft':'export const setupDrafts={clear:async()=>{}};'
};
(async()=>{
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{contents:`import React from"react";import{createRoot}from"react-dom/client";import{Alert,Linking}from"react-native";import Screen from"${root}/apps/mobile/app/delete-account.tsx";import EmailCode from"${root}/apps/mobile/app/(auth)/email-code.tsx";Linking.openURL=async url=>{window.__openedApple=url;};Alert.alert=(title,message,buttons)=>{window.__dialog={title,message};window.__confirm=()=>buttons.find(b=>b.style==="destructive").onPress()};createRoot(document.getElementById("root")).render(window.__scenario==="email-login"?<EmailCode/>:<Screen/>);`,loader:"tsx",resolveDir:root},outfile:out+'/screen.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=require('node:http').createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/screen.js'?'application/javascript':'text/html');res.end(req.url==='/screen.js'?fs.readFileSync(out+'/screen.js'):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/screen.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
try{
for(const width of [320,390,1280])for(const scenario of ['owner','disabled','corrupt','wrong-password','storage-failure','lost-response','account-switch','pending','completed','needs_attention','offline','social','otp','email-login']){
const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(({scenario})=>{window.__scenario=scenario;window.__user=scenario==="email-login"?null:"00000000-0000-4000-8000-000000000001";window.__routes=[];window.__submits=[];window.__verifications=0;window.__signedOut=0;
if(['pending','completed','needs_attention','offline'].includes(scenario)){const r={userId:window.__user,requestId:"11111111-1111-4111-8111-111111111111",receiptToken:"a".repeat(64)};sessionStorage.setItem("rezlee.account-deletion.v2."+r.userId,JSON.stringify(r));sessionStorage.setItem("rezlee.account-deletion.latest.v2",r.userId);sessionStorage.setItem("qa-status",scenario==="pending"||scenario==="offline"?"queued":scenario);}}, {scenario});
await page.goto(origin);
if(scenario==='email-login'){
await page.getByLabel('Account email',{exact:true}).fill('customer@example.invalid');await page.getByRole('button',{name:'Send code',exact:true}).click();
await page.getByLabel('Email code',{exact:true}).fill('87654321');await page.getByRole('button',{name:'Confirm code and sign in',exact:true}).click();await page.waitForFunction(()=>window.__routes.includes('/'));assert.equal(await page.evaluate(()=>window.__verifiedCode),true);
}else if(scenario==='otp'){
await page.getByRole('button',{name:'Use an email code instead',exact:true}).click();await page.getByRole('button',{name:'Send verification code',exact:true}).click();
await page.getByLabel('Email verification code',{exact:true}).fill('87654321');await page.getByLabel('Type DELETE to confirm',{exact:true}).fill('DELETE');await page.getByRole('button',{name:'Permanently delete account',exact:true}).click();await page.evaluate(()=>window.__confirm());await page.getByText('Your deletion is in progress',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__verifiedCode),true);
}else if(scenario==='disabled')await page.getByText('Deletion is not available in this build yet.',{exact:false}).waitFor();
else if(['corrupt','offline'].includes(scenario))await page.getByText('Your deletion has not been confirmed as complete.',{exact:false}).waitFor();
else if(scenario==='pending')await page.getByText('Your deletion is in progress',{exact:true}).waitFor();
else if(scenario==='needs_attention')await page.getByText('Deletion needs attention',{exact:true}).waitFor();
else if(scenario==='completed'){await page.getByText('Your account is deleted',{exact:true}).waitFor();await page.getByText('Used Sign in with Apple?',{exact:true}).waitFor();await page.getByRole('button',{name:'Open Apple Account',exact:true}).click();assert.equal(await page.evaluate(()=>window.__openedApple),'https://account.apple.com');await page.getByRole('button',{name:'Return to sign in',exact:true}).click();await page.waitForFunction(()=>window.__routes.includes('/(auth)/login'));assert.equal(await page.evaluate(()=>window.__signedOut),1);}
else if(scenario==='social'){await page.getByText('Email verification isn’t available in this build yet.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Permanently delete account',exact:true}).isEnabled(),false);}
else{
await page.getByLabel('Current password',{exact:true}).fill('FixturePassword!');
await page.getByLabel('Type DELETE to confirm',{exact:true}).fill('DELETE');
await page.getByRole('button',{name:'Permanently delete account',exact:true}).click();
assert.equal(await page.evaluate(()=>window.__submits.length),0,'confirmation does not submit before explicit destructive choice');
await page.evaluate(()=>window.__confirm());
if(scenario==='wrong-password'){await page.getByText('No new deletion request was submitted.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__submits.length),0);}
else if(scenario==='storage-failure'){await page.getByText('We couldn’t confirm your request.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__submits.length),0);}
else if(scenario==='account-switch'){await page.waitForFunction(()=>Boolean(window.__resolvePassword));await page.evaluate(()=>{window.__user="00000000-0000-4000-8000-000000000002";window.dispatchEvent(new Event("qa-account"));});await page.waitForFunction(()=>{const e=document.querySelector('input[aria-label="Current password"]');return e&&e.value===""&&!e.readOnly&&!e.disabled});await page.evaluate(()=>window.__resolvePassword());assert.equal(await page.evaluate(()=>window.__submits.length),0);assert.equal(await page.getByLabel('Current password',{exact:true}).inputValue(),'');}
else if(scenario==='lost-response'){
await page.getByText('We couldn’t confirm your request.',{exact:false}).waitFor();
const first=await page.evaluate(()=>window.__submits[0]);await page.reload();
await page.getByText('The previous request hasn’t been confirmed.',{exact:false}).waitFor();
await page.getByLabel('Current password',{exact:true}).fill('FixturePassword!');await page.getByLabel('Type DELETE to confirm',{exact:true}).fill('DELETE');await page.getByRole('button',{name:'Permanently delete account',exact:true}).click();await page.evaluate(()=>{window.__scenario='owner';window.__confirm()});await page.getByText('Your deletion is in progress',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__submits[0]),first);
}else await page.getByText('Your deletion is in progress',{exact:true}).waitFor();
}
assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',fullPage:true});checks.push({scenario,width,pass:true});await page.close();
}
fs.writeFileSync(out+'/results.json',JSON.stringify({layer:'Actual React Native screens rendered in Chromium with mocked auth/network/OS boundaries; no native acceptance claimed',checks},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});

const fs=require('node:fs'),esbuild=require('esbuild'),{chromium}=require('/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core');
const root=process.cwd(),deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules',out=process.env.REZLEE_QA_OUTPUT||root+'/docs/checkpoints/experience-audit-20261024/extended/render-auth-entry-recovery';
const stubs={
'@/lib/expense-group-invites':`export const readIncomingGroupInvite=async()=>null;`,
'expo-haptics':`export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:'Light'};`,
'@/auth/useAccountSwitch':`const switching={current:false};export const useAccountSwitch=()=>({busy:false,error:null,switching,switchAccount:async()=>{window.__destinations.push("/(auth)/login")}});`,
'expo-router':'import React from"react";export function Redirect({href}){React.useEffect(()=>{window.__destinations.push(href)},[href]);return React.createElement("p",{"data-testid":"destination"},href)};',
'@/auth/AuthProvider':'import React from"react";export function useAuth(){const[state,setState]=React.useState({user:window.__user,loading:window.__authLoading});React.useEffect(()=>{const update=()=>setState({user:window.__user,loading:window.__authLoading});window.addEventListener("qa-auth",update);return()=>window.removeEventListener("qa-auth",update)},[]);return{session:state.user?{user:{id:state.user}}:null,isLoading:state.loading};}',
'@/lib/account-deletion':'export async function readDeletionReceipt(){window.__calls.receipt++;const user=window.__user;if(window.__receiptFail)throw Error("Private storage exception");if(window.__holdReceipt&&user==="owner-a")return await new Promise(resolve=>window.__releaseReceipt=()=>resolve({userId:user}));return window.__receipt;}',
'@/lib/phone-invites':'export async function readIncomingPhoneInvite(){window.__calls.invitation++;if(window.__inviteFail)throw Error("Private invite read");return window.__invite;}',
'@/lib/onboarding-data':'export async function fetchOnboarding(){window.__calls.onboarding++;if(window.__offline)throw Error("Private network exception");if(window.__holdOnboarding)return await new Promise(resolve=>window.__releaseOnboarding=()=>resolve({home:{id:"home-a"},accessRole:"owner"}));return window.__user==="owner-b"||window.__newHome?{home:null,accessRole:"owner"}:{home:{id:"home-a"},accessRole:window.__member?"member":"owner"};}',
'@/lib/onboarding-draft':'export const setupDrafts={read:async id=>{window.__calls.draft.push(id);if(window.__draftFail)throw Error("Optional draft unavailable");return window.__draft;}};',
'@/lib/api':'export class ApiError extends Error {};',
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const entry=`import React from'react';import{createRoot}from'react-dom/client';import Screen from'${process.env.REZLEE_QA_ENTRY||root+'/apps/mobile/app/index.tsx'}';createRoot(document.getElementById('root')).render(<Screen/>);`;
 await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
 fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
 const server=require('node:http').createServer((req,res)=>{const f=req.url==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 const scenarios=['receipt-failed','signed-out-receipt-failed','invitation-failed','signed-out','deletion-signed-out','deletion-owner','foreign-receipt','invitation','new-household','optional-draft-failed','member-draft','owner-draft','account-switch','late-receipt','auth-loading'];
 for(const width of [320,390])for(const scenario of scenarios){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{
   window.__calls={receipt:0,invitation:0,onboarding:0,draft:[]};window.__destinations=[];
   window.__user=['signed-out','deletion-signed-out','signed-out-receipt-failed'].includes(s)?null:'owner-a';
   window.__receipt=['deletion-signed-out','deletion-owner','foreign-receipt'].includes(s)?{userId:s==='foreign-receipt'?'someone-else':'owner-a'}:null;
   window.__receiptFail=['receipt-failed','signed-out-receipt-failed'].includes(s);
   window.__inviteFail=s==='invitation-failed';window.__invite=['invitation','invitation-failed'].includes(s)?'a'.repeat(64):null;
   window.__offline=s==='offline';window.__newHome=s==='new-household';window.__draftFail=s==='optional-draft-failed';window.__member=s==='member-draft';
   window.__draft=['member-draft','owner-draft'].includes(s)?{phase:'choose',homeId:'home-a'}:null;
   window.__holdReceipt=s==='late-receipt';window.__holdOnboarding=s==='sign-out-during-fetch';window.__authLoading=s==='auth-loading';
  },scenario);
  await page.goto('http://127.0.0.1:'+server.address().port);
  let expected='/(tabs)/home';
  if(['receipt-failed','signed-out-receipt-failed','invitation-failed','offline'].includes(scenario)){
   await page.getByText('Could not load Rezlee',{exact:true}).waitFor();
   const before=await page.evaluate(()=>({calls:window.__calls,destinations:window.__destinations}));
   if(before.destinations.length)throw Error('Navigation bypassed failed recovery read');
   if(scenario!=='offline'&&before.calls.onboarding)throw Error('Onboarding fetched before recovery checks passed');
   if((await page.locator('body').innerText()).includes('Private'))throw Error('Internal exception exposed');
   await page.screenshot({path:out+'/'+scenario+'-'+width+'.png'});
   await page.evaluate(()=>{window.__receiptFail=false;window.__inviteFail=false;window.__offline=false;});
   await page.getByRole('button',{name:'Try again',exact:true}).click();
   if(scenario==='invitation-failed')expected='/household/join';
   if(scenario==='signed-out-receipt-failed')expected='/(auth)/welcome';
  }
  if(scenario==='auth-loading'){
   if(await page.evaluate(()=>window.__calls.receipt))throw Error('Read recovery before auth resolved');
   await page.evaluate(()=>{window.__authLoading=false;window.dispatchEvent(new Event('qa-auth'));});
  }
  if(scenario==='account-switch'){
   await page.getByTestId('destination').filter({hasText:'/(tabs)/home'}).waitFor();
   await page.evaluate(()=>{window.__user='owner-b';window.dispatchEvent(new Event('qa-auth'));});
   expected='/(tabs)/home';
  }
  if(scenario==='late-receipt'){
   await page.waitForFunction(()=>window.__releaseReceipt);
   await page.evaluate(()=>{window.__user='owner-b';window.dispatchEvent(new Event('qa-auth'));});
   await page.getByTestId('destination').filter({hasText:'/(tabs)/home'}).waitFor();
   await page.evaluate(async()=>{window.__releaseReceipt();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   if(await page.evaluate(()=>window.__destinations.includes('/delete-account')))throw Error('Old receipt redirected new account');
   expected='/(tabs)/home';
  }
  if(scenario==='sign-out-during-fetch'){
   await page.waitForFunction(()=>window.__releaseOnboarding);
   await page.evaluate(()=>{window.__user=null;window.dispatchEvent(new Event('qa-auth'));});
   await page.getByTestId('destination').filter({hasText:'/(auth)/welcome'}).waitFor();
   await page.evaluate(async()=>{window.__releaseOnboarding();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   if(await page.evaluate(()=>window.__destinations.includes('/(tabs)/home')))throw Error('Late response routed signed-out user home');
   expected='/(auth)/welcome';
  }
  if(scenario==='signed-out')expected='/(auth)/welcome';
  if(scenario.startsWith('deletion-'))expected='/delete-account';
  if(scenario==='invitation')expected='/household/join';
  if(['new-household','owner-draft'].includes(scenario))expected='/(tabs)/home';
  try{await page.waitForFunction(value=>document.querySelector('[data-testid="destination"]')?.textContent===value,expected);}catch{throw Error(scenario+' expected '+expected+'; body '+await page.locator('body').innerText()+'; errors '+errors.join('; '));}
  const calls=await page.evaluate(()=>window.__calls);
  if(['receipt-failed','signed-out-receipt-failed','invitation-failed','offline'].includes(scenario)&&calls.receipt!==2)throw Error('Retry did not repeat recovery checks');
  if(['invitation','invitation-failed'].includes(scenario)&&calls.onboarding)throw Error('Saved invitation lost to onboarding');
  if(errors.length)throw Error(errors.join('; '));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
  checks.push({width,scenario,expected,calls,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({checks,passed:checks.length,boundaries:'Actual startup component, setup decision and loading view; simulated auth, storage, network and router destinations. No external requests.'},null,2));
 console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const esbuild=require(root+'/node_modules/esbuild'),{chromium}=require(deps+'/playwright-core');
const out='/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/experience-audit-20261024/remaining/ezgb-system-browser';
fs.mkdirSync(out,{recursive:true});
(async()=>{
const bridgeEntry='window.__handoff=url=>{window.__nativeReturn=url;};import React from"react";import{createRoot}from"react-dom/client";import{EzgbBrowserStart,EzgbBrowserReturn}from"'+root+'/src/components/integrations/ezgb-browser-bridge";const mode=location.pathname.slice(1);createRoot(document.getElementById("root")).render(<React.StrictMode>{mode==="start"?<><h1>Connect your utility</h1><EzgbBrowserStart/><a href="/utility">Fixture utility</a></>:mode==="utility"?<><h1>Fixture utility consent</h1><a href="/success">Complete fixture</a></>:<><h1>{mode==="success"?"Your utility is connecting":"Connection wasn’t completed"}</h1><EzgbBrowserReturn outcome={mode==="success"?"success":"error"}/></>}</React.StrictMode>);';
await esbuild.build({stdin:{contents:bridgeEntry,loader:'tsx',resolveDir:root},outfile:out+'/bridge.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom'},define:{'process.env.NODE_ENV':'"development"','window.location.assign':'window.__handoff'}});
const stubs={
 'react-native-keyboard-controller': `export {ScrollView as KeyboardAwareScrollView} from 'react-native';export const KeyboardToolbar=()=>null;`,
'expo-router':'export const useLocalSearchParams=()=>({utilityName:"Elexicon Energy"});export const useRouter=()=>window.__router??(window.__router=({replace:p=>window.__actions.push(p),push:p=>window.__actions.push(p),back:()=>{},canGoBack:()=>false}));',
'expo-router/react-navigation':'export const useIsFocused=()=>true;export const usePreventRemove=()=>{};',
'expo-symbols':'import React from"react";export const SymbolView=()=>React.createElement("span",null,"×");',
'expo-haptics':'export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:1};export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};',
'react-native-safe-area-context':'import{View}from"react-native";export const SafeAreaView=View;export const SafeAreaProvider=View;',
'react-native-webview':'export const WebView=()=>null;',
'@expo/vector-icons':'import React from"react";export function Feather(){return React.createElement("span",null,"✓");}',
'@/auth/AuthProvider':'export const useAuth=()=>({session:{user:{id:"fixture-owner"}}});',
'@/lib/api':'export class ApiError extends Error{};export const apiGet=async()=>({needsOnboarding:false,bills:[],utilityInsights:[]});export const apiPost=async()=>({});export const apiPatch=async()=>({});export const apiDelete=async()=>({});export const apiFormPost=async()=>({});',
'@/lib/ezgb-browser':'export const canResumeEzgbBrowserConnection=async()=>false;export const resumeEzgbBrowserConnection=async()=>{throw Error("Unexpected recovery")};export const checkEzgbExistingConnection=async()=>{throw Error("Unexpected check")};export const ezgbSystemBrowserAvailable=true;export function startEzgbBrowser(){window.__starts++;return new Promise((res,rej)=>{window.__browserResolve=res;window.__browserReject=rej;});}',
'@/lib/ezgb-data':'export const cancelEzgbCheck=async()=>{throw Error("Unexpected cancel")};export const retryEzgbConnection=async()=>{throw Error("Unexpected retry")};export const fetchEzgbAuthorization=async()=>({});export const syncEzgb=async()=>{window.__pulls++;return window.__sync;};export const fetchEzgbSyncStatus=async()=>window.__sync;',
};
await esbuild.build({stdin:{contents:'import React from"react";import{createRoot}from"react-dom/client";import Screen from"'+root+'/apps/mobile/app/provider/ezgb";window.__starts=0;window.__pulls=0;window.__actions=[];createRoot(document.getElementById("root")).render(<Screen/>);',resolveDir:root,loader:'tsx'},outfile:out+'/mobile.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.jpg':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},
plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
const server=http.createServer((req,res)=>{
const path=req.url.split('?')[0];if(path.endsWith('.js')){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+path));}
res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#F7F4EC;color:#1E352B}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}h1{font-size:26px;margin:24px}a{display:block;padding:16px;margin:20px;background:#244A3A;color:white;border-radius:16px}p{padding:20px}</style><div id="root"></div><script src="/'+(path==='/mobile'?'mobile':'bridge')+'.js"></script>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>console.log('FIXTURE PAGE ERROR',e.message));
 const marker='11111111-1111-4111-8111-111111111111';
 await page.goto(base+'/start#rezleeAttempt='+marker);
 await page.getByText('Fixture utility',{exact:true}).waitFor();
 await page.waitForFunction(()=>!location.hash);
 assert.equal((await page.evaluate(()=>sessionStorage.getItem('rezlee.ezgb.browser.v1'))).includes(marker),true);
 checks.push('React StrictMode retains marker after removing the URL fragment');
 await page.getByText('Fixture utility',{exact:true}).click();
 await page.getByText('Complete fixture',{exact:true}).click();
 const returnLink=page.getByRole('link',{name:'Return to Rezlee'});
 await returnLink.waitFor();assert.equal(await returnLink.getAttribute('href'),'rezlee://ezgb-return?attempt='+marker+'&outcome=success');
 await page.screenshot({path:out+'/browser-return-390.png',fullPage:true});checks.push('Same-tab utility navigation preserves the return marker and exposes the correct app link');
 await page.goto(base+'/error');await returnLink.waitFor();assert.match(await returnLink.getAttribute('href'),/outcome=error$/);checks.push('Error callback returns an error outcome');
 await page.context().clearCookies();await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.getByText('Return to the Rezlee app.',{exact:false}).waitFor();assert.equal(await page.getByRole('link',{name:'Return to Rezlee'}).count(),0);checks.push('No marker cannot manufacture a successful native return');
 for(const scenario of ['cancel','error','success']){
  await page.goto(base+'/mobile');await page.getByText('Continue with Green Button',{exact:true}).click();
  await page.getByText('Continue in your browser',{exact:true}).waitFor();
  if(scenario==='cancel')await page.evaluate(()=>window.__browserResolve(null));
  else if(scenario==='error')await page.evaluate(()=>window.__browserReject(Error('The utility did not finish authorizing. You can start again.')));
  else await page.evaluate(()=>{window.__sync={ready:true,status:'succeeded',jobId:'fixture-job',stats:{billsImported:1,integrationsConnected:1},connection:{expectedUtility:'Elexicon Energy',phase:'bills_ready',utilities:['Elexicon Energy'],providerIds:['fixture-provider'],canRetry:false}};window.__browserResolve(window.__sync);});
  try{if(scenario==='success')await page.waitForFunction(()=>window.__actions.includes('/(tabs)/home'));else await page.getByText('Connection not finished',{exact:true}).waitFor({timeout:8000});}catch(e){console.log('SCENARIO',scenario,await page.locator('body').innerText());throw e;}
  assert.equal(await page.evaluate(()=>window.__pulls),0);assert.equal(await page.evaluate(()=>window.__starts),1);
  await page.screenshot({path:out+'/mobile-'+scenario+'-390.png',fullPage:true});
  checks.push('Native '+scenario+' screen renders and does not issue an extra import');
 }
 await page.setViewportSize({width:320,height:740});await page.goto(base+'/mobile');await page.getByText('Continue with Green Button',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=320),true);checks.push('320px introduction has no horizontal overflow');
 fs.writeFileSync(out+'/results.json',JSON.stringify({checks,liveUtilityAuthorization:false},null,2));console.log(JSON.stringify({checks,liveUtilityAuthorization:false},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

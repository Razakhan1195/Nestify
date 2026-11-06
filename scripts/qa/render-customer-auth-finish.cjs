const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root=process.cwd(),deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=process.env.REZLEE_QA_OUTPUT||root+'/docs/qa/customer-auth-finish-20261012';
const component=(name)=>'import React from "react";import {Text} from "react-native";export function '+name+'(){return <Text>'+name+'</Text>}';
const stubs={
'expo-router':'import React from"react";export const useRouter=()=>({push:d=>window.__routes.push(d),replace:d=>window.__routes.push(d),back:()=>{},setParams:()=>{}});export const useLocalSearchParams=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;',
'react-native-safe-area-context':'export {View as SafeAreaView} from "react-native";',
'expo-haptics':'export const ImpactFeedbackStyle={Light:"Light"};export const impactAsync=async()=>{};',
'@expo/vector-icons':'export const Feather=()=>null;',
'@/auth/AuthProvider':'export const useAuth=()=>({session:null});',
'@/components/ScreenNavigation':'import React from "react";import {Text} from "react-native";export const ScreenNavigation=({title})=><Text>{title}</Text>;',
'@/auth/recovery-client':`import {createPasswordRecovery} from "${root}/apps/mobile/src/auth/password-recovery.ts";
let current=null;
const saved=()=>JSON.parse(sessionStorage.getItem('qa-record')||'null');
window.__attempts=0;window.__sends=0;
export const passwordRecovery=createPasswordRecovery({
now:()=>Date.now()+(window.__offset||0),
read:async()=>saved(),write:async r=>{if(window.__writeFail&&r.stage==='verified')throw Error('Private storage');sessionStorage.setItem('qa-record',JSON.stringify(r));},
clear:async()=>{sessionStorage.removeItem('qa-record');sessionStorage.removeItem('qa-session');},
auth:{request:async()=>{window.__sends++;return{error:null}},
verifyCode:async(email,token)=>{window.__attempts++;if(window.__offline)throw Error('Private connection');
if(token!=='87654321')return{user:null,error:{status:403}};current={id:'fixture-user',email:window.__wrongAccount?'other@example.invalid':email};sessionStorage.setItem('qa-session',JSON.stringify(current));return{user:current,error:null};},
exchange:async()=>({user:null,error:{status:403}}),
user:async()=>({user:JSON.parse(sessionStorage.getItem('qa-session')||'null'),error:null}),
update:async()=>({error:null})}});
window.__flow=passwordRecovery;`,
'@/lib/home-data':'export const fetchHome=async()=>({needsOnboarding:false,accessRole:window.__scenario==="member"?"member":"owner",home:{id:"fixture-home",nickname:"Our home"},availability:{missing:[]},attentionItems:[],dashboardState:"EMPTY"});',
'@/lib/bills-data':'export const fetchBills=async()=>({needsOnboarding:false,providerActivity:[],utilityInsights:[]});',
'@/lib/vault-data':'export const fetchVault=async()=>({needsOnboarding:false,items:window.__scenario==="empty"?[]:[{id:"fixture-item"}],documents:[]});export const formatVaultDate=v=>v;',
'@/lib/care-data':'export const fetchCare=async()=>({needsOnboarding:false});',
'@/lib/home-task-state':'export const homeTaskStates=()=>({bills:"saved",records:"saved",care:"saved"});export const remainingHomeTasks=()=>[];',
'@/lib/home-overview':'export const homeOverviewState=()=>({showTaskTiles:false,partial:false,verifiedEmpty:false});export const homeUpcomingItems=()=>[];export const homeUpcomingHref=()=>"";',
'@/lib/bill-account-overview':'export const billAccountOverview=()=>[];',
'@/lib/tab-events':'export const subscribeHomeTabPress=()=>()=>{};',
'@/components/Brief':'export const BriefRow=()=>null;export const ReadNotice=()=>null;',
'@/components/WorkspaceUI':'import React from "react";export const HomeQuickActions=()=>null;export const SectionHeading=()=>null;export const HomeGreeting=()=><div>Our home</div>;export const HomeSection=({children})=><div>{children}</div>;',
'@/components/BillAccountBrief':'export const HomeBillBrief=()=>null;'
};
for(const name of ['HomeBrief','HomeUtilityProgress','HomeSharedExpenses','RecallWatchSummary','HomeStartJourney','HomeAssistantTile'])stubs['@/components/'+name]=component(name);
async function bundle(name,file){
 await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Screen from'${file}';createRoot(document.getElementById('root')).render(<Screen/>);`,loader:'tsx',resolveDir:root},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await bundle('home',root+'/apps/mobile/app/(tabs)/home.tsx');
 await bundle('home-before','/tmp/rezlee-home-before-20261012.tsx');
 await bundle('recovery',root+'/apps/mobile/app/(auth)/forgot-password.tsx');
 const template=fs.readFileSync(root+'/supabase/templates/recovery.html','utf8').replace('{{ .Token }}','87654321').replace('{{ .ConfirmationURL }}','#preview');
 fs.writeFileSync(out+'/email.html',template);
 const server=require('node:http').createServer((req,res)=>{
  const name=req.url.split('?')[0].slice(1);
  if(name.endsWith('.js')||name==='email.html'){res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'text/html');return res.end(fs.readFileSync(out+'/'+path.basename(name)));}
  const screen=name||'recovery';res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+screen+'.js"></script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
  for(const width of [320,390])for(const scenario of ['populated','empty','member','before']){
   const page=await browser.newPage({viewport:{width,height:844}}),warnings=[],errors=[];
   page.on('console',m=>{if(m.type()==='error')warnings.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(s=>{window.__scenario=s;window.__routes=[]},scenario);
   await page.goto(origin+'/'+(scenario==='before'?'home-before':'home'));
   await page.getByText('HomeSharedExpenses',{exact:true}).waitFor();
   if(['populated','before'].includes(scenario))await page.getByText('RecallWatchSummary',{exact:true}).waitFor();
   const collisions=warnings.filter(s=>s.includes('same key'));
   if(scenario==='before'?!collisions.length:collisions.length)throw Error(scenario+' key warning regression failed');
   if(errors.length)throw Error(errors.join(';'));
   checks.push({width,scenario:'home-'+scenario,duplicateWarnings:collisions.length,pass:true});await page.close();
  }
  for(const width of [320,390])for(const scenario of ['normal','restart','offline','interrupted','expired','wrong-account']){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.__routes=[]});
   await page.goto(origin+'/recovery');await page.getByRole('textbox',{name:'Email',exact:true}).fill('person@example.invalid');
   await page.getByRole('button',{name:'Send reset email',exact:true}).click();
   await page.getByRole('textbox',{name:'Reset code',exact:true}).waitFor();
   if(scenario==='restart'){await page.reload();await page.getByRole('textbox',{name:'Reset code',exact:true}).waitFor();}
   if(scenario==='normal'){
    await page.getByRole('textbox',{name:'Reset code',exact:true}).fill('123456');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.getByText('That code could not be verified.',{exact:false}).waitFor();
    await page.screenshot({path:out+'/wrong-code-'+width+'.png'});
   }
   await page.evaluate(s=>{window.__offline=s==='offline';window.__writeFail=s==='interrupted';window.__wrongAccount=s==='wrong-account';if(s==='expired')window.__offset=21*60*1000;},scenario);
   await page.getByRole('textbox',{name:'Reset code',exact:true}).fill('87654321');
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   if(['expired','wrong-account'].includes(scenario)){
    await page.getByText('This reset has expired or cannot be used here.',{exact:false}).waitFor();
    if(await page.evaluate(()=>window.__routes.length))throw Error('Invalid recovery navigated to password entry');
   }else if(['offline','interrupted'].includes(scenario)){
    await page.getByRole('button',{name:'Restore recovery',exact:true}).waitFor();
    if(scenario==='interrupted'){
     await page.reload();await page.getByRole('button',{name:'Continue password recovery',exact:true}).click();
    }else{
     await page.evaluate(()=>{window.__offline=false});await page.getByRole('button',{name:'Restore recovery',exact:true}).click();
     await page.getByRole('textbox',{name:'Reset code',exact:true}).fill('87654321');
     await page.getByRole('button',{name:'Continue',exact:true}).click();
    }
    await page.waitForFunction(()=>window.__routes.includes('/reset-password'));
   }else await page.waitForFunction(()=>window.__routes.includes('/reset-password'));
   if(errors.length)throw Error(errors.join(';'));
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
   checks.push({width,scenario:'recovery-'+scenario,pass:true});await page.close();
  }
  for(const width of [320,390]){
   const page=await browser.newPage({viewport:{width,height:844}});
   await page.goto(origin+'/recovery');await page.getByRole('textbox',{name:'Email',exact:true}).fill('person@example.invalid');
   await page.screenshot({path:out+'/request-'+width+'.png'});
   await page.getByRole('button',{name:'Send reset email',exact:true}).click();await page.getByRole('textbox',{name:'Reset code',exact:true}).waitFor();
   await page.screenshot({path:out+'/code-'+width+'.png'});
   await page.goto(origin+'/email.html');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Email overflow');
   await page.screenshot({path:out+'/email-'+width+'.png',fullPage:true});
   checks.push({width,scenario:'email-layout',pass:true});await page.close();
  }
  fs.writeFileSync(out+'/results.json',JSON.stringify({passed:checks.length,checks,boundaries:'Actual Home parent and password-help screen/controller/components, React development warnings; mocked child panels, data/auth/secure storage/router; browser render is not physical-device acceptance.'},null,2));
  console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

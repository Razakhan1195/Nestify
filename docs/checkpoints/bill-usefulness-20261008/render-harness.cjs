const fs=require('node:fs'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=root+'/docs/qa/bill-usefulness-20261008';
const stubs={
'expo-router':'import React from "react";export const useLocalSearchParams=()=>({providerId:"gas-account"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),setParams:()=>{},canGoBack:()=>false});export const Stack={Screen:()=>null};export const useNavigation=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);',
'expo-router/react-navigation':'export const usePreventRemove=()=>{};',
'expo-symbols':'import React from "react";export const SymbolView=()=>React.createElement("span",null,"←");',
'expo-haptics':'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:1};',
'react-native-safe-area-context':'import React from "react";import{View}from"react-native";export const SafeAreaView=View;export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',
'@expo/vector-icons':'import React from "react";export function Feather({name}){return React.createElement("span",{"aria-hidden":true,style:{fontSize:18,width:20}},name==="file-text"?"▤":"›");}',
'@/lib/api':'export class ApiError extends Error{};export async function apiGet(p){if(p.endsWith("/original")){window.__actions.push("original");return{url:"https://example.invalid/fixture-original"}}return window.__payload;}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};',
};

stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status,details){super(message);this.status=status;this.details=details;}};export async function apiGet(p){window.__requests.push(p);if(window.__fail)throw new ApiError('Offline',503);if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay));if(p==='/api/mobile/v1/bills')return window.__payload;throw new ApiError('No readings',404,{code:'missing_readings'});}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};`;
stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:null});';
stubs['@/components/AppNotifications']='export const NotificationBell=()=>null;';
stubs['@/components/ProfileUI']='export const ProfileBadge=()=>null;';
(async()=>{
fs.mkdirSync(out,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{ScrollView,View}from'react-native';import Screen from '${root}/apps/mobile/app/utility/[providerId]';import{SavedBillInsights}from'${root}/apps/mobile/src/components/SavedBillInsights';import{manualHistoryAccounts}from'${root}/apps/mobile/src/lib/manual-history-insights';import{buildUtilityInsights}from'${root}/src/lib/ezgb/analytics';window.__actions=[];window.__requests=[];window.__payload={needsOnboarding:false,bills:[],utilityInsights:buildUtilityInsights(window.__rows,[],{today:'2026-10-08',complete:window.__complete}),historyCoverage:{complete:window.__complete}};const onOpen=id=>window.__actions.push(id);createRoot(document.getElementById('root')).render(window.__manual?<ScrollView><View style={{padding:20}}><SavedBillInsights account={manualHistoryAccounts(window.__manual)[0]} complete={window.__complete} today='2026-10-08' onOpen={onOpen} onDetails={onOpen} onAdd={()=>{}}/></View></ScrollView>:<Screen/>);`;
await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,loader:{'.png':'dataurl'},platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path==='./api')return{path:'@/lib/api',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
const jan={id:'jan',providerId:'gas-account',providerName:'Enbridge Gas',category:'Natural gas',categoryId:'gas',amount:124,periodStart:'2026-01-01',periodEnd:'2026-01-31',issueDate:null,usage:310,usageUnit:'m3',currency:'CAD'};
const feb={...jan,id:'feb',amount:112,periodStart:'2026-02-01',periodEnd:'2026-02-28',usage:280};
const manual=[jan,feb].map(b=>({...b,label:'Rogers',providerName:'Rogers',providerId:null,category:'Internet',categoryId:'internet_phone',accountNumber:'Isolated preview',source:'manual',isHistoricalStatement:true,billingPeriodStart:b.periodStart,billingPeriodEnd:b.periodEnd,originalDocumentId:'original',reviewedEvidence:null}));
const server=require('node:http').createServer((req,res)=>{const f=req.url.split('?')[0]==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const checks=[];
try{
for(const width of [320,390,430])for(const scenario of ['gas','manual','one','partial','electric','failure','empty','loading']){
const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(({rows,manual,scenario})=>{window.__rows=rows;window.__manual=scenario==='manual'?manual:null;window.__complete=scenario!=='partial';window.__fail=scenario==='failure';window.__delay=scenario==='loading'?1200:0;},{rows:scenario==='empty'?[]:scenario==='one'?[jan]:scenario==='electric'?[jan,feb].map(b=>({...b,categoryId:'electricity',category:'Electricity',providerName:'Elexicon',usageUnit:'kWh'})):[jan,feb],manual,scenario});
await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(350);
await page.screenshot({path:out+'/'+scenario+'-top-'+width+'.png',fullPage:true,animations:'disabled'});
let body=await page.locator('body').innerText();
if(scenario==='failure'){await page.evaluate(()=>window.__fail=false);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('What changed',{exact:true}).waitFor();}if(scenario==='loading'){await page.getByText('What changed',{exact:true}).waitFor();}
if(scenario==='manual'){
 const history=page.getByRole('button',{name:/History/});if(await history.count())await history.first().click();
 await page.getByRole('button',{name:'Previous statement',exact:true}).click();
 await page.getByRole('button',{name:/View Jan.*statement/}).click();
 if(!(await page.evaluate(()=>window.__actions)).includes('jan'))throw Error('Manual selection wrong');
}else if(['gas','electric'].includes(scenario)){
 await page.getByRole('button',{name:'Previous statement',exact:true}).click();
 await page.getByRole('button',{name:/View Jan.*statement/}).click();
 const acts=JSON.stringify(await page.evaluate(()=>window.__actions));if(!acts.includes('jan'))throw Error('Connected selection wrong');
 if(scenario==='gas'&&(body.includes('Compare electricity plans')||(await page.evaluate(()=>window.__requests)).some(p=>p.includes('intelligence'))))throw Error('Gas hit electricity path');
}
await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',fullPage:true,animations:'disabled'});
checks.push({width,scenario,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors,requests:await page.evaluate(()=>window.__requests)});await page.close();
}
}finally{await browser.close();server.close();}
fs.writeFileSync(out+'/render-results.json',JSON.stringify({checks,method:'Actual React Native components through React Native Web. Explicit synthetic fixtures and API/router/native boundary mocks. Not device acceptance.'},null,2));if(checks.some(c=>c.overflow||c.errors.length))throw Error(JSON.stringify(checks));console.log('Passed '+checks.length+' rendered interaction scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1});

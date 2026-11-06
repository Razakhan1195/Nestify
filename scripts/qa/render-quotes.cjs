const fs=require('node:fs'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=root+'/docs/qa/quote-files-live-20261011';
const stubs={
'expo-router':'import React from "react";export const useLocalSearchParams=()=>({providerId:"gas-account"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),setParams:()=>{},canGoBack:()=>false});export const Stack={Screen:()=>null};export const useNavigation=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);',
'expo-router/react-navigation':'export const usePreventRemove=()=>{};',
'expo-symbols':'import React from "react";export const SymbolView=()=>React.createElement("span",null,"←");',
'expo-haptics':'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:1};',
'react-native-safe-area-context':'import React from "react";import{View}from"react-native";export const SafeAreaView=View;export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',
'@expo/vector-icons':'import React from "react";export function Feather({name}){return React.createElement("span",{"aria-hidden":true,style:{fontSize:18,width:20}},name==="file-text"?"▤":"›");}',
'@/lib/api':'export class ApiError extends Error{};export async function apiGet(p){if(p.endsWith("/original")){window.__actions.push("original");return{url:"https://example.invalid/fixture-original"}}return window.__payload;}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};',
};

stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}};export async function apiGet(){if(window.__getFail)throw new ApiError('Offline',503);return structuredClone(window.__payload);}export async function apiPatch(p,body){window.__writes.push(body);if(window.__patchMode==='validation')throw new ApiError('Check the effective date',400);if(window.__patchMode==='lost-unchanged')throw new ApiError('Timeout',408);if(window.__patchMode==='lost-conflict'){window.__payload={...window.__payload,version:'other',target:{...window.__payload.target,notes:'Edited elsewhere'}};throw new ApiError('Timeout',408);}window.__payload=window.__savedPayload(body);if(window.__patchMode==='lost-saved')throw new ApiError('Timeout',408);return structuredClone(window.__payload);}`;
stubs['expo-router']='import React from "react";export const Stack={Screen:()=>null};export const useLocalSearchParams=()=>({billId:"base"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});export const useNavigation=()=>({dispatch:p=>window.__actions.push(p)});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:null});';
stubs['@/components/AppNotifications']='export const NotificationBell=()=>null;';
stubs['@/components/ProfileUI']='export const ProfileBadge=()=>null;';

stubs['expo-router']='import React from "react";export const Stack={Screen:()=>null};export const useLocalSearchParams=()=>window.__params;export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});export const useNavigation=()=>({dispatch:p=>window.__actions.push(p)});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['expo-crypto']='export const randomUUID=()=>crypto.randomUUID();';
stubs['@/lib/api']='export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}};export async function apiGet(p){if(window.__getFail)throw new ApiError("Offline",503);if(p.includes("file=1"))return {url:"https://example.invalid/quote"};return structuredClone(window.__index);}';
stubs['@/lib/quote-data']='import {ApiError} from "@/lib/api";export const fetchQuote=async()=>{if(window.__getFail)throw new ApiError("Offline",503);return structuredClone(window.__payload)};export const pendingQuote=async()=>window.__pending;export const clearPendingQuote=async()=>{window.__pending=null};export const saveQuote=async body=>{window.__writes.push(structuredClone(body));window.__pending=body;if(window.__mode==="conflict"){window.__pending=null;throw new ApiError("This quote changed. Reload the saved version before continuing.",409)}if(window.__mode==="lost-pending")throw new ApiError("Timeout",408);const r=window.__payload.review;const row={document_id:body.documentId,revision:(r?.revision??0)+1,source_version:body.sourceVersion,payload:body.payload??r?.payload??null,read_status:body.action==="read"?"reading":body.action==="cancel"?"idle":r?.read_status??"idle",read_started_at:new Date().toISOString(),read_result:r?.read_result??null,last_request_id:body.requestId,item_id:body.payload?.itemId??null,issue_id:body.payload?.issueId??null,invoice_id:body.payload?.invoiceId??null};window.__payload={...window.__payload,review:row,sourceChanged:false,readingExpired:false};if(window.__mode==="lost-saved")throw new ApiError("Timeout",408);window.__pending=null;return row;};';
(async()=>{
fs.mkdirSync(out,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Screen from '${root}/apps/mobile/app/quotes';window.__actions=[];window.__writes=[];createRoot(document.getElementById('root')).render(<Screen/>);`;
await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path==='./api')return{path:'@/lib/api',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
const server=require('node:http').createServer((req,res)=>{const f=req.url.split('?')[0]==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
const fields={supplier:'Sample Appliance Service',scope:'Replace dishwasher',partsLabour:'',price:'CAD 800 + tax',taxes:'',exclusions:'',schedule:'',payment:'',warranty:''};
const draft={fields,answers:{},decision:'considering',decisionNote:'',context:'owner',reviewed:true,itemId:null,issueId:null,invoiceId:null};
const row={document_id:'quote',revision:1,source_version:'v1',payload:draft,read_status:'idle',read_started_at:null,read_result:null,last_request_id:null,item_id:null,issue_id:null,invoice_id:null};
const base={homeId:'home',homeName:'Your home',aiAvailable:false,document:{id:'quote',title:'Dishwasher installation quote',updated_at:'v1',hasFile:false,notes:'Proposed dishwasher installation. Total CAD 800 + tax.'},review:row,sourceChanged:false,readingExpired:false,items:[{id:'item',name:'Kitchen dishwasher'}],issues:[{id:'issue',title:'Dishwasher leak'}],invoices:[{id:'invoice',title:'Final installation invoice'}],linksTruncated:false};
try{
 for(const width of [320,390,900])for(const scenario of ['empty','ready','reading','failed','stale','lost-saved','lost-pending','conflict','tenant','links','failure','index','uncertain','conflicting','multi-page','no-evidence']){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const payload=structuredClone(base);
  if(scenario==='empty')payload.review=null;
  if(scenario==='uncertain'){payload.review.payload.fields={...fields,price:'Labour: $180.',partsLabour:'Labour $180; Parts additional.',schedule:'Date to be agreed.'};}
  if(scenario==='conflicting'){payload.review.payload.fields={...fields,price:'Printed subtotal CAD 1000. Printed total CAD 900.',taxes:'Not specified',exclusions:'Disposal allowance CAD 50.'};}

  if(scenario==='ready'){payload.aiAvailable=true;payload.review.read_status='ready';payload.review.read_result=[{key:'scope',value:'Install supplied dishwasher',excerpt:'Install supplied dishwasher',page:1},{key:'price',value:'CAD 800 + tax',excerpt:'Total CAD 800 + tax',page:1}];}
  if(scenario==='multi-page'){payload.aiAvailable=true;payload.review.read_status='ready';payload.review.read_result=[{key:'price',value:'Subtotal CAD 1000.\nTotal CAD 900.',excerpt:'Page 1: Subtotal CAD 1000.\nPage 2: Total CAD 900.',page:null,citations:[{excerpt:'Subtotal CAD 1000.',page:1},{excerpt:'Total CAD 900.',page:2}]}];}
  if(scenario==='no-evidence'){payload.aiAvailable=true;payload.review.read_status='ready';payload.review.read_result=[];}
  if(scenario==='reading'){payload.review.read_status='reading';payload.review.read_started_at=new Date().toISOString();}
  if(scenario==='failed')payload.review.read_status='failed';
  if(scenario==='stale'){payload.sourceChanged=true;payload.review.payload.decision='proceed';}
  await page.addInitScript(({payload,scenario})=>{window.__payload=payload;window.__params=scenario==='index'?{}:{id:'quote'};window.__pending=null;window.__mode=scenario;window.__getFail=scenario==='failure';window.__index={homeName:'Your home',reviews:[],documents:[{id:'quote',title:'Dishwasher installation quote'}],truncated:false};},{payload,scenario});
  await page.goto('http://127.0.0.1:'+server.address().port);
  if(scenario==='failure'){await page.getByText('Offline',{exact:true}).waitFor();await page.evaluate(()=>window.__getFail=false);await page.getByRole('button',{name:'Reload saved review',exact:true}).click();}
  if(scenario==='index'){
   await page.getByRole('button',{name:'Use a saved Vault record',exact:true}).click();
   await page.getByRole('textbox',{name:'Find a saved record',exact:true}).fill('dishwasher');
   await page.getByRole('button',{name:'Dishwasher installation quote',exact:true}).click();
   if(!(await page.evaluate(()=>window.__actions)).some(x=>x.params?.id==='quote'))throw Error('Index navigation');
  }else{
   await page.getByText('Dishwasher installation quote',{exact:true}).waitFor();
   if(scenario==='uncertain'||scenario==='conflicting'){
    await page.getByRole('tab',{name:'Questions',exact:true}).click();
    await page.getByRole('button',{name:/^Show all \d+ questions$/}).click();
    for(const label of scenario==='uncertain'?['Quoted price and currency','Parts and labour','Timing and quote expiry']:['Quoted price and currency','Taxes and other charges','Exclusions and allowances']){
     await page.getByRole('textbox',{name:'Your answer · '+label,exact:true}).waitFor();
    }
   }else if(scenario==='multi-page'){
    await page.getByRole('button',{name:'Show extracted details',exact:true}).click();
    await page.getByText('“Subtotal CAD 1000.” · Page 1',{exact:true}).waitFor();
    await page.getByText('“Total CAD 900.” · Page 2',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Use suggestions in review',exact:true}).click();
    const price=await page.getByRole('textbox',{name:'Quoted price and currency',exact:true}).inputValue();if(!price.includes('1000')||!price.includes('900'))throw Error('A conflicting amount disappeared');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
   }else if(scenario==='no-evidence'){
    await page.getByText('No supported details were read. Enter them yourself, or replace the original with a clearer copy.',{exact:true}).waitFor();
    if(await page.getByRole('button',{name:'Use suggestions in review',exact:true}).count())throw Error('Empty suggestions offered');
    await page.getByRole('button',{name:'Edit quote details',exact:true}).click();
    await page.getByRole('textbox',{name:'Work included',exact:true}).fill('Manual original review');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
   }else if(scenario==='reading'){await page.getByRole('button',{name:'Stop reading',exact:true}).click();await page.getByText('Reading stopped. You can enter the details yourself.',{exact:true}).waitFor();}
   else if(scenario==='ready'){
    await page.getByRole('button',{name:'Show extracted details',exact:true}).click();
    await page.getByRole('button',{name:'Use suggestions in review',exact:true}).click();
    await page.getByRole('textbox',{name:'Work included',exact:true}).fill('Install supplied dishwasher and test');
    await page.getByRole('checkbox',{name:'I reviewed these details against the original',exact:true}).click();
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
    if((await page.evaluate(()=>window.__writes.at(-1))).payload.fields.scope!=='Install supplied dishwasher and test')throw Error('Correction lost');
   }else if(['empty','failed','lost-saved','lost-pending','conflict'].includes(scenario)){
    await page.getByRole('button',{name:'Edit quote details',exact:true}).click();
    await page.getByRole('textbox',{name:'Work included',exact:true}).fill('Install dishwasher; confirm disposal');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    if(scenario.startsWith('lost')){
     await page.getByRole('button',{name:'Check saved review',exact:true}).waitFor();
     await page.getByRole('button',{name:'Check saved review',exact:true}).click();
     if(scenario==='lost-saved'){await page.getByText('Saved review confirmed.',{exact:true}).waitFor();if((await page.evaluate(()=>window.__writes)).length!==1)throw Error('Duplicated confirmed save');}
     else{await page.evaluate(()=>window.__mode='success');await page.getByRole('button',{name:'Retry same change',exact:true}).click();await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();const w=await page.evaluate(()=>window.__writes);if(JSON.stringify(w[0])!==JSON.stringify(w[1]))throw Error('Changed retry');}
    }else if(scenario==='conflict'){await page.getByRole('button',{name:'Reload saved review',exact:true}).waitFor();if((await page.evaluate(()=>window.__writes)).length!==1)throw Error('Conflict overwrite');}
    else await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
   }else if(scenario==='stale'){
    await page.getByRole('tab',{name:'Decision',exact:true}).click();
    if(!await page.getByRole('button',{name:'Planning to proceed',exact:true}).isDisabled())throw Error('Stale decision enabled');
    await page.getByRole('tab',{name:'Quote details',exact:true}).click();
    await page.getByRole('checkbox',{name:'I reviewed these details against the original',exact:true}).click();
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByRole('tab',{name:'Decision',exact:true}).click();
    if(await page.getByRole('button',{name:'Planning to proceed',exact:true}).isDisabled())throw Error('Reviewed decision unavailable');
   }else if(scenario==='tenant'){
    await page.getByRole('tab',{name:'Questions',exact:true}).click();
    await page.getByRole('button',{name:'Landlord / building involved',exact:true}).click();
    await page.getByRole('textbox',{name:'Your answer · Landlord or building',exact:true}).fill('Landlord will approve scope in writing.');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
   }else if(scenario==='links'){
    await page.getByRole('tab',{name:'Decision',exact:true}).click();
    await page.getByRole('button',{name:'Home item: Choose saved record',exact:true}).click();
    await page.getByRole('button',{name:'Kitchen dishwasher',exact:true}).click();
    await page.getByRole('button',{name:'Final invoice: Choose saved record',exact:true}).click();
    await page.getByRole('button',{name:'Final installation invoice',exact:true}).click();
    await page.getByRole('textbox',{name:'Decision, remaining questions or later outcome',exact:true}).fill('Asked about disposal before agreeing.');
    await page.getByRole('button',{name:'Save review',exact:true}).click();
    await page.getByText('Review saved. No message or agreement has been sent.',{exact:true}).waitFor();
    const d=(await page.evaluate(()=>window.__writes.at(-1))).payload;if(d.itemId!=='item'||d.invoiceId!=='invoice')throw Error('Links not kept');
   }
  }
  await page.evaluate(()=>{document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0;})});
  await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',fullPage:true,animations:'disabled'});
  checks.push({width,scenario,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors});await page.close();
 }
}finally{await browser.close();server.close();}
fs.writeFileSync(out+'/render-results.json',JSON.stringify({checks,method:'Actual React Native screen through React Native Web; synthetic API/router/native mocks. Not phone acceptance or live AI evaluation.'},null,2));
if(checks.some(c=>c.overflow||c.errors.length))throw Error(JSON.stringify(checks));
console.log('Passed '+checks.length+' rendered quote scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1});

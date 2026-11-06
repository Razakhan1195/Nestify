const fs=require('node:fs'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild'),{chromium}=require('/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules',out='/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/experience-audit-20261024/remaining/inventory-recovery';
const stubs={
 'react-native-keyboard-controller': `export {ScrollView as KeyboardAwareScrollView} from 'react-native';export const KeyboardToolbar=()=>null;`,
'expo-router':'import React from "react";export const useLocalSearchParams=()=>({providerId:"gas-account"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),setParams:()=>{},canGoBack:()=>false});export const Stack={Screen:()=>null};export const useNavigation=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);',
'expo-router/react-navigation':'export const useIsFocused=()=>true;export const usePreventRemove=()=>{};',
'expo-symbols':'import React from "react";export const SymbolView=()=>React.createElement("span",null,"←");',
'expo-haptics':'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:1};',
'react-native-safe-area-context':'import React from "react";import{View}from"react-native";export const SafeAreaView=View;export const SafeAreaProvider=View;export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',
'@expo/vector-icons':'import React from "react";export function Feather({name}){return React.createElement("span",{"aria-hidden":true,style:{fontSize:18,width:20}},name==="file-text"?"▤":"›");}',
'@/lib/api':'export class ApiError extends Error{};export async function apiGet(p){if(p.endsWith("/original")){window.__actions.push("original");return{url:"https://example.invalid/fixture-original"}}return window.__payload;}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};',
};

stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status,details){super(message);this.status=status;this.details=details;}};export async function apiGet(p){window.__requests.push(p);if(window.__fail)throw new ApiError('Offline',503);if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay));if(p==='/api/mobile/v1/bills')return window.__payload;throw new ApiError('No readings',404,{code:'missing_readings'});}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};`;
stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:null});';
stubs['@/components/AppNotifications']='export const NotificationBell=()=>null;';
stubs['@/components/ProfileUI']='export const ProfileBadge=()=>null;';

stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:{user:{id:"11111111-1111-4111-8111-111111111111"}}});';
stubs['@/lib/receipt-batch']=`import{createReceiptBatchStore}from"${root}/apps/mobile/src/lib/receipt-batch-core";export const receiptBatches=createReceiptBatchStore({getItemAsync:async k=>localStorage.getItem(k),setItemAsync:async(k,v)=>localStorage.setItem(k,v),deleteItemAsync:async k=>localStorage.removeItem(k)});`;
stubs['@/lib/onboarding-data']='export async function fetchOnboarding(){return{home:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",nickname:"Demo home"},accessRole:"owner"};}';
stubs['@/lib/prepare-attachment']='export async function prepareAttachment(input){window.__prepared.push(input);return input;}';
stubs['expo-document-picker']='export async function getDocumentAsync(){return{canceled:false,assets:[{uri:"file:///test/receipt.pdf",name:"receipt.pdf",mimeType:"application/pdf",size:100}]};}';
stubs['expo-image-picker']='export async function requestCameraPermissionsAsync(){return{granted:false};}export async function launchCameraAsync(){return{canceled:true};}export async function launchImageLibraryAsync(){return{canceled:true};}';
stubs['@/lib/vault-pending']='export const vaultPending={remember:async()=>{},forget:async()=>{throw Error("Device cleanup unavailable");},replace:async()=>{}};';
stubs['expo-router']='import React from "react";export const useLocalSearchParams=()=>({kind:"receipt"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),setParams:()=>{},canGoBack:()=>false});export const Stack={Screen:()=>null};export const useNavigation=()=>({dispatch:()=>{}});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status,details){super(message);this.status=status;this.details=details;}};export async function apiGet(p){if(window.__offline)throw new ApiError('Offline',503);return p.includes('/ai/scan')?{receiptExtraction:true}:{receiptBatch:true,saveRecovery:true,homeId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',homeName:'Demo home'};}export async function apiFormPost(p,form){window.__requests.push({method:'POST',path:p,requestId:form.get('requestId')});if(p.includes('/ai/scan')){if(window.__readFail)throw new ApiError('Reading unavailable',503);return{data:{document_kind:'receipt',merchant:'Canadian Tire',purchase_date:'2026-09-21',total:42,currency:'CAD',items:[],review_notes:[]}};}if(window.__duplicate)throw new ApiError('Already in Vault',409,{duplicateId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});localStorage.setItem('server-saved','true');if(window.__lost)throw new ApiError('Response lost',504);return{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};}export async function apiPatch(p){window.__requests.push({method:'PATCH',path:p});return{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};}export async function apiDelete(){};`;

stubs['@/components/BarcodeLookup']='export const BarcodeLookup=()=>null;';
stubs['expo-crypto']='export const randomUUID=()=>crypto.randomUUID();';
stubs['@/auth/AuthProvider']='import React from "react";export function useAuth(){const[user,setUser]=React.useState(window.__user);React.useEffect(()=>{const update=()=>setUser(window.__user);window.addEventListener("qa-account",update);return()=>window.removeEventListener("qa-account",update);},[]);return{session:{user:{id:user}}};}';
stubs['@/lib/inventory-create']=`import{createInventoryIntentStore}from"/Users/razakhan/Documents/rezlee-mobile-test/apps/mobile/src/lib/inventory-create-store";export const inventoryCreateStore=createInventoryIntentStore({getItemAsync:async k=>localStorage.getItem(k),setItemAsync:async(k,v)=>{if(window.__storageFail)throw Error("Device storage full");localStorage.setItem(k,v);},deleteItemAsync:async k=>{if(window.__cleanupFail)throw Error("Cleanup failed");localStorage.removeItem(k);}});`;
stubs['expo-router']='import React from "react";export const Stack={Screen:()=>null};export const useLocalSearchParams=()=>({});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});export const useNavigation=()=>({dispatch:()=>{}});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}};const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export async function apiGet(p){
 if(window.__backendFail)throw new ApiError('Save recovery unavailable',503);
 if(window.__legacy)throw new ApiError('Not found',404);
 if(p.includes('requestId=')){const r=JSON.parse(localStorage.getItem('server-receipt')||'null');return{homeId:home,state:r?.state||'unknown',itemId:r?.state==='saved'?id:null};}
 return{homeId:home,createRecovery:true};
}
export async function apiPost(p,body){
 window.__requests.push({path:p,body});
 if(p.endsWith('/create')){
  const prior=JSON.parse(localStorage.getItem('server-receipt')||'null');
  if(body.action==='cancel'){if(!prior)localStorage.setItem('server-receipt',JSON.stringify({state:'cancelled'}));return{state:prior?.state||'cancelled',itemId:prior?.state==='saved'?id:null};}
  if(prior&&prior.state!=='saved')throw new ApiError('Item deleted or save cancelled',410);
  if(window.__offline)throw new ApiError('Offline',503);
  localStorage.setItem('server-receipt',JSON.stringify({state:'saved',requestId:body.requestId}));
  if(window.__lost)throw new ApiError('Response lost',504);
 }
 return{itemId:id};
}
export async function apiFormPost(){throw Error('Unexpected model call');}export async function apiDelete(){};
`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const entry=`import React from'react';import{createRoot}from'react-dom/client';import{Alert}from'react-native';import Screen from'/Users/razakhan/Documents/rezlee-mobile-test/apps/mobile/app/inventory-item';window.__actions=[];window.__requests=[];Alert.alert=(title,message,buttons)=>{window.__dialog={title,message};window.__confirm=()=>buttons.filter(b=>b.style!=='cancel').at(-1)?.onPress?.();};createRoot(document.getElementById('root')).render(<Screen/>);`;
 await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
 fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
 const server=require('node:http').createServer((req,res)=>{const f=req.url==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const width of [320,390])for(const scenario of ['save','lost-restart','offline-retry','cancel','cancel-completed','deleted','storage-failed','cleanup-failed','account-change','backend-unavailable','legacy']){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{window.__user=sessionStorage.getItem('qa-user')||'11111111-1111-4111-8111-111111111111';window.__lost=['lost-restart','cancel-completed','deleted','account-change'].includes(s);window.__offline=['offline-retry','cancel'].includes(s);window.__storageFail=s==='storage-failed';window.__cleanupFail=s==='cleanup-failed';window.__backendFail=s==='backend-unavailable';window.__legacy=s==='legacy';},scenario);
  await page.goto('http://127.0.0.1:'+server.address().port);
  if(scenario==='backend-unavailable'){
   await page.getByText('Save recovery unavailable',{exact:true}).waitFor();
   await page.evaluate(()=>window.__backendFail=false);await page.getByRole('button',{name:'Try again',exact:true}).click();
  }
  await page.getByRole('button',{name:'Enter details myself',exact:true}).click();
  await page.getByRole('textbox',{name:'Item name',exact:true}).fill('Corrected kitchen dishwasher');
  await page.getByRole('textbox',{name:'Model number',exact:true}).fill('TEST-DW100');
  await page.getByRole('button',{name:'Confirm and check recalls',exact:true}).click();
  if(['lost-restart','offline-retry','cancel','cancel-completed','deleted','account-change'].includes(scenario)){
   await page.getByRole('button',{name:'Check saved item',exact:true}).waitFor();
   await page.waitForFunction(()=>document.body.textContent.includes('Response lost')||document.body.textContent.includes('Offline'));
   const first=await page.evaluate(()=>window.__requests[0].body.requestId);
   if(scenario==='account-change'){
    await page.evaluate(()=>{window.__user='22222222-2222-4222-8222-222222222222';sessionStorage.setItem('qa-user',window.__user);window.dispatchEvent(new Event('qa-account'));});
    await page.getByRole('button',{name:'Enter details myself',exact:true}).click();
    if(await page.getByRole('textbox',{name:'Item name',exact:true}).inputValue()!=='')throw Error('Other account saw private fields');
    if(await page.getByRole('button',{name:'Check saved item',exact:true}).count())throw Error('Other account saw pending save');
   }else{
    if(scenario==='deleted')await page.evaluate(()=>localStorage.setItem('server-receipt',JSON.stringify({state:'deleted'})));
    await page.reload();await page.getByRole('button',{name:'Check saved item',exact:true}).waitFor();
    if(await page.getByRole('textbox',{name:'Item name',exact:true}).inputValue()!=='Corrected kitchen dishwasher')throw Error('Correction lost');
    if((await page.evaluate(()=>window.__requests)).length)throw Error('Restart automatically posted');
    await page.screenshot({path:out+'/pending-'+scenario+'-'+width+'.png'});
    if(scenario==='offline-retry'){
     await page.getByRole('button',{name:'Check saved item',exact:true}).click();
     await page.getByText(/No completed save was found yet/).waitFor();
     await page.evaluate(()=>window.__offline=false);await page.getByRole('button',{name:'Retry same save',exact:true}).click();
     await page.waitForFunction(()=>window.__actions.some(a=>a.params?.itemId));
     if((await page.evaluate(()=>window.__requests[0])).body.requestId!==first)throw Error('Retry identity changed');
    }else if(scenario==='cancel'||scenario==='cancel-completed'){
     await page.getByRole('button',{name:'Cancel pending save',exact:true}).click();await page.evaluate(()=>window.__confirm());
     if(scenario==='cancel')await page.getByText('Save cancelled. Your details are kept here for editing.',{exact:true}).waitFor();
     else await page.waitForFunction(()=>window.__actions.some(a=>a.params?.itemId));
    }else{
     await page.getByRole('button',{name:'Check saved item',exact:true}).click();
     if(scenario==='deleted')await page.getByText(/The previously saved item was deleted/).waitFor();
     else await page.waitForFunction(()=>window.__actions.some(a=>a.params?.itemId));
     if((await page.evaluate(()=>window.__requests)).length)throw Error('Check resubmitted create');
    }
   }
  }else if(scenario==='storage-failed'){
   await page.getByText('Could not save. Your details are still here.',{exact:true}).waitFor();if((await page.evaluate(()=>window.__requests)).length)throw Error('Posted before durable intent');
  }else await page.waitForFunction(()=>window.__actions.some(a=>a.params?.itemId));
  checks.push({width,scenario,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await page.close();
 }
 }finally{await browser.close();server.close();}
 fs.writeFileSync(out+'/render-results.json',JSON.stringify({checks,method:'Actual inventory screen and recovery store via React Native Web; mocked API/auth/native boundaries. Reload is not physical OS process death.'},null,2));
 if(checks.some(c=>c.errors.length||c.overflow))throw Error(JSON.stringify(checks));console.log('PASS '+checks.length+' inventory recovery screen scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=root+'/docs/qa/capture-files-20261011';
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

stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:{user:{id:"11111111-1111-4111-8111-111111111111"}}});';
stubs['@/lib/receipt-batch']=`import{createReceiptBatchStore}from"${root}/apps/mobile/src/lib/receipt-batch-core";export const receiptBatches=createReceiptBatchStore({getItemAsync:async k=>localStorage.getItem(k),setItemAsync:async(k,v)=>localStorage.setItem(k,v),deleteItemAsync:async k=>localStorage.removeItem(k)});`;
stubs['@/lib/onboarding-data']='export async function fetchOnboarding(){return{home:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",nickname:"Demo home"},accessRole:"owner"};}';
stubs['@/lib/prepare-attachment']='export async function prepareAttachment(input){window.__prepared.push(input);return input;}';
stubs['expo-document-picker']='export async function getDocumentAsync(){return{canceled:false,assets:[{uri:"file:///test/receipt.pdf",name:"receipt.pdf",mimeType:"application/pdf",size:100}]};}';
stubs['expo-image-picker']='export async function requestCameraPermissionsAsync(){return{granted:false};}export async function launchCameraAsync(){return{canceled:true};}';
stubs['@/lib/vault-pending']='export const vaultPending={remember:async()=>{},forget:async()=>{throw Error("Device cleanup unavailable");},replace:async()=>{}};';
stubs['expo-router']='import React from "react";export const useLocalSearchParams=()=>({kind:"receipt"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),setParams:()=>{},canGoBack:()=>false});export const Stack={Screen:()=>null};export const Stack={Screen:()=>null};export const useNavigation=()=>({dispatch:()=>{}});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status,details){super(message);this.status=status;this.details=details;}};export async function apiGet(p){if(window.__offline)throw new ApiError('Offline',503);return p.includes('/ai/scan')?{receiptExtraction:true}:{receiptBatch:true,saveRecovery:true,homeId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',homeName:'Demo home'};}export async function apiFormPost(p,form){window.__requests.push({method:'POST',path:p,requestId:form.get('requestId')});if(p.includes('/ai/scan')){if(window.__readFail)throw new ApiError('Reading unavailable',503);return{data:{document_kind:'receipt',merchant:'Canadian Tire',purchase_date:'2026-09-21',total:42,currency:'CAD',items:[],review_notes:[]}};}if(window.__duplicate)throw new ApiError('Already in Vault',409,{duplicateId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});localStorage.setItem('server-saved','true');if(window.__lost)throw new ApiError('Response lost',504);return{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};}export async function apiPatch(p){window.__requests.push({method:'PATCH',path:p});return{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};}export async function apiDelete(){};export async function apiPatch(){};`;

delete stubs['@/lib/prepare-attachment'];
stubs['expo-image-manipulator']=`export const SaveFormat={JPEG:'jpeg'};export const ImageManipulator={manipulate:source=>{window.__transforms.push(source);if(window.__prepareFail)throw Error('PRIVATE native decoding detail');return{resize:()=>{},release:()=>{},renderAsync:async()=>({release:()=>{},saveAsync:async()=>({uri:'file:///test/prepared.jpg'})})};}};`;
stubs['expo-file-system']='export class File{get size(){return window.__hugePhoto?5000000:24000;}}';
stubs['expo-document-picker']=`export async function getDocumentAsync(options){window.__pickerOptions=options;if(window.__cancel)return{canceled:true};return{canceled:false,assets:window.__assets};}`;
stubs['expo-router']='import React from "react";export const useLocalSearchParams=()=>({kind:"quote"});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});export const Stack={Screen:()=>null};export const useNavigation=()=>({dispatch:()=>{}});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);';
stubs['@/lib/api']=`export class ApiError extends Error{constructor(message,status,details){super(message);this.status=status;this.details=details;}};export async function apiGet(){return{receiptBatch:true,receiptExtraction:false,saveRecovery:true,homeId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',homeName:'Demo home'};}export async function apiFormPost(p,form){window.__requests.push({path:p,requestId:form.get('requestId'),title:form.get('title')});if(p.includes('/ai/scan'))throw Error('Unexpected paid read');if(window.__lost)throw new ApiError('Save could not be confirmed',504);return{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};}export async function apiDelete(){};export async function apiPatch(){};`;
(async()=>{
fs.mkdirSync(out,{recursive:true});
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{Alert,Image}from'react-native';import Receipt from'${root}/apps/mobile/app/receipt-batch';import Record from'${root}/apps/mobile/app/vault-record';window.__actions=[];window.__requests=[];window.__prepared=[];window.__transforms=[];Image.getSize=(uri,ok,fail)=>window.__dimensionFail?fail(Error('PRIVATE dimensions')):ok(4032,3024);Alert.alert=(title,message,buttons)=>{window.__dialog={title,message};window.__confirm=()=>buttons.filter(b=>b.style!=='cancel').at(-1)?.onPress?.();};createRoot(document.getElementById('root')).render(window.__single?<Record/>:<Receipt/>);`;
await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,loader:{'.png':'dataurl'},platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path==='./api')return{path:'@/lib/api',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
const server=require('node:http').createServer((req,res)=>{const f=req.url.split('?')[0]==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const checks=[];
try{

for(const width of [320,390])for(const scenario of ['pdf-save','heic-save','convert-error-retry','oversized-photo','empty-pdf','oversize-pdf','cancel','permission-denied','lost-response','batch-failed-photo']){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{
  window.__single=s!=='batch-failed-photo';window.__lost=s==='lost-response';window.__cancel=s==='cancel';window.__prepareFail=['convert-error-retry','batch-failed-photo'].includes(s);window.__hugePhoto=s==='oversized-photo';
  const pdf={uri:'file:///test/quote.pdf',name:'quote.pdf',mimeType:'application/pdf',size:s==='empty-pdf'?0:s==='oversize-pdf'?5000000:2000};
  const heic={uri:'file:///test/quote.HEIC',name:'quote.HEIC',mimeType:'image/heic',size:9000000};
  window.__assets=s==='batch-failed-photo'?[pdf,heic]:[['heic-save','convert-error-retry','oversized-photo'].includes(s)?heic:pdf];
 },scenario);
 await page.goto('http://127.0.0.1:'+server.address().port);
 if(scenario==='batch-failed-photo'){
  await page.getByRole('button',{name:'Choose receipts',exact:true}).click();
  await page.getByText('quote.HEIC: This photo could not be prepared. Choose another photo or a PDF. No files were added.',{exact:true}).waitFor();
  if((await page.evaluate(()=>window.__requests)).length)throw Error('Failed batch was submitted');
  if(await page.evaluate(()=>localStorage.getItem('rezlee.receipt-batch.v1.11111111-1111-4111-8111-111111111111')))throw Error('Partial batch persisted');
 }else if(scenario==='permission-denied'){
  await page.getByRole('button',{name:'Take a photo',exact:true}).click();
  await page.waitForFunction(()=>window.__dialog?.title==='Camera access needed');
  await page.getByRole('button',{name:'Choose a file',exact:true}).click();
  await page.getByRole('textbox',{name:'Title',exact:true}).waitFor();
 }else{
  await page.getByRole('button',{name:'Choose a file',exact:true}).click();
  if(!(await page.evaluate(()=>window.__pickerOptions.type.includes('image/heic')&&window.__pickerOptions.type.includes('image/heif'))))throw Error('Phone formats excluded');
  if(scenario==='cancel'){
   if((await page.evaluate(()=>window.__requests)).length)throw Error('Cancelled selection submitted');
  }else if(['empty-pdf','oversize-pdf','oversized-photo'].includes(scenario)){
   await page.getByRole('alert').waitFor();
   if(await page.getByRole('checkbox').count())throw Error('Invalid original accepted');
   if((await page.evaluate(()=>window.__requests)).length)throw Error('Invalid original submitted');
  }else{
   if(scenario==='convert-error-retry'){
    await page.getByText('Could not prepare this photo. Try another photo or export it as a JPG or PDF. Your existing details are still here.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Add details without a file',exact:true}).click();
    await page.getByRole('textbox',{name:'Title',exact:true}).fill('My corrected quote');
    await page.evaluate(()=>window.__prepareFail=false);
    await page.getByRole('button',{name:'Choose a file',exact:true}).click();
    if(await page.getByRole('textbox',{name:'Title',exact:true}).inputValue()!=='My corrected quote')throw Error('Correction lost');
   }
   await page.getByRole('checkbox').click();
   await page.getByRole('button',{name:'Save quote',exact:true}).click();
   if(scenario==='lost-response'){
    await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    const first=await page.evaluate(()=>window.__requests[0].requestId);
    await page.evaluate(()=>window.__lost=false);
    await page.getByRole('button',{name:'Retry save',exact:true}).click();
    if(await page.evaluate(()=>window.__requests[1].requestId)!==first)throw Error('Retry changed identity');
   }
   await page.getByRole('button',{name:'Review this quote',exact:true}).waitFor();
   if(scenario==='pdf-save'&&(await page.evaluate(()=>window.__transforms)).length)throw Error('PDF was transformed');
   if(scenario==='heic-save'&&!(await page.evaluate(()=>window.__transforms)).length)throw Error('HEIC bypassed preparation');
  }
 }
 await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',animations:'disabled'});
 checks.push({width,scenario,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await page.close();
}
}finally{await browser.close();server.close();}
fs.writeFileSync(out+'/render-results.json',JSON.stringify({checks,method:'Actual Vault/receipt components and actual prepareAttachment/photo-size logic through React Native Web. Native picker/decoder/filesystem, network and dialogs are controlled boundaries. Not physical HEIC decoding or live AI.'},null,2));if(checks.some(c=>c.errors.length||c.overflow))throw Error(JSON.stringify(checks));console.log('Passed '+checks.length+' capture file scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),esbuild=require('/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild'),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/tmp/rezlee-bill-qa-tools-20261008/node_modules',out=root+'/docs/qa/bill-outcome-finish-20261011';
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
(async()=>{
fs.mkdirSync(out,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Screen from '${root}/apps/mobile/app/bill/outcome';import{evaluateBillTarget}from'${root}/apps/mobile/src/lib/bill-outcome';window.__actions=[];window.__writes=[];window.__savedPayload=body=>{const{version,agreementConfirmed,confirmBaseline,...fields}=body;const target={...fields,id:'action',baseline:'hash',savedAt:'2026-10-11T12:00:00Z'};const evidence=window.__payload.candidates.find(b=>b.id===target.evidenceBillId)||null;return{...window.__payload,version:'v'+window.__writes.length,target,evidence,baselineChanged:false,result:evaluateBillTarget(target,window.__payload.baseline,'hash',evidence,'2026-10-11')}};createRoot(document.getElementById('root')).render(<Screen/>);`;

await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,loader:{'.png':'dataurl'},platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path==='./api')return{path:'@/lib/api',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
const telecomBase={id:'base',provider:'Rogers',account:'Home internet',category:'Internet',currency:'CAD',amount:100,start:'2026-07-26',end:'2026-08-25',hasOriginal:true};
const telecomLater={...telecomBase,id:'later',amount:80,start:'2026-08-26',end:'2026-09-25'};
const telecomTarget={id:'action',title:'New internet price',expectedAmount:'80.00',effectiveDate:'2026-08-26',cost:'25.00',notes:'Agreement reference',state:'implemented',evidenceBillId:null,baseline:'hash',savedAt:'2026-10-11T12:00:00Z',snoozedUntil:null};
const server=require('node:http').createServer((req,res)=>{const f=req.url.split('?')[0]==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const checks=[];
try{
for(const kind of ['telecom','gas','electricity']){
 const usage=kind!=='telecom';
 const baseline=usage?{...telecomBase,source:'ezgb',provider:kind==='gas'?'Enbridge Gas':'Elexicon',providerId:'synthetic-provider',accountKey:'synthetic-account',category:kind==='gas'?'Natural Gas':'Electricity',usageAmount:310,usageUnit:kind==='gas'?'m³':'kWh',usageQuality:'actual',usageEligible:true,amountBasis:'amount_due'}:telecomBase;
 const later={...baseline,id:'later',amount:80,start:'2026-08-26',end:'2026-09-25',...(usage?{usageAmount:248}:{})};
 const target={...telecomTarget,...(usage?{kind:'usage_change',title:'Changed household routine',expectedAmount:''}:{})};
 for(const width of [320,390])for(const scenario of ['empty','waiting','matched','corrected','stopped','lost-saved','lost-unchanged','lost-conflict','validation','failure']){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const t=scenario==='empty'?null:{...target,state:scenario==='stopped'?'abandoned':scenario.startsWith('lost')||scenario==='validation'?'planned':'implemented',evidenceBillId:scenario==='matched'?'later':null};
 const result=!t?null:{state:scenario==='matched'?'matched':scenario==='corrected'?'needs_review':scenario==='stopped'?'abandoned':t.state==='planned'?'planned':'awaiting_evidence',title:scenario==='matched'?'Recorded charges match your agreed amount':scenario==='corrected'?'Review the corrected baseline':scenario==='stopped'?'Tracking stopped':t.state==='planned'?'Change planned':'Waiting for a statement',detail:'Selected evidence is checked without claiming ongoing savings.',differenceCents:scenario==='matched'?-2000:null};
 if(usage&&result&&scenario==='matched'){result.state='usage_lower';result.title='Recorded daily usage is lower';result.differenceCents=null;result.usageComparison={beforePerDay:10,afterPerDay:8,unit:baseline.usageUnit,percent:-20,beforeDays:31,afterDays:31,gapDays:0};}
 await page.addInitScript(({payload,scenario})=>{window.__payload=payload;window.__getFail=scenario==='failure';window.__patchMode=scenario.startsWith('lost')?scenario:scenario==='validation'?'validation':'success';},{payload:{kind:usage?'usage_change':'agreed_amount',version:'v0',baseline,evidence:scenario==='matched'?later:null,candidates:[later],candidateCount:1,coverageComplete:true,baselineChanged:scenario==='corrected',target:t,result},scenario});
 await page.clock.setFixedTime(new Date('2026-10-11T12:00:00Z'));
 await page.goto('http://127.0.0.1:'+server.address().port);
 if(scenario==='failure'){await page.getByText('Offline',{exact:true}).waitFor();await page.evaluate(()=>window.__getFail=false);await page.getByRole('button',{name:'Reload saved action',exact:true}).click();}
 await page.getByText('Baseline statement',{exact:true}).waitFor();
 if(scenario==='empty'){
  if(await page.getByRole('textbox').count()!==(usage?1:2))throw Error('Optional details not collapsed');
  if(!usage)await page.getByRole('textbox',{name:'Agreed period total, including tax (CAD)',exact:true}).fill('80');
  await page.getByRole('button',{name:'Effective date',exact:true}).click();
  await page.getByText('Today',{exact:true}).click();
  if(!usage)await page.getByRole('checkbox',{name:/confirmed price/}).click();
  await page.getByRole('button',{name:'Save action',exact:true}).click();
  await page.getByRole('button',{name:'Mark change implemented',exact:true}).waitFor();
 }else if(scenario==='waiting'){
  await page.getByRole('button',{name:'Check a saved statement',exact:true}).click();
  await page.getByRole('button',{name:/Check 2026-08-26/}).click();
  await page.getByRole('button',{name:'Finish this check',exact:true}).waitFor();
  await page.getByRole('button',{name:'Finish this check',exact:true}).click();
  await page.getByRole('button',{name:'Reopen action',exact:true}).waitFor();
 }else if(scenario==='matched'){
  await page.getByRole('button',{name:'Manage this change',exact:true}).click();
  await page.getByRole('button',{name:'Choose another saved statement',exact:true}).click();
  await page.getByRole('button',{name:/Check 2026-08-26/}).waitFor();
 }else if(scenario==='corrected'){
  await page.getByRole('button',{name:'Review and update this action',exact:true}).click();
  if(!await page.getByRole('button',{name:'Save action',exact:true}).isDisabled())throw Error('Unreviewed baseline writable');
  await page.getByRole('checkbox',{name:/reviewed the corrected baseline/}).click();
  if(await page.getByRole('button',{name:'Save action',exact:true}).isDisabled())throw Error('Confirmed baseline cannot save');
 }else if(scenario==='stopped'){
  await page.getByRole('button',{name:'Reopen action',exact:true}).click();
  await page.getByRole('button',{name:'Save action',exact:true}).click();
  await page.getByRole('button',{name:'Mark change implemented',exact:true}).waitFor();
 }else if(scenario.startsWith('lost')){
  await page.getByRole('button',{name:'Mark change implemented',exact:true}).click();
  await page.getByRole('button',{name:'Check saved change',exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'Mark change implemented',exact:true}).isDisabled())throw Error('Uncertain save not locked');
  await page.getByRole('button',{name:'Check saved change',exact:true}).click();
  if(scenario==='lost-saved'){
   await page.getByRole('button',{name:'Check a saved statement',exact:true}).waitFor();
   if((await page.evaluate(()=>window.__writes)).length!==1)throw Error('Check duplicated write');
  }else if(scenario==='lost-unchanged'){
   await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();await page.evaluate(()=>window.__patchMode='success');
   await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('button',{name:'Check a saved statement',exact:true}).waitFor();
   const writes=await page.evaluate(()=>window.__writes);if(writes.length!==2||JSON.stringify(writes[0])!==JSON.stringify(writes[1]))throw Error('Retry changed details');
  }else{await page.getByRole('button',{name:'Review saved version',exact:true}).waitFor();if((await page.evaluate(()=>window.__writes)).length!==1)throw Error('Conflict overwritten');}
 }else if(scenario==='validation'){
  await page.getByRole('button',{name:'Mark change implemented',exact:true}).click();await page.getByText('Check the effective date',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'Mark change implemented',exact:true}).isDisabled())throw Error('Definite rejection locked');
 }
 await page.screenshot({path:out+'/'+kind+'-'+scenario+'-'+width+'.png',fullPage:true,animations:'disabled'});
 checks.push({kind,width,scenario,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors,writes:(await page.evaluate(()=>window.__writes)).length});await page.close();
}
}
}finally{await browser.close();server.close();}
fs.writeFileSync(out+'/render-results.json',JSON.stringify({checks,method:'Actual React Native components through React Native Web. Explicit synthetic fixtures and API/router/native boundary mocks. Not device acceptance.'},null,2));if(checks.some(c=>c.overflow||c.errors.length))throw Error(JSON.stringify(checks));console.log('Passed '+checks.length+' rendered interaction scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1});

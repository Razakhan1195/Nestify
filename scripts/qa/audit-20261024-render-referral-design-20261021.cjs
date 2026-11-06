'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const esbuild=require('esbuild');
const deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const {chromium}=require(deps+'/playwright-core');
const root=process.cwd(),out=root+'/docs/checkpoints/experience-audit-20261024/extended/render-referral-design-20261021';
const stubs={
 'expo-router/react-navigation':`export const useIsFocused=()=>true;`,
 'react-native-keyboard-controller':`export {ScrollView as KeyboardAwareScrollView}from'react-native';export const KeyboardToolbar=()=>null;`,
 'expo-router':`import React from 'react';const router={push:x=>window.__routes.push(x),canGoBack:()=>false,replace:x=>window.__routes.push(x)};export const useRouter=()=>router;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Stack={Screen:({options})=>options.header?.()??null};`,
 'react-native-safe-area-context':`export {View as SafeAreaView} from 'react-native';`,
 'react-native':`import React from 'react';import {Text as BaseText,StyleSheet,useWindowDimensions as dimensions} from 'react-native-web';export * from 'react-native-web';export const Text=props=>{const s=StyleSheet.flatten(props.style)||{},f=window.__scale||1;return <BaseText {...props} style={[props.style,{fontSize:(s.fontSize||14)*f,lineHeight:(s.lineHeight||(s.fontSize||14)*1.4)*f}]}/>};export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__scale||1});export const Share={share:async value=>{window.__shares.push(value);if(window.__shareError)throw Error('unavailable');return {action:'dismissedAction'};}};`,
 '@expo/vector-icons':`import React from 'react';import * as icons from 'lucide-react';export const Feather=({name,size=20,color})=>{const key=name.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('');const Icon=icons[key]||icons.Circle;return <Icon aria-hidden="true" size={size} color={color} strokeWidth={1.6}/>;};`,
 'expo-haptics':`export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:'Light'};`,
 '@/auth/AuthProvider':`import React from 'react';export const useAuth=()=>{const [id,setId]=React.useState('account-a');window.__switchUser=setId;return {session:{user:{id}}};};`,
 '@/lib/api':`export const apiGet=async(path,options)=>{window.__reads.push({path,options});if(window.__loadError)throw Error('offline');if(window.__deferGet&&options.expectedUserId==='account-a')return new Promise(r=>window.__resolveGet=r);return {code:options.expectedUserId==='account-a'?'A1B2C3D4E5F6':'1234ABCDEF56',url:'https://staging.rezlee.com/invite/A1B2C3D4E5F6'};};export const apiPost=async(path,body,options)=>{window.__claims.push({path,body,options});if(window.__deferClaim)return new Promise(r=>window.__resolveClaim=r);if(window.__claimError)throw Error('Check the invitation code.');return structuredClone(window.__claimResult);};`,
 '@/lib/membership':`export const loadMembership=async id=>{window.__membershipRefreshes.push(id);if(window.__refreshError)throw Error('offline');return {};};`,
};
(async()=>{
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Screen from '${root}/apps/mobile/app/rewards.tsx';createRoot(document.getElementById('root')).render(<Screen/>);`,resolveDir:root,loader:'tsx'},outfile:out+'/screen.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web','lucide-react':root+'/node_modules/lucide-react'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return {path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return {path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=require('node:http').createServer((req,res)=>{if(req.url==='/screen.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/screen.js'));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#F7F6F2;font-family:system-ui}*{box-sizing:border-box}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/screen.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
const scenarios=['ready','load-retry','share-error','claim','already-pro','not-new','claim-retry','duplicate-claim','invalid-date','refresh-error','account-switch','stale-read'];
try{
for(const scenario of scenarios){
 const layouts=scenario==='ready'?[{width:320,scale:1},{width:390,scale:1},{width:430,scale:1},{width:320,scale:1.6},{width:390,scale:1.6}]:[{width:390,scale:1}];
 for(const layout of layouts){
  const page=await browser.newPage({viewport:{width:layout.width,height:844}});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  await page.addInitScript(({scenario,scale})=>{window.__scale=scale;window.__routes=[];window.__reads=[];window.__shares=[];window.__claims=[];window.__membershipRefreshes=[];window.__loadError=scenario==='load-retry';window.__shareError=scenario==='share-error';window.__claimError=scenario==='claim-retry';window.__deferClaim=['duplicate-claim','account-switch'].includes(scenario);window.__deferGet=scenario==='stale-read';window.__refreshError=scenario==='refresh-error';window.__claimResult={status:scenario==='already-pro'?'already_pro':scenario==='not-new'?'not_new':'claimed',expiresAt:scenario==='invalid-date'?'invalid':'2026-11-21T12:00:00Z'};},{scenario,scale:layout.scale});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const button=name=>page.getByRole('button',{name,exact:true});
  if(scenario==='stale-read'){
   await page.waitForFunction(()=>typeof window.__resolveGet==='function');await page.evaluate(()=>window.__switchUser('account-b'));
   await page.getByText('1234 ABCD EF56',{exact:true}).waitFor();await page.evaluate(()=>window.__resolveGet({code:'A1B2C3D4E5F6',url:'https://staging.rezlee.com/invite/A1B2C3D4E5F6'}));
   await page.waitForTimeout(50);assert.equal(await page.getByText('A1B2 C3D4 E5F6',{exact:true}).count(),0);
  }else if(scenario==='load-retry'){
   await button('Try again').waitFor();await page.evaluate(()=>window.__loadError=false);await button('Try again').click();await button('Share your invitation').waitFor();
  }else{
   await page.getByText('A1B2 C3D4 E5F6',{exact:true}).waitFor();
   if(scenario==='ready'){
    await page.screenshot({path:out+'/ready-'+layout.width+'-'+layout.scale+'.png'});
    if(layout.scale===1){const box=await button('Share your invitation').boundingBox();assert(box.y+box.height<=844,'Share CTA must be visible in normal first viewport');}
    await button('Share your invitation').click();assert.equal(await page.evaluate(()=>window.__shares.length),1);
    const share=await page.evaluate(()=>window.__shares[0]);assert.match(share.message,/A1B2C3D4E5F6/);assert.match(share.message,/staging\.rezlee\.com/);
    assert.equal(await page.getByText('Invitation sent',{exact:true}).count(),0,'Dismissed sheet must not report a sent invitation');
    await button('Manage household and invitations').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/household');
   }else if(scenario==='share-error'){
    await button('Share your invitation').click();await page.getByRole('alert').waitFor();await page.evaluate(()=>window.__shareError=false);await button('Share your invitation').click();assert.equal(await page.evaluate(()=>window.__shares.length),2);
   }else{
    await button('Have an invitation code?').click();const input=page.getByRole('textbox',{name:'Invitation code'});await input.fill('ABC');assert.equal(await button('Redeem my month of Pro').isDisabled(),true);await input.fill('abcd effe dcba');assert.equal(await input.inputValue(),'ABCDEFFEDCBA');
    await button('Redeem my month of Pro').click();await page.waitForFunction(()=>window.__claims.length===1);
    if(scenario==='account-switch'){
     await page.evaluate(()=>window.__switchUser('account-b'));await page.getByText('1234 ABCD EF56',{exact:true}).waitFor();
     await page.evaluate(()=>window.__resolveClaim(window.__claimResult));await page.waitForTimeout(50);
     assert.equal(await page.getByText(/Your invitation is redeemed/).count(),0);assert.deepEqual(await page.evaluate(()=>window.__membershipRefreshes),[]);
    }else{
     if(scenario==='duplicate-claim'){assert.equal(await button('Redeem my month of Pro').isDisabled(),true);await page.evaluate(()=>window.__resolveClaim(window.__claimResult));}
     if(scenario==='claim-retry'){await page.getByRole('alert').waitFor();await page.evaluate(()=>window.__claimError=false);await button('Redeem my month of Pro').click();}
     if(scenario==='already-pro')await page.getByText(/You already have Rezlee Pro/).waitFor();
     else if(scenario==='not-new')await page.getByText(/This invitation is for accounts created/).waitFor();
     else if(scenario==='invalid-date'){await page.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>window.__membershipRefreshes),[]);}
     else{
      await page.getByText(/Your invitation is redeemed/).waitFor();assert.deepEqual(await page.evaluate(()=>window.__membershipRefreshes),['account-a']);
      if(scenario==='refresh-error')await page.getByRole('alert').waitFor();
      if(scenario==='claim')await page.screenshot({path:out+'/redeemed-390.png'});
      await button('View my membership').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/membership');
     }
     assert.equal(await page.evaluate(()=>window.__claims.length),scenario==='claim-retry'?2:1);
    }
   }
  }
  assert.deepEqual(errors,[],scenario);
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('div,button,input')].some(e=>e.getBoundingClientRect().right>innerWidth+2));assert.equal(overflow,false,scenario+' horizontal overflow');
  checks.push({scenario,...layout,passed:true});await page.close();
 }
}
fs.writeFileSync(out+'/results.json',JSON.stringify({checks,scope:'Actual native source rendered through React Native Web; auth/API/share boundaries synthetic. Native keyboard, Share sheet, device appearance and real redemption remain unverified.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs'),esbuild=require('esbuild'),{chromium}=require('/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core');
const root='/Users/razakhan/Documents/rezlee-mobile-test',deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules',out=root+'/docs/checkpoints/experience-audit-20261024/remaining/phone-invite-recovery';
const stubs={
 'expo-router/react-navigation':`export const useIsFocused=()=>true;export const usePreventRemove=()=>{};`,
 'react-native-keyboard-controller':`export {ScrollView as KeyboardAwareScrollView}from'react-native';export const KeyboardToolbar=()=>null;`,
'expo-router':'export const Stack={Screen:()=>null};export const useLocalSearchParams=()=>({});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});export const router={replace:p=>window.__actions.push(p)};',
'expo-constants':'export default {expoConfig:{}};',
'expo-crypto':'export const randomUUID=()=>crypto.randomUUID();',
'expo-secure-store':'export async function getItemAsync(k){if(window.__restoreFail)throw Error("Storage unavailable");if(window.__restoreDelay)await new Promise(r=>setTimeout(r,window.__restoreDelay));return localStorage.getItem(k);}export async function setItemAsync(k,v){if(window.__storageFail)throw Error("Storage unavailable");localStorage.setItem(k,v);}export async function deleteItemAsync(k){localStorage.removeItem(k);}',
'expo-symbols':'import React from "react";export const SymbolView=()=>React.createElement("span",null,"←");',
'expo-haptics':'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};',
'react-native-safe-area-context':'import{View}from"react-native";export const SafeAreaView=View;export const SafeAreaProvider=View;export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',
'@expo/vector-icons':'import React from"react";export const Feather=()=>React.createElement("span",null,"›");',
'@/auth/AuthProvider':'import React from"react";export function useAuth(){const[id,setId]=React.useState(window.__user);React.useEffect(()=>{const f=()=>setId(window.__user);window.addEventListener("qa-account",f);return()=>window.removeEventListener("qa-account",f)},[]);return{session:{user:{id}}};}',
'@/lib/supabase':'export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:window.__user},access_token:window.__user}}})}};',
};
stubs['./supabase']=stubs['@/lib/supabase'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const entry=`import React from'react';import{createRoot}from'react-dom/client';import{Linking}from'react-native';import Invite from'${root}/apps/mobile/app/household/invite-phone';import Join from'${root}/apps/mobile/app/household/join';import{apiPost}from'${root}/apps/mobile/src/lib/api';window.__actions=[];window.__requests=[];window.__apiPost=apiPost;Linking.openURL=async url=>window.__actions.push(url);window.fetch=async(url,options)=>{const body=JSON.parse(options.body);window.__requests.push({body,owner:options.headers.Authorization});if(body.operation==='create'){if(window.__lost)return new Response(JSON.stringify({error:'Response lost'}),{status:408});return new Response(JSON.stringify({memberId:'member',expiresAt:'2026-10-19'}));}return new Response(JSON.stringify({state:window.__user==='owner-a'?'pending':'unavailable',homeName:window.__user==='owner-a'?'Sam’s home':undefined}));};createRoot(document.getElementById('root')).render(location.search.includes('join')?<Join/>:<Invite/>);`;
 await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/preview.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native':deps+'/react-native-web'},define:{'process.env.NODE_ENV':'"production"','process.env.EXPO_PUBLIC_API_URL':'"https://fixture.invalid"','__DEV__':'false'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
 fs.writeFileSync(out+'/preview.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="./preview.js"></script>');
 const server=require('node:http').createServer((req,res)=>{const f=req.url==='/preview.js'?'preview.js':'preview.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(out+'/'+f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const width of [320,390])for(const scenario of ['prepare','lost-restart','restore-failed','storage-failed','slow-restore','account-switch','session-race','join-account-switch']){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{window.__user='owner-a';window.__lost=s==='lost-restart'||s==='account-switch';window.__restoreFail=s==='restore-failed';window.__storageFail=s==='storage-failed';window.__restoreDelay=s==='slow-restore'?700:0;if(s==='join-account-switch')localStorage.setItem('rezlee-incoming-phone-invite','a'.repeat(64));},scenario);
  await page.goto('http://127.0.0.1:'+server.address().port+(scenario==='join-account-switch'?'/?join':'/'));
  if(scenario==='join-account-switch'){
   await page.getByText('Join Sam’s home',{exact:true}).waitFor();
   await page.evaluate(()=>{window.__user='owner-b';window.dispatchEvent(new Event('qa-account'));});
   await page.getByText('This invitation is no longer available. Ask the owner to send a fresh one.',{exact:true}).waitFor();
   if(await page.getByText('Join Sam’s home',{exact:true}).count())throw Error('Previous household displayed');
   if(await page.getByRole('button',{name:'Request to join',exact:true}).count())throw Error('Stale join button');
  }else{
   if(scenario==='restore-failed'){
    await page.getByRole('button',{name:'Check unfinished invitations',exact:true}).waitFor();
    if(await page.getByRole('button',{name:'Prepare invitation',exact:true}).count())throw Error('Prepare available before restore');
    await page.evaluate(()=>window.__restoreFail=false);await page.getByRole('button',{name:'Check unfinished invitations',exact:true}).click();
   }
   if(scenario==='slow-restore'){
    if(await page.getByRole('textbox',{name:'Name',exact:true}).isEditable())throw Error('Fields editable before restore');
   }
   await page.getByRole('button',{name:'Prepare invitation',exact:true}).waitFor();
   if(scenario==='session-race'){
    const result=await page.evaluate(async()=>{window.__user='owner-b';try{await window.__apiPost('/api/mobile/v1/household/phone',{operation:'create'},{expectedUserId:'owner-a'});return 'sent';}catch(e){return e.message;}});
    if(!result.includes('account changed')||(await page.evaluate(()=>window.__requests.length)))throw Error('Request crossed accounts');
   }else{
    await page.getByRole('textbox',{name:'Name',exact:true}).fill('Sam');
    await page.getByRole('textbox',{name:'Mobile number',exact:true}).fill('4165550123');
    await page.getByRole('button',{name:'Prepare invitation',exact:true}).click();
    if(scenario==='storage-failed'){
     await page.getByText('Storage unavailable',{exact:true}).waitFor();if(await page.evaluate(()=>window.__requests.length))throw Error('Posted without durable intent');
     await page.evaluate(()=>window.__storageFail=false);await page.getByRole('button',{name:'Prepare invitation',exact:true}).click();
    }
    if(scenario==='lost-restart'||scenario==='account-switch'){
     await page.getByText('Response lost',{exact:true}).waitFor();
     await page.screenshot({path:out+'/pending-'+scenario+'-'+width+'.png'});
     const first=await page.evaluate(()=>window.__requests[0].body);
     if(await page.getByRole('textbox',{name:'Mobile number',exact:true}).isEditable())throw Error('Pending details editable');
     if(scenario==='account-switch'){
      await page.evaluate(()=>{window.__user='owner-b';window.dispatchEvent(new Event('qa-account'));});
      await page.getByRole('button',{name:'Prepare invitation',exact:true}).waitFor();
      if(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue()!=='')throw Error('Private name leaked');
     }else{
      await page.reload();await page.getByRole('button',{name:'Check unfinished invitation',exact:true}).waitFor();
      if(await page.evaluate(()=>window.__requests.length))throw Error('Automatic submission on restart');
      await page.evaluate(()=>window.__lost=false);await page.getByRole('button',{name:'Check unfinished invitation',exact:true}).click();
      await page.getByText('Your invitation is ready',{exact:true}).waitFor();
      const second=await page.evaluate(()=>window.__requests[0].body);if(JSON.stringify(first)!==JSON.stringify(second))throw Error('Retry changed request or token');
     }
    }
    if(scenario!=='account-switch'){
     await page.getByText('Your invitation is ready',{exact:true}).waitFor();
     if(await page.evaluate(()=>window.__actions.length))throw Error('Messages opened automatically');
     await page.getByRole('button',{name:'Open Messages',exact:true}).click();
     await page.waitForFunction(()=>window.__actions.length>0);
     if(!(await page.evaluate(()=>window.__actions[0])).startsWith('sms:+14165550123'))throw Error('Wrong Messages destination');
    }
   }
  }
  await page.screenshot({path:out+'/'+scenario+'-'+width+'.png'});
  if(errors.length)throw Error(errors.join('; '));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
  checks.push({width,scenario,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({checks,passed:checks.length,messagesSent:0,boundaries:'Actual screens, recovery storage logic and API authentication guard; mocked storage, network, auth and Messages'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

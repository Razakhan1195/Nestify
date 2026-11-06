const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{chromium}=require('/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core');
const root=process.cwd(),deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules',out='/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/experience-audit-20261024/remaining/customer-communications';
const stubs={
 'react-native-keyboard-controller': `export {ScrollView as KeyboardAwareScrollView} from 'react-native';export const KeyboardToolbar=()=>null;`,
 'expo-router': 'import React from"react";const router={push:d=>window.__routes.push(d),replace:d=>window.__routes.push(d),back:()=>{}};export const useRouter=()=>router;export const useLocalSearchParams=()=>({notice:window.__notice});export const usePathname=()=>window.__path;export const useRootNavigationState=()=>({key:"root"});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;',
 'react-native-safe-area-context':'export {View as SafeAreaView,View as SafeAreaProvider} from "react-native";',
 'react-native': 'export * from "react-native-web";export const AppState={currentState:"active",addEventListener:(_,fn)=>{window.__foreground.add(fn);return{remove:()=>window.__foreground.delete(fn)}}};',
 '@expo/vector-icons':'export const Feather=()=>null;',
 '@/auth/AuthProvider':'export const useAuth=()=>({session:window.__user?{user:{id:window.__user}}:null,isLoading:false});',
 '@/auth/AppLockProvider':'export const useAppLock=()=>({state:{ready:true,locked:window.__locked,userId:window.__user}});',
 '@/components/ScreenNavigation':'import React from"react";import{Text}from"react-native";export const ScreenNavigation=({title})=><Text>{title}</Text>;',
 '@/lib/notification-data': 'export const fetchNotifications=async(before,user)=>{window.__fetches.push({before,user});if(window.__fetchError)throw Error("offline");if(window.__deferFetch)return new Promise(r=>window.__fetchResolve=r);return window.__payload(before,user)};export const openNotification=async(id,user)=>{window.__opens.push({id,user});if(window.__openError)throw Error("offline");if(window.__deferOpen)return new Promise(r=>window.__openResolve=r);return window.__destination};export const readNotification=async(id,user)=>{window.__reads.push({id,user});if(window.__readError)throw Error("offline")};export const readAllNotifications=async()=>{};',
 '@/lib/push-notifications':'export const registerPushNotifications=async()=>{};export const getInitialNotificationTarget=async()=>window.__pending;export const addNotificationTargetListener=fn=>{window.__push=fn;return{remove:()=>{window.__push=null}}};export const clearNotificationResponse=async()=>{window.__clears++;window.__pending=null};',
 '@/lib/api':'export const apiPost=async(path,body,options)=>{window.__welcome.push({path,options});if(window.__welcomeError)throw Error("offline");return{status:"accepted"}};',
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const screen of ['inbox','shell'])await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{Text}from'react-native';import{AppNotifications}from'${root}/apps/mobile/src/components/AppNotifications.tsx';import Inbox from'${root}/apps/mobile/app/notifications.tsx';function Fixture(){const[,render]=React.useState(0);window.__rerender=()=>render(x=>x+1);return ${screen==='shell'?'<AppNotifications><Text>App ready</Text></AppNotifications>':'<Inbox/>'}};createRoot(document.getElementById('root')).render(<Fixture/>);`,loader:'tsx',resolveDir:root},outfile:out+'/'+screen+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const e of['.ts','.tsx','/index.ts'])if(fs.existsSync(p+e))return{path:p+e};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
 const server=require('node:http').createServer((req,res)=>{const name=req.url.slice(1).split('?')[0]||'inbox';if(name.endsWith('.js')){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/'+path.basename(name)))}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+name+'.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const width of [320,390])for(const scenario of ['read-failure','removed','offline','account-switch','pagination','cold-login','duplicate-push','locked-push','late-push-account','welcome-offline']){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],warnings=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('same key'))warnings.push(m.text())});
  await page.addInitScript(s=>{
   window.__user='account-a';window.__path='/home';window.__locked=false;window.__foreground=new Set();window.__routes=[];window.__fetches=[];window.__opens=[];window.__reads=[];window.__clears=0;window.__welcome=[];
   window.__id='11111111-1111-4111-8111-111111111111';window.__destination={href:'/bill/'+window.__id};
   const item={id:window.__id,title:'Your bill is ready',body:'Your saved bill is ready to review.',createdAt:'2026-10-12T10:00:00Z',status:'unread',category:'bills',href:'/bill/'+window.__id};
   window.__payload=(before,user)=>({items:user==='account-b'?[]:before?[item,{...item,id:'22222222-2222-4222-8222-222222222222',title:'Earlier update'}]:[item],unread:user==='account-b'?0:1,nextBefore:!before&&s==='pagination'?'2026-10-11T00:00:00Z':null,asOf:'2026-10-12T12:00:00Z'});
   window.__pending=['cold-login','duplicate-push','locked-push','late-push-account'].includes(s)?{responseId:'push-1',notificationId:window.__id}:null;
   if(s==='read-failure'||s==='duplicate-push')window.__readError=true;
   if(s==='removed')window.__destination={href:'/notifications',notice:'unavailable'};
   if(s==='offline')window.__openError=true;
   if(s==='account-switch')window.__deferFetch=true;
   if(s==='cold-login')window.__path='/reset-password';
   if(s==='locked-push')window.__locked=true;
   if(s==='late-push-account')window.__deferOpen=true;
   if(s==='welcome-offline')window.__welcomeError=true;
  },scenario);
  const shell=['cold-login','duplicate-push','locked-push','late-push-account','welcome-offline'].includes(scenario);
  await page.goto(origin+'/'+(shell?'shell':'inbox'));
  if(!shell){
   if(scenario==='account-switch'){
    await page.waitForFunction(()=>!!window.__fetchResolve);
    await page.evaluate(()=>{const old=window.__fetchResolve;window.__deferFetch=false;window.__user='account-b';window.__rerender();setTimeout(()=>old(window.__payload(null,'account-a')),100)});
    await page.getByText('No updates yet',{exact:true}).waitFor();await page.waitForTimeout(160);
    if(await page.getByRole('button',{name:'Unread. Your bill is ready',exact:true}).count())throw Error('Previous account records leaked');
   }else{
    await page.getByRole('button',{name:'Unread. Your bill is ready',exact:true}).click();
    if(scenario==='removed'){await page.getByText('That update is no longer available for this account.',{exact:false}).waitFor();if(await page.evaluate(()=>window.__routes.length))throw Error('Removed update navigated');}
    else if(scenario==='offline'){await page.getByText('We couldn’t open this update.',{exact:false}).waitFor();await page.evaluate(()=>window.__openError=false);await page.getByRole('button',{name:'Unread. Your bill is ready',exact:true}).click();await page.waitForFunction(()=>window.__routes.length===1);}
    else await page.waitForFunction(()=>window.__routes.length===1);
    if(scenario==='pagination'){await page.getByRole('button',{name:'Load older updates',exact:true}).click();await page.getByText('Earlier update',{exact:true}).waitFor();if(await page.getByText('Your bill is ready',{exact:true}).count()!==1)throw Error('Duplicate pagination');}
   }
  }else{
   await page.getByText('App ready',{exact:true}).waitFor();
   if(['cold-login','locked-push'].includes(scenario)){
    await page.waitForTimeout(100);if(await page.evaluate(()=>window.__routes.length||window.__clears))throw Error('Push stole recovery/lock navigation');
    await page.evaluate(()=>{window.__path='/home';window.__locked=false;window.__rerender()});await page.waitForFunction(()=>window.__routes.length===1&&window.__clears===1);
   }else if(scenario==='late-push-account'){
    await page.waitForFunction(()=>!!window.__openResolve);
    await page.evaluate(()=>{const old=window.__openResolve;window.__pending=null;window.__deferOpen=false;window.__user='account-b';window.__rerender();setTimeout(()=>old(window.__destination),100)});
    await page.waitForTimeout(160);if(await page.evaluate(()=>window.__routes.length||window.__clears))throw Error('Old account push completed');
   }else if(scenario==='duplicate-push'){
    await page.waitForFunction(()=>window.__routes.length===1&&window.__clears===1);await page.evaluate(()=>window.__push({responseId:'push-1',notificationId:window.__id}));await page.waitForTimeout(100);
    if(await page.evaluate(()=>window.__routes.length)!==1)throw Error('Duplicate push opened twice');
   }else{
    await page.waitForFunction(()=>window.__welcome.length===1);await page.evaluate(()=>{for(const fn of window.__foreground)fn('active')});await page.waitForTimeout(100);
    if(await page.evaluate(()=>window.__welcome.length)!==1)throw Error('Welcome retry storm');
   }
  }
  if(errors.length||warnings.length)throw Error(errors.concat(warnings).join(';'));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow '+scenario);
  if(!shell&&['removed','offline','pagination'].includes(scenario))await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',fullPage:true});
  checks.push({width,scenario,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({passed:checks.length,checks,boundaries:'Actual notification inbox, app notification coordinator and welcome sync components; mocked OS push, network, auth and router. Browser rendering does not establish physical push delivery.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

/* eslint-disable */
const fs=require('node:fs'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const deps='/Users/razakhan/Library/Application Support/Rezlee/qa-render-tools/node_modules';
const {chromium}=require(deps+'/playwright-core');
const root=process.cwd(),out=root+'/docs/qa/contextual-onboarding-20261110';
const stubs={
 'expo-router':"import React from 'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),canGoBack:()=>false};export const useRouter=()=>router;export const useNavigation=()=>({});export const useLocalSearchParams=()=>({});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);",
 'expo-router/react-navigation':"export const usePreventRemove=()=>{};",
 'react-native-safe-area-context':"export {View as SafeAreaView} from 'react-native';",
 'react-native':"import React from 'react';import {Text as BaseText,StyleSheet} from 'react-native-web';export * from 'react-native-web';export const Text=props=>{const s=StyleSheet.flatten(props.style)||{},f=window.__scale||1;return <BaseText {...props} style={[props.style,{fontSize:(s.fontSize||14)*f,lineHeight:(s.lineHeight||(s.fontSize||14)*1.4)*f}]}/>};",
 '@expo/vector-icons':"import React from 'react';import * as icons from 'lucide-react';export const Feather=({name,size=20,color})=>{const key=name.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('');const Icon=icons[key]||icons.Circle;return <Icon aria-hidden='true' size={size} color={color} strokeWidth={1.6}/>;};",
 'expo-haptics':"export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:'Light'};",
 'expo-document-picker':"export const getDocumentAsync=async()=>({canceled:true});",
 'expo-image-picker':"export const requestCameraPermissionsAsync=async()=>({granted:false});export const launchCameraAsync=async()=>({canceled:true});",
 '@/theme/useTheme':"import {lightColors,darkColors,lightPremium,darkPremium} from '@/theme/tokens';export const useTheme=()=>({colors:window.__dark?darkColors:lightColors,premium:window.__dark?darkPremium:lightPremium,mode:window.__dark?'dark':'light'});",
 '@/components/FormScrollView':"export {ScrollView as FormScrollView} from 'react-native';",
 '@/components/EmailImportEntry':"export const useEmailImport=()=>null;export const EmailImportEntry=()=>null;",
 '@/components/ScreenNavigation':"import React from 'react';import{Text,View}from'react-native';import{useTheme}from'@/theme/useTheme';export const ScreenNavigation=({title})=><View style={{padding:20}}><Text style={{color:useTheme().colors.foreground}}>{title}</Text></View>;",
 '@/components/DateField':"export const DateField=()=>null;",
 '@/components/TextField':"export const TextField=()=>null;",
 '@/components/SafeAreaModal':"export {Modal as SafeAreaModal} from 'react-native';",
 './Brief':"import React from 'react';import{Pressable,Text}from'react-native';import{useTheme}from'@/theme/useTheme';export const QuietAction=({label,onPress,disabled})=><Pressable accessibilityRole='button' disabled={disabled} onPress={onPress} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:useTheme().colors.primary}}>{label}</Text></Pressable>;",
 '@/auth/AuthProvider':"export const useAuth=()=>({session:{user:{id:'synthetic-owner'}}});",
 '@/lib/provider-data':"export const fetchProviderConnections=async()=>({directory:[{id:'fixture',name:'Example provider',category:'Electricity',method:'green_button',provinces:['ON']}],province:window.__province});",
 '@/lib/api':"export class ApiError extends Error{};export const apiPatch=async(path,body,options)=>{window.__writes.push({path,body,options});if(window.__saveFail)throw Error('offline');window.__province=body.province;return{}};",
 '@/lib/prepare-attachment':"export const prepareAttachment=async x=>x;",
 '@/lib/collection-navigation':"export const savedBillDestination=()=>'/bills';",
 '@/lib/bills-data':"export const fetchBillCapabilities=async()=>({manualHistory:true});export const createBillRequest=async()=>{};export const scanBillRequest=async()=>{};",
 '@/lib/navigation':"export const safeBack=()=>{};",
};
(async()=>{
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{contents:"import React from'react';import{createRoot}from'react-dom/client';import{EmptyHomeActions}from'"+root+"/apps/mobile/src/components/EmptyHomeActions.tsx';import{ProviderFinder}from'"+root+"/apps/mobile/src/components/ProviderFinder.tsx';import AddBill from'"+root+"/apps/mobile/app/bill/add.tsx';function Screen(){const [screen,setScreen]=React.useState('home');window.__screen=setScreen;const actions={onBill:()=>setScreen('bill'),onRecord:()=>window.__routes.push('/vault-record'),onReminder:()=>window.__routes.push('/care/add'),onSplit:()=>window.__routes.push('/shared/edit')};return <div style={{padding:screen==='bill'?0:20,background:window.__dark?'#151D19':'#F7F6F2',minHeight:'100dvh'}}>{screen==='home'?<EmptyHomeActions {...actions}/>:screen==='bill'?<AddBill/>:<ProviderFinder/>}</div>};createRoot(document.getElementById('root')).render(<Screen/>);",resolveDir:root,loader:'tsx'},outfile:out+'/screen.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web','lucide-react':root+'/node_modules/lucide-react'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=require('node:http').createServer((req,res)=>{if(req.url==='/screen.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/screen.js'));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{min-height:100dvh}</style><div id="root"></div><script src="/screen.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
try{
for(const width of [320,390,430])for(const scale of [1,1.6])for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({scale,dark})=>{window.__scale=scale;window.__dark=dark;window.__writes=[];window.__routes=[];window.__province=null;},{scale,dark});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByText('Your home, in one place.',{exact:true}).waitFor();
 for(const label of ['Save a record','Create a reminder','Split an expense'])await page.getByRole('button',{name:label,exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__routes),['/vault-record','/care/add','/shared/edit']);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(width===390&&scale===1)await page.screenshot({path:out+'/home-'+(dark?'dark':'light')+'.png',fullPage:true});
 await page.getByRole('button',{name:'Add a bill',exact:true}).click();await page.getByText('How would you like to add it?',{exact:true}).waitFor();
 if(width===390&&scale===1)await page.screenshot({path:out+'/bill-'+(dark?'dark':'light')+'.png',fullPage:true});
 await page.getByText('Upload a statement',{exact:true}).click();await page.getByText('Connect a provider',{exact:true}).click();
 assert.deepEqual((await page.evaluate(()=>window.__routes)).slice(-2),['/bill/import','/provider/connect']);
 await page.evaluate(()=>window.__screen('provider'));await page.getByText('Choose your province',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'See providers',exact:true}).isDisabled(),true);
 if(width===390&&scale===1)await page.screenshot({path:out+'/province-'+(dark?'dark':'light')+'.png',fullPage:true});
 await page.getByRole('button',{name:'Province or territory, not selected',exact:true}).click();await page.getByRole('radio',{name:'Ontario',exact:true}).click();
 await page.evaluate(()=>window.__saveFail=true);await page.getByRole('button',{name:'See providers',exact:true}).click();await page.getByText('Your province couldn’t be saved. Try again.',{exact:true}).waitFor();
 await page.evaluate(()=>window.__saveFail=false);await page.getByRole('button',{name:'See providers',exact:true}).click();await page.getByText('Who’s your bill from?',{exact:true}).waitFor();
 const writes=await page.evaluate(()=>window.__writes);assert.equal(writes.length,2);assert.deepEqual(writes[1].body,{province:'Ontario'});assert.equal(writes[1].options.expectedUserId,'synthetic-owner');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 checks.push({width,scale,dark,passed:true});await page.close();
}
fs.writeFileSync(out+'/results.json',JSON.stringify({checks,scope:'Actual native components rendered through React Native Web; synthetic services, not physical phone acceptance.'},null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

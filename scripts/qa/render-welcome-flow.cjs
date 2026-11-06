/* Node-only CommonJS render runner, matching the existing QA harnesses. */
const fs = require("node:fs"), assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core");
const root = process.cwd(), deps = "/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules";
const out = root + "/docs/qa/welcome-flow-20261018";
const stubs = {
  "expo-router": `import React from "react";const router={push:d=>window.__routes.push(d),replace:d=>window.__routes.push(d),canGoBack:()=>false,back:()=>window.__routes.push("back")};export const useRouter=()=>router;export const useLocalSearchParams=()=>window.__params;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=({href})=>{React.useEffect(()=>{window.__routes.push(href)},[href]);return null};export const Stack={Screen:({options})=>options.header?.()??null};`,
  "react-native-safe-area-context": 'export {View as SafeAreaView} from "react-native";',
  "react-native": 'export * from "react-native-web";export const AppState={currentState:"active",addEventListener:()=>({remove(){}})};',
  "react-native-webview": `import React from "react";import{View,Text}from"react-native";export const WebView=React.forwardRef((props,ref)=>{window.__web=props;React.useImperativeHandle(ref,()=>({injectJavaScript:s=>window.__injections.push(s)}));return <View><Text>External sign-in screen</Text></View>});`,
  "expo-haptics": 'export const impactAsync=async()=>{},notificationAsync=async()=>{},selectionAsync=async()=>{};export const ImpactFeedbackStyle={Light:"Light"};export const NotificationFeedbackType={Success:"Success"};',
  "@expo/vector-icons": `import React from"react";export const Feather=({name,size=20,color})=><svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" style={{flexShrink:0}}>{name==="x"?<path d="M6 6l12 12M6 18L18 6"/>:name==="mail"?<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>:name==="check-square"?<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/></>:name==="square"?<rect x="3" y="3" width="18" height="18" rx="2"/>:name==="sliders"?<><path d="M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 7h6"/></>:<path d="m9 5 7 7-7 7"/>}</svg>;`,
  "@/auth/AuthProvider": 'export const useAuth=()=>({session:{user:{id:window.__user}}});',
  "@/lib/api": `export class ApiError extends Error{};export const apiDelete=async()=>{throw Error("Unexpected API delete")},apiFormPost=async()=>{throw Error("Unexpected API upload")},apiPatch=async()=>{throw Error("Unexpected API patch")};export const apiGet=async()=>{window.__gets++;if(window.__loadError)throw Error("Couldn’t check your email connection. Try again.");if(window.__deferGet)return new Promise(r=>window.__getResolve=r);return structuredClone(window.__gmail)};export const apiPost=async(_,body)=>{window.__actions.push(body);return{}};`,
  "@/lib/gmail-connection": `export const connectGmail=async(homeId,categories)=>{window.__gmailCalls.push({homeId,categories});if(window.__deferGmail)return new Promise(r=>window.__gmailResolve=r);if(window.__gmailSuccess){window.__gmail.link=window.__link("active");return true}return false};`,
  "@/lib/provider-data": `export const providerCategories=["Electricity","Natural gas","Water","Internet","Mobile","Other service"];export const fetchProviderConnections=async()=>{if(window.__deferCatalog)return new Promise(r=>window.__catalogResolve=r);if(window.__catalogError)throw Error("offline");return{catalog:window.__catalog,deckTesting:true}};export const fetchProviderConnection=async()=>{if(window.__existingError)throw Error("offline");if(window.__deferExisting)return new Promise(r=>window.__existingResolve=r);return{provider:window.__provider}};export const connectProviderRequest=async body=>{window.__legacyCalls.push(body);return{providerId:"connected"}};`,
  "@/lib/deck-hosted-auth": `export const DECK_AUTH_ORIGIN="https://auth.components.deck.co";export const startHostedAuth=async body=>{window.__deckCalls.push(body);if(window.__deferDeck)return new Promise(r=>window.__deckResolve=r);return window.__deckReady};export const checkHostedAuth=async()=>({status:"pending"});export const completeHostedAuth=async()=>({status:"completed",providerId:"connected-bell"});export const isDeckAuthUrl=()=>true;export const hostedInitScript=()=>"fixture";export const hostedMessage=data=>JSON.parse(data);`,
  "@/lib/ezgb-data": `export const fetchEzgbAuthorization=async()=>{window.__greenCalls++;if(window.__greenError)throw Error("offline");if(window.__deferGreen)return new Promise(r=>window.__greenResolve=r);return{authorizationUrl:"https://example.invalid/consent"}};export const syncEzgb=async()=>{window.__syncCalls++;return window.__sync};export const fetchEzgbSyncStatus=async()=>{window.__statusCalls++;return window.__sync};`,
};
stubs["@expo/vector-icons"] = `import React from"react";import * as icons from"lucide-react";export const Feather=({name,size=20,color})=>{const key=name.split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");const Icon=icons[key]||icons.Circle;return <Icon aria-hidden="true" size={size} color={color} strokeWidth={1.6} style={{flexShrink:0}}/>};`;
stubs["@/auth/AuthProvider"] = 'export const useAuth=()=>({session:window.__signedIn?{user:{id:"account-a",user_metadata:{}}}:null,isLoading:false});';
stubs["react-native"] = 'import{useWindowDimensions as dimensions}from"react-native-web";export * from"react-native-web";export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__fontScale||1});export const AppState={currentState:"active",addEventListener:()=>({remove(){}})};';
stubs["@/components/AddressFields"] = 'export const AddressFields=()=>null;';
stubs["@/lib/onboarding-data"] = 'export const fetchOnboarding=async()=>({home:{id:"home-a"},accessRole:"owner"});export const createHomeProfile=async()=>{throw Error("Unexpected home write")};';
stubs["@/lib/onboarding-draft"] = 'export const setupDrafts={read:async()=>({version:1,homeId:"home-a",phase:"choose",updatedAt:Date.now(),goal:"bills",form:{nickname:"Home",city:"Toronto",province:"ON",postal_code:"M5V 2T6",home_type:"Apartment",ownership_type:"Rent",street_address:"",approximate_year_built:""}}),write:async(_,draft)=>window.__draft=draft,clear:async()=>window.__cleared=true};';
stubs["@/lib/home-start-preference"] = 'export const saveStartingGoal=async(homeId,goal)=>{if(window.__saveError)throw Error("offline");window.__saved={homeId,goal}};';
stubs["expo-router"] = stubs["expo-router"].replace('canGoBack:()=>false','setParams:p=>window.__params={...window.__params,...p},canGoBack:()=>false');
stubs["@/lib/provider-data"] = 'export const fetchProviderConnections=async()=>{if(window.__directoryError)throw Error("offline");return{directory:window.__directory}};';

stubs["expo-router/react-navigation"]='export const useIsFocused=()=>true;';
stubs["expo-secure-store"]='export const getItemAsync=async()=>null,setItemAsync=async()=>{};';
stubs["@/auth/AuthProvider"]='export const useAuth=()=>({session:{user:{id:"account-a"}},isLoading:false});';
stubs["@/lib/membership"]='export const loadMembership=async()=>{if(window.__offline)throw Error("offline");return structuredClone(window.__membership)};export const restoreMembership=async()=>{if(window.__purchaseFailure)throw Error("offline");window.__membership.membership.plan="pro";return structuredClone(window.__membership)};';
stubs["@/lib/store-purchases"]='export const availablePlans=async()=>[{identifier:"monthly",packageType:"MONTHLY",product:{priceString:"$7.99"}},{identifier:"yearly",packageType:"ANNUAL",product:{priceString:"$80.00"}}];export const buyPlan=async()=>{window.__purchases++;};export const restorePlans=async()=>{window.__restores++;};';
stubs["@/lib/api"]='export class ApiError extends Error{};export const apiPost=async(_,b)=>{window.__actions.push(b);if(b.action==="request")return{id:"challenge",message:"Check your inbox."};if(b.action==="confirm")return{claimed:true};return{}};';

stubs["@/auth/AuthProvider"]='export const useAuth=()=>({session:window.__session,isLoading:false,signOut:async()=>{window.__signedOut=true}});';
stubs["expo-router"]=stubs["expo-router"]+'export const useNavigation=()=>({dispatch:()=>{}});';
stubs["expo-router/react-navigation"]='export const useIsFocused=()=>true;export const usePreventRemove=()=>{};';
stubs["@/lib/household-data"]='export const fetchHousehold=async()=>{if(window.__offline)throw Error("offline");return {available:true,home:{id:"home-a",nickname:"Our place"},accessRole:window.__member?"member":"owner",members:[],summary:{memberCount:2,assignedOpenCount:0,activeRotationCount:0},rotations:[]}};';
stubs["@/lib/api"]='export class ApiError extends Error{};export const apiGet=async(path)=>{window.__apiReads.push(path);if(window.__offline)throw Error("offline");return structuredClone(window.__connections)};export const apiPost=async(_,b)=>{window.__actions.push(b);return{}};';
stubs["@/lib/public-links"]='export const openPublicLink=async key=>window.__routes.push("public:"+key);';
stubs["@/lib/supabase"]='export const supabase={auth:{getSession:async()=>({data:{session:window.__switch?{user:{id:"account-b"}}:window.__session}}),updateUser:async({data})=>{window.__profileWrites++;if(window.__saveError)return {data:{},error:{message:"offline"}};Object.assign(window.__session.user.user_metadata,data);return {data:{user:window.__session.user},error:null}}}};';
stubs["react-native"]='import React from"react";import{Text as BaseText,StyleSheet,useWindowDimensions as dimensions}from"react-native-web";export * from"react-native-web";export const Text=props=>{const s=StyleSheet.flatten(props.style)||{},f=props.allowFontScaling===false?1:window.__fontScale||1;return <BaseText {...props} style={[props.style,{fontSize:(s.fontSize||14)*f,lineHeight:(s.lineHeight||(s.fontSize||14)*1.4)*f}]}/>};export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__fontScale||1});export const AppState={currentState:"active",addEventListener:()=>({remove(){}})};';

delete stubs['@/lib/membership'];
stubs['@/lib/api']=`export class ApiError extends Error{};export const apiGet=async()=>structuredClone(window.__connections);export const apiPost=async(_,b)=>{window.__actions.push(b);if(window.__offline)throw Error('offline');if(b.action==='restore'){if(window.__purchaseFailure)throw Error('offline');window.__membership.membership={...window.__membership.membership,plan:'pro',source:'store',lifetime:false};}if(b.action==='pro-seen')window.__membership.membership.proWelcomeSeen=true;return structuredClone(window.__membership)};`;
stubs['./api']=stubs['@/lib/api'];
stubs['expo-secure-store']=`export const getItemAsync=async key=>window.__local[key]??null;export const setItemAsync=async(key,value)=>{window.__local[key]=value};`;
stubs['@/components/AppNotifications']=`import React from'react';import{Pressable}from'react-native';import{Feather}from'@expo/vector-icons';export const NotificationBell=()=> <Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Feather name="bell" size={20} color="#214C3D"/></Pressable>;`;
stubs['@/lib/store-purchases']=`export const availablePlans=async()=>[{identifier:'monthly',packageType:'MONTHLY',product:{priceString:'$7.99',currencyCode:'CAD'}},{identifier:'yearly',packageType:'ANNUAL',product:{priceString:'$80.00',currencyCode:'CAD'}}];export const buyPlan=async()=>{window.__purchases++;if(window.__cancel)throw{userCancelled:true}};export const restorePlans=async()=>{window.__restores++;};`;

stubs['@/auth/AuthProvider']='export const useAuth=()=>({session:{user:{id:window.__user}},isLoading:false});';
stubs['expo-router/react-navigation']='export const useIsFocused=()=>window.__focused;export const usePreventRemove=()=>{};';
stubs['react-native']=stubs['react-native']+`import{Modal as NativeModal,Platform as WebPlatform}from'react-native-web';export const Platform={...WebPlatform,OS:window.__platform};export const Modal=props=>{if(props.visible)window.__dismiss=props.onRequestClose;return <NativeModal {...props}/>};`;
stubs['@/lib/api']=`export class ApiError extends Error{};export const apiPost=async(_,b)=>{window.__actions.push(b);if(window.__offline)throw Error('offline');if(b.action==='pro-seen')window.__membership.membership.proWelcomeSeen=true;if(b.action==='seen')window.__membership.membership.founderSeen=true;return structuredClone(window.__membership)};`;
stubs['./api']=stubs['@/lib/api'];
(async()=>{
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{FounderWelcome}from'${root}/apps/mobile/src/components/FounderWelcome.tsx';const root=createRoot(document.getElementById('root'));const ready=user=>window.__ready.push(user);window.__render=()=>root.render(<FounderWelcome onReady={ready}/>);window.__render();`,resolveDir:root,loader:'tsx'},outfile:out+'/welcome.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.jpg':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext}}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=require('node:http').createServer((req,res)=>{if(req.url==='/welcome.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/welcome.js'))}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100dvh}</style><div id="root"></div><script src="/welcome.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
try{
for(const{width,scale}of[{width:320,scale:1},{width:390,scale:1},{width:390,scale:1.6}])
for(const scenario of ['waitlist','first-1000','free','returning','interrupted','offline','account-switch','ios-sequence']){
 const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await page.addInitScript(({scenario,scale})=>{window.__platform=scenario==='ios-sequence'?'ios':'web';window.__fontScale=scale;window.__user='account-a';window.__focused=true;window.__ready=[];window.__actions=[];window.__local={};window.__offline=scenario==='offline';window.__membership={enabled:true,membership:{plan:scenario==='free'?'free':'pro',source:'founder',lifetime:scenario!=='free',household:false,expiresAt:null,homeId:'home-a',founderSeen:scenario==='returning',proWelcomeSeen:scenario==='returning',activated:true,founderReason:scenario==='waitlist'?'waitlist':'first_1000'}};},{scenario,scale});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const button=name=>page.getByRole('button',{name,exact:true});
 if(['offline','returning'].includes(scenario)){
  await page.waitForFunction(()=>window.__actions.some(a=>a.action==='activate'));await page.waitForTimeout(400);
  assert.equal(await button('Continue').count(),0);assert.equal(await button('Make yourself at home').count(),0);
 }else{
  if(scenario!=='free'){
   await page.getByText('Welcome to Rezlee Pro.',{exact:true}).waitFor();await button('Continue').waitFor();
   if(scenario==='interrupted'){
    await page.evaluate(()=>window.__dismiss());await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='seen'||a.action==='pro-seen').length),0);
    assert.equal(await page.evaluate(()=>Object.keys(window.__local).length),0);
    await page.reload();await button('Continue').waitFor();
   }
   await page.waitForTimeout(450);await page.screenshot({path:out+'/'+scenario+'-pro-'+width+'-'+scale+'.png'});
   assert.equal(await page.evaluate(()=>window.__ready.length),0);await button('Continue').click();await page.getByText('A note from our founder',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.__membership.membership.founderSeen),false);
  }else await page.getByText('A note from our founder',{exact:true}).waitFor();
  await page.waitForTimeout(450);await page.screenshot({path:out+'/'+scenario+'-founder-'+width+'-'+scale+'.png'});
  assert.equal(await page.evaluate(()=>window.__ready.length),0);await button('Make yourself at home').click();
  await page.waitForFunction(()=>window.__actions.some(a=>a.action==='seen'));await page.waitForFunction(()=>window.__ready.includes('account-a')); 
  assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='pro-seen').length),scenario==='free'?0:1);
  assert.equal(await page.evaluate(()=>window.__actions.filter(a=>a.action==='seen').length),1);
  if(scenario==='account-switch'){
   await page.evaluate(()=>{window.__user='account-b';window.__membership.membership.proWelcomeSeen=false;window.__membership.membership.founderSeen=false;window.__render();});
   await page.getByText('Welcome to Rezlee Pro.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>Object.keys(window.__local).some(k=>k.endsWith('account-b'))),false);
  }
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);checks.push({scenario,width,scale,passed:true});await page.close();
}
fs.writeFileSync(out+'/results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify({checks:checks.length,passed:true,out}));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

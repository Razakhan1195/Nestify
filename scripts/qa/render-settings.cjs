/* Node-only CommonJS render runner, matching the existing QA harnesses. */
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core");
const root = process.cwd(), deps = "/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules";
const out = root + "/docs/qa/membership-refinement-20261016";
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
(async()=>{
fs.mkdirSync(out,{recursive:true});
const screens={account:'account',connections:'connections',membership:'membership',profile:'profile','account-settings':'account-settings'};
for(const [name,file]of Object.entries(screens))await esbuild.build({stdin:{contents:'import React from"react";import{createRoot}from"react-dom/client";import Screen from"'+root+'/apps/mobile/app/'+file+'.tsx";createRoot(document.getElementById("root")).render(<Screen/>);',resolveDir:root,loader:'tsx'},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=require('node:http').createServer((req,res)=>{const name=path.basename(req.url)||'account';if(name.endsWith('.js')){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/'+name));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+name+'.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
try{
for(const config of [{width:320,scale:1},{width:390,scale:1},{width:390,scale:1.6},{width:768,scale:1}])for(const scenario of ['hub-free','hub-founder','hub-household','hub-offline','hub-search','connections-active','connections-partial','connections-member','membership-free','membership-founder','membership-household','membership-disabled','membership-paid','membership-offline','membership-unknown','profile-save','profile-recovery','profile-switch','legacy-settings']){
 const {width,scale}=config;const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await page.addInitScript(({scenario,scale})=>{window.__fontScale=scale;window.__routes=[];window.__params={};window.__actions=[];window.__apiReads=[];window.__profileWrites=0;window.__purchases=0;window.__restores=0;window.__offline=scenario==='hub-offline'||scenario==='membership-offline';window.__member=scenario.includes('household')||scenario==='connections-member';window.__switch=scenario==='profile-switch';window.__saveError=scenario==='profile-recovery';window.__session={user:{id:'account-a',email:'raza@example.invalid',user_metadata:{full_name:'Raza Khan'},identities:[{provider:'google'}]}};
 window.__membership={enabled:true,purchasesAvailable:scenario!=='membership-disabled',restoreAvailable:scenario==='membership-disabled',storeProductIds:['rezlee.month','rezlee.year'],membership:{plan:scenario.includes('founder')||scenario.includes('household')||scenario==='membership-paid'?'pro':'free',lifetime:scenario.includes('founder')||scenario.includes('household'),household:scenario.includes('household'),source:'founder',founderSeen:true,expiresAt:null,activated:true}};
 if(scenario==='membership-unknown')window.__membership.membership=null;
 window.__connections={canConnect:!window.__member,providersAvailable:scenario!=='connections-partial',gmailAvailable:true,providers:window.__member?[]:[{id:'elexicon',name:'Elexicon Energy',status:'Connected',needsAttention:false,lastUpdated:'2026-10-15T12:00:00Z'},{id:'bell',name:'Bell',status:'Needs attention',needsAttention:true,lastUpdated:null}],gmail:window.__member?null:{email:'household@example.invalid',status:'Connected',needsAttention:false}};},{scenario,scale});
 const screen=scenario.startsWith('connections')?'connections':scenario.startsWith('membership')?'membership':scenario.startsWith('profile')?'profile':scenario==='legacy-settings'?'account-settings':'account';await page.goto('http://127.0.0.1:'+server.address().port+'/'+screen);
 const button=label=>page.getByRole('button',{name:label,exact:true});
 if(scenario==='hub-free'){await page.getByText('YOUR FREE PLAN',{exact:true}).waitFor();await page.getByRole('button',{name:/Connections.*needs attention/}).click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/connections');}
 if(scenario==='hub-founder'){await page.getByText('FOUNDING MEMBER · PRO FOR LIFE',{exact:true}).waitFor();assert.equal(await button('Choose monthly · $7.99 / month').count(),0);}
 if(scenario==='hub-household'){await page.getByText('SHARED WITH YOUR HOUSEHOLD',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/Pro is yours for life/);}
 if(scenario==='hub-offline'){await page.getByText('COULDN’T REFRESH ACCESS',{exact:true}).waitFor();assert.equal(await page.getByText('YOUR FREE PLAN',{exact:true}).count(),0);await page.getByRole('button',{name:/Security Verified email/}).click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/app-security');}
 if(scenario==='hub-search'){await page.getByRole('textbox').fill('gmail');await page.getByRole('button',{name:/Connections/}).waitFor();assert.equal(await page.getByRole('button',{name:/Delete account/}).count(),0);await page.getByRole('textbox').fill('unfindable');await page.getByText(/No matching settings/).waitFor();await button('Clear search').click();await page.getByRole('button',{name:/Delete account/}).waitFor();}
 if(scenario==='connections-active'){await page.getByRole('button',{name:/Elexicon Energy/}).waitFor();await page.getByRole('button',{name:/Gmail household@example.invalid/}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__actions),[]);await page.getByRole('button',{name:/Bell Needs attention/}).click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/provider/bell');}
 if(scenario==='connections-partial'){await page.getByText('Bill connections couldn’t refresh.',{exact:true}).waitFor();await page.getByRole('button',{name:/Gmail household@example.invalid/}).waitFor();assert.equal(await page.getByText('No bill providers linked',{exact:true}).count(),0);}
 if(scenario==='connections-member'){await page.getByText('No bill providers linked',{exact:true}).waitFor();assert.equal(await button('Connect a bill provider').count(),0);assert.equal(await page.getByText('household@example.invalid').count(),0);}
 if(scenario.startsWith('membership')){
 await page.getByRole('tab',{name:'Rezlee Pro',exact:true}).waitFor();
 if(scenario==='membership-free'){
  await page.getByText('Your current plan',{exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Rezlee',exact:true}).getAttribute('aria-selected'),'true');
  await button('Explore Rezlee Pro').click();
  await page.getByText('Unlimited bill scans',{exact:true}).waitFor();
  await button('Choose monthly · $7.99 / month').click();
  await page.getByText('Your Pro access is ready.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__purchases),1);
  assert.equal(await button('Choose monthly · $7.99 / month').count(),0);
 }
 if(scenario==='membership-founder'){
  await page.getByText('Yours for life',{exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Rezlee Pro',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await button('Choose monthly · $7.99 / month').count(),0);
  await page.getByRole('tab',{name:'Rezlee',exact:true}).click();
  await page.getByText('Included with your Pro membership',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Rezlee Pro',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__purchases),0);
 }
 if(scenario==='membership-disabled'){
  await button('Explore Rezlee Pro').click();
  assert.equal(await button('Choose monthly · $7.99 / month').count(),0);
  await button('Restore purchases').click();
  await page.getByText('Your Pro access is ready.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__restores),1);
  assert.equal(await page.evaluate(()=>window.__purchases),0);
 }
 if(scenario==='membership-paid'){
  await button('Manage subscription').waitFor();
  assert.equal(await button('Choose monthly · $7.99 / month').count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/Yours for life|\$7.99/);
 }
 if(scenario==='membership-offline'||scenario==='membership-unknown'){
  await page.getByText(scenario==='membership-offline'?'Membership couldn’t refresh':'Checking your membership…',{exact:true}).waitFor();
  assert.equal(await button('Choose monthly · $7.99 / month').count(),0);
  assert.equal(await page.getByText('CURRENT PLAN',{exact:true}).count(),0);
  if(scenario==='membership-offline'){
   await page.evaluate(()=>window.__offline=false);
   await button('Try again').click();
   await page.getByText('Your current plan',{exact:true}).waitFor();
  }
 }
 if(scenario==='membership-household'){
  await page.getByText('Included with your household',{exact:true}).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(),/Yours for life/);
  assert.equal(await button('Manage subscription').count(),0);
 }
 assert.equal(await button('Plan details & limits').getAttribute('aria-expanded'),'false');
 await button('Plan details & limits').click();
 await page.getByText(/Failed bill-reading attempts are returned/).waitFor();
 assert.equal(await button('Plan details & limits').getAttribute('aria-expanded'),'true');
 await button('Plan details & limits').click();
 }
 if(scenario.startsWith('profile')){await page.getByRole('textbox').fill('Raza Updated');await button('Save profile').click();if(scenario==='profile-switch'){await page.getByText('Your account changed. Reopen your profile.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__profileWrites),0);}else{if(scenario==='profile-recovery'){await page.getByText(/couldn’t confirm the save/).waitFor();assert.equal(await page.getByRole('textbox').inputValue(),'Raza Updated');await page.evaluate(()=>window.__saveError=false);await button('Save profile').click();}await page.getByText('Profile saved.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__session.user.user_metadata.full_name),'Raza Updated');}}
 if(scenario==='legacy-settings')await page.waitForFunction(()=>window.__routes.includes('/account'));
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,scenario+' horizontal overflow');
 await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(el.scrollTop)el.scrollTop=0;});
 await page.screenshot({path:out+'/'+scenario+'-'+width+'-'+scale+'.png',fullPage:true});checks.push({scenario,width,scale,passed:true});await page.close();
}
fs.writeFileSync(out+'/results.json',JSON.stringify({checks,boundaries:'Actual mobile screen code; controlled auth/API/store/native boundaries. Font sizes and line heights explicitly scaled at 1.6. Connected API acceptance is separate.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

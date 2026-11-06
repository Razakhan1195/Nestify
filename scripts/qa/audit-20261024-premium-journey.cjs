/* Actual React Native screens; network, auth, device APIs and routing are simulated. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.cwd();
const deps = process.env.REZLEE_QA_DEPS || '/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const esbuild = require('esbuild'), { chromium } = require(deps + '/playwright-core');
const out=root+'/docs/checkpoints/experience-audit-20261024/remaining/premium-journey';
const stubs = {
 'expo-router/react-navigation':`export const useIsFocused=()=>true;export const usePreventRemove=()=>{};`,
 'react-native-keyboard-controller':`export {ScrollView as KeyboardAwareScrollView}from'react-native';export const KeyboardToolbar=()=>null;`,
 'expo-router': `import React from'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),setParams:()=>{},canGoBack:()=>false,back:()=>{}};export const useRouter=()=>router;export const useNavigation=()=>({dispatch:()=>{}});export const useLocalSearchParams=()=>({billId:'bill-a'});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;export const Stack={Screen:({options})=>options.header?.()??null};`,
 'expo-router/react-navigation': `export const useIsFocused=()=>true;export const usePreventRemove=(dirty,handler)=>{window.__dirty=dirty;window.__leave=handler};`,
 'react-native': `import {useWindowDimensions as dimensions}from'react-native-web';export * from'react-native-web';export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__scale||1});export const Alert={alert:(title,body,buttons)=>{window.__alert={title,body,buttons}}};export const Share={share:async x=>{window.__shared=x}};`,
 'react-native-safe-area-context': `export {View as SafeAreaView,View as SafeAreaProvider}from'react-native';export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
 'expo-document-picker': `export const getDocumentAsync=async()=>({canceled:true});`,
 'expo-image-picker': `export const requestCameraPermissionsAsync=async()=>({granted:false});export const launchCameraAsync=async()=>({canceled:true});`,
 '@/lib/prepare-attachment': `export const prepareAttachment=async x=>x;`,
 '@/components/EmailImportEntry': `export const useEmailImport=()=>null;export const EmailImportEntry=()=>null;`,
 'expo-haptics': `export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:'Success'};export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:'Light'};`,
 '@expo/vector-icons': `import React from'react';import{Home,FileText,Archive,ArrowLeft,ArrowRight,ArrowUpRight,ChevronRight,ChevronDown,MessageCircle,Sun,Search,CloudOff,AlertCircle,CheckCircle,CheckSquare,Circle,Calendar,Users,Layers,X,Bell,Plus,Shield}from'lucide-react';const icons={'home':Home,'file-text':FileText,archive:Archive,'arrow-left':ArrowLeft,'arrow-right':ArrowRight,'arrow-up-right':ArrowUpRight,'chevron-right':ChevronRight,'chevron-down':ChevronDown,'message-circle':MessageCircle,sun:Sun,search:Search,'cloud-off':CloudOff,'alert-circle':AlertCircle,'check-circle':CheckCircle,'check-square':CheckSquare,circle:Circle,calendar:Calendar,users:Users,layers:Layers,x:X,bell:Bell,plus:Plus,shield:Shield};export const Feather=({name,size=20,color})=>{const Icon=icons[name]||Circle;return <Icon aria-hidden="true" size={size} color={color} strokeWidth={1.6} style={{flexShrink:0}}/>};`,
 '@/auth/AuthProvider': `export const useAuth=()=>({session:window.__session,isLoading:false});`,
 '@/components/ProfileUI': `import React from'react';import{View,Text}from'react-native';export const ProfileBadge=()=> <View style={{width:40,height:40,borderRadius:20,backgroundColor:'#E6ECDD',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#214C3D',fontSize:16}}>R</Text></View>;`,
 '@/components/AppNotifications': `import React from'react';import{Pressable}from'react-native';import{Feather}from'@expo/vector-icons';export const NotificationBell=()=> <Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Feather name="bell" size={20} color="#214C3D"/></Pressable>;`,
 '@/components/FounderWelcome': `export const FounderWelcome=()=>null;`,
 '@/components/HomeUtilityProgress': `export const HomeUtilityProgress=()=>null;`,
 '@/components/HomeSharedExpenses': `export const HomeSharedExpenses=()=>null;`,
 '@/components/RecallWatchSummary': `export const RecallWatchSummary=()=>null;`,
 '@/lib/use-reviewed-bill-changes': `import React from'react';export function useReviewedBillChanges(){const[keys,set]=React.useState([]);return {keys,ready:true,busy:false,mark:async key=>set([...keys,key]),restore:async()=>set([]),undo:keys.length>0,error:false,retry:()=>{}}}`, 
 '@/lib/home-data': `export const fetchHome=async()=>structuredClone(window.__home);`,
 '@/lib/bills-data': `export const createBillRequest=async()=>{throw Error('Unexpected save')};export const scanBillRequest=async()=>{throw Error('Unexpected scan')};export const fetchBillCapabilities=async()=>({manualHistory:true});export const fetchBills=async()=>{if(window.__partial)throw Error('offline');return structuredClone(window.__bills)};export const formatDueDate=d=>d?new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'No date';`,
 '@/lib/vault-data': `export const fetchVault=async()=>({documents:[],items:[]});export const formatVaultDate=d=>d;`,
 '@/lib/care-data': `export const fetchCare=async()=>({tasks:[]});`,
 '@/lib/tab-events': `export const subscribeHomeTabPress=()=>()=>{};`,
 '@/lib/api': `export class ApiError extends Error{};export const apiGet=async()=>{if(window.__readError)throw new ApiError('Could not load your review. Check your connection and retry.');return structuredClone(window.__review)};export const apiPatch=async(url,body)=>{window.__writes.push({url,body});if(window.__saveError)throw new ApiError('This statement changed. Reload before saving; your edits are still here.');if(window.__deferSave)await new Promise(r=>window.__finishSave=r);window.__review={...window.__review,action:{draft:body.draft,notes:body.notes,status:body.status},version:'v2',changed:false};return structuredClone(window.__review)};`,
};
stubs['@/lib/api']+=`export const apiPost=async()=>{throw Error('Unexpected write')};`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const [name,source] of Object.entries({
 home:`import Screen from'${root}/apps/mobile/app/(tabs)/home.tsx';import{TabHeader}from'${root}/apps/mobile/src/components/WorkspaceUI.tsx';const App=()=> <><TabHeader title="Home"/><Screen/></>;`,
 add:`import Screen from'${root}/apps/mobile/app/bill/add.tsx';const App=Screen;`,
 collection:`import{View,Text,TextInput}from'react-native';import{CollectionPages}from'${root}/apps/mobile/src/components/CollectionPages.tsx';function Page({name}){const [value,set]=React.useState('');return <View style={{gap:18,padding:20}}><Text>{name} content</Text><TextInput accessibilityLabel={name+' search'} value={value} onChangeText={set}/></View>};function App(){const[selected,set]=React.useState('Insights');return <View style={{padding:20}}><CollectionPages label="Bill views" options={['Insights','Accounts','Shared'].map(value=>({value,label:value}))} selected={selected} onSelect={set} renderPage={name=><Page name={name}/>}/></View>}`, 
 review:`import Screen from'${root}/apps/mobile/app/bill/review.tsx';const App=Screen;`,
 }))await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';${source}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.jpg':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path.endsWith('/api')&&stubs['@/lib/api'])return{path:'@/lib/api',namespace:'stub'};if(a.path.endsWith('/AuthProvider')&&stubs['@/auth/AuthProvider'])return{path:'@/auth/AuthProvider',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext}}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
 const server=require('node:http').createServer((req,res)=>{const name=path.basename(req.url)||'home';if(name.endsWith('.js')){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/'+name));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#F7F6F2}*{box-sizing:border-box}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+name+'.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const viewport of [{width:390,height:844,scale:1},{width:320,height:700,scale:1},{width:390,height:844,scale:1.6},{width:768,height:1024,scale:1}])for(const scenario of ['add-entry','collection-tabs','home-empty','home-active','home-attention','home-stable','home-partial','home-member','review-new','review-double','review-conflict','review-existing','review-failure']){
 const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}}),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 await page.addInitScript(({scenario,scale})=>{
 window.__scale=scale;window.__routes=[];window.__writes=[];window.__session={user:{id:'user-a',user_metadata:{full_name:'Raza Khan'}}};window.__partial=scenario==='home-partial';
 const empty=scenario==='home-empty'||scenario==='home-member';
 window.__home={home:{id:'home-a',nickname:'Our place'},accessRole:scenario==='home-member'?'member':'owner',hasMeaningfulHouseholdData:!empty,dashboardState:empty?'EMPTY':'ACTIVE',availability:{missing:[]},attentionCount:0,attentionItems:[],upcoming:empty?[]:[{id:'task-filter',title:'Replace the furnace filter',detail:'Household task',date:'2026-10-25',timing:'Coming up',type:'Care'}],readiness:{items:[]}};
 const base={providerName:'Bell',label:'Bell internet',category:'Internet',categoryId:'internet',accountNumber:'Home · 1234',currency:'CAD',source:'manual',isHistoricalStatement:true,status:'archived',providerId:null,originalDocumentId:'original-a',dueDate:null,issueDate:'2026-10-01',usageAmount:null,usageUnit:null};
 if(scenario==='home-stable')window.__home.upcoming=[];
 if(scenario==='home-attention'){window.__home.dashboardState='ATTENTION';window.__home.attentionCount=1;window.__home.attentionItems=[{key:'bill-due',title:'Your internet bill is due tomorrow',explanation:'A due date is recorded. No payment has been recorded in Rezlee.',cta:'Review this bill',severity:'high',sourceType:'bill',billId:'bill-a'}]}
 window.__bills={bills:empty?[]:[{...base,id:'bill-a',amount:90.4,billingPeriodStart:'2026-09-01',billingPeriodEnd:'2026-09-30'}],utilityInsights:[],providerActivity:[],historyCoverage:{complete:true}};
 window.__review={id:'bill-a',category:'Internet',title:'Bell internet · September',version:'v1',baseline:'baseline-a',changed:scenario==='review-existing',action:scenario==='review-existing'?{draft:'Please confirm when my promotional credit ends.',notes:'Called support; waiting for a written response.',status:'contacted'}:null,analysis:{hasFinding:false,headline:'No overpayment issue identified',coverage:'Based on the saved statement details. This check does not establish whether your plan is the cheapest available.',facts:['Statement amount: $90.40'],checks:[],next:'No action is needed from this check.',draft:''}};
 window.__saveError=scenario==='review-conflict';window.__readError=scenario==='review-failure';
 },{scenario,scale:viewport.scale});
 const screen=scenario.split('-')[0];await page.goto('http://127.0.0.1:'+server.address().port+'/'+screen);
 const button=name=>page.getByRole('button',{name,exact:true});
 if(screen==='add'){
  await button('Upload a statement').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/bill/import');
  await page.getByRole('button').filter({hasText:'Connect a provider'}).click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/provider/connect');
 }else if(screen==='collection'){
  await page.getByRole('tab',{name:'Accounts',exact:true}).click();await page.getByRole('textbox',{name:'Accounts search'}).fill('Bell');
  await page.getByRole('tab',{name:'Insights',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Accounts search'}).count(),0);
  await page.getByRole('tab',{name:'Accounts',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Accounts search'}).inputValue(),'Bell');
 }else if(screen==='home'){
  if(scenario==='home-attention'){await button('Review this bill').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/bill/bill-a');}
  if(scenario==='home-stable')await page.getByText('No due dates need attention',{exact:true}).waitFor();
  if(scenario==='home-empty'){await button('Add your first bill').waitFor();await button('Add your first bill').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/bill/add');}
  if(scenario==='home-partial'){await page.getByText('Some updates couldn\'t be checked. Saved information remains available below.').waitFor();assert.equal(await button('Add your first bill').count(),0);}
  if(scenario==='home-member'){await button('Open shared Care').waitFor();assert.equal(await page.getByText('What would help today?',{exact:true}).count(),0);assert.equal(await button('Save record').count(),0);}
  else{
   await page.getByText('What would help today?',{exact:true}).waitFor();await page.getByRole('button').filter({hasText:'Make sense of a bill'}).click();await page.getByText('What you’ll leave with',{exact:true}).waitFor();
   await page.waitForTimeout(350);if(viewport.scale===1)await page.screenshot({path:out+'/'+scenario+'-preview-'+viewport.width+'.png'});
   await button(scenario==='home-empty'?'Add my first bill':'Choose or add a bill').click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),scenario==='home-empty'?'/bill/add':'/(tabs)/bills?section=accounts');
  }
 }else if(scenario==='review-failure'){
  await button('Reload saved review').waitFor();assert.equal(await button('Prepare a question for my provider').count(),0);await page.evaluate(()=>window.__readError=false);await button('Reload saved review').click();await button('Prepare a question for my provider').waitFor();
 }else{
  await button(scenario==='review-existing'?'Continue your saved enquiry':'Prepare a question for my provider').click();await page.getByText('Your question, ready to refine.',{exact:true}).waitFor();
  const field=page.getByRole('textbox',{name:'Your message',exact:true});await field.fill('Please explain the charges and confirm when my credit ends.');
  await button('Status: '+(scenario==='review-existing'?'Contacted provider':'Planned')).click();await page.getByRole('radio',{name:'Waiting for another bill',exact:true}).click();
  await button('Share or copy enquiry').click();await page.evaluate(()=>window.__alert.buttons.find(x=>x.text==='Continue').onPress());assert.equal(await page.evaluate(()=>window.__writes.length),0,'Share does not silently save or mark sent');
  if(scenario==='review-double')await page.evaluate(()=>window.__deferSave=true);
  await button(scenario==='review-existing'?'Save after reviewing changed details':'Save enquiry and next step').click();
  if(scenario==='review-double'){await page.waitForFunction(()=>window.__writes.length===1);await page.getByRole('button',{name:'Saving…',exact:true}).dispatchEvent('click');assert.equal(await page.evaluate(()=>window.__writes.length),1);await page.evaluate(()=>window.__finishSave());}
  if(scenario==='review-conflict'){await page.getByText('This statement changed. Reload before saving; your edits are still here.',{exact:true}).waitFor();assert.equal(await field.inputValue(),'Please explain the charges and confirm when my credit ends.');assert.equal(await page.evaluate(()=>window.__dirty),true);}
  else{await page.getByText('Saved with this bill.',{exact:true}).waitFor();const write=await page.evaluate(()=>window.__writes[0].body);assert.equal(write.operation,'enquiry');assert.equal(write.status,'awaiting_evidence');assert.equal(write.baseline,'baseline-a');assert.equal(await page.evaluate(()=>window.__dirty),false);}
 }
 await page.waitForTimeout(350);
 if(viewport.scale>1)await page.evaluate(scale=>{for(const el of document.querySelectorAll('[dir="auto"],textarea,input')){const s=getComputedStyle(el);el.style.fontSize=parseFloat(s.fontSize)*scale+'px';if(s.lineHeight!=='normal')el.style.lineHeight=parseFloat(s.lineHeight)*scale+'px';}},viewport.scale);
 assert.deepEqual(errors,[],scenario);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(el.scrollTop)el.scrollTop=0});await page.screenshot({path:out+'/'+scenario+'-'+viewport.width+'-'+viewport.scale+'.png'});checks.push({scenario,...viewport,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({passed:checks.length,checks,boundaries:'Actual Home/review screen code. Simulated auth, saved data, router, device APIs, acknowledgement and empty provider/expense/recall widgets. Network blocked. Browser text scaling is not native Dynamic Type acceptance.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

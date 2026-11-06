/* Actual React Native screens; network, auth, device APIs and routing are simulated. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.cwd();
const deps = process.env.REZLEE_QA_DEPS || '/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const esbuild = require('esbuild'), { chromium } = require(deps + '/playwright-core');
const out=root+'/docs/checkpoints/experience-audit-20261024/remaining/settings-final';
const stubs = {
 'expo-router': `import React from'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),setParams:()=>{},canGoBack:()=>false,back:()=>{}};export const useRouter=()=>router;export const useNavigation=()=>({dispatch:()=>{}});export const useLocalSearchParams=()=>({billId:'bill-a'});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;export const Stack={Screen:({options})=>options.header?.()??null};`,
 'expo-router/react-navigation': `export const usePreventRemove=(dirty,handler)=>{window.__dirty=dirty;window.__leave=handler};`,
 'react-native': `import {useWindowDimensions as dimensions}from'react-native-web';export * from'react-native-web';export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__scale||1});export const Alert={alert:(title,body,buttons)=>{window.__alert={title,body,buttons}}};export const Share={share:async x=>{window.__shared=x}};`,
 'react-native-safe-area-context': `export {View as SafeAreaView}from'react-native';export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
 'expo-document-picker': `export const getDocumentAsync=async()=>({canceled:true});`,
 'expo-image-picker': `export const requestCameraPermissionsAsync=async()=>({granted:false});export const launchCameraAsync=async()=>({canceled:true});`,
 '@/lib/prepare-attachment': `export const prepareAttachment=async x=>x;`,
 '@/components/EmailImportEntry': `export const useEmailImport=()=>null;export const EmailImportEntry=()=>null;`,
 'expo-haptics': `export const selectionAsync=async()=>{};export const notificationAsync=async()=>{};export const NotificationFeedbackType={Success:'Success'};export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:'Light'};`,
 '@expo/vector-icons': `import React from'react';import{Folder,Box,Clock,Wrench,Repeat,Home,FileText,Archive,ArrowLeft,ArrowRight,ArrowUpRight,ChevronRight,ChevronDown,MessageCircle,Sun,Search,CloudOff,AlertCircle,CheckCircle,CheckSquare,Circle,Calendar,Users,Layers,X,Bell,Plus,Shield}from'lucide-react';const icons={folder:Folder,box:Box,clock:Clock,tool:Wrench,repeat:Repeat,'home':Home,'file-text':FileText,archive:Archive,'arrow-left':ArrowLeft,'arrow-right':ArrowRight,'arrow-up-right':ArrowUpRight,'chevron-right':ChevronRight,'chevron-down':ChevronDown,'message-circle':MessageCircle,sun:Sun,search:Search,'cloud-off':CloudOff,'alert-circle':AlertCircle,'check-circle':CheckCircle,'check-square':CheckSquare,circle:Circle,calendar:Calendar,users:Users,layers:Layers,x:X,bell:Bell,plus:Plus,shield:Shield};export const Feather=({name,size=20,color})=>{const Icon=icons[name]||Circle;return <Icon aria-hidden="true" size={size} color={color} strokeWidth={1.6} style={{flexShrink:0}}/>};`,
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
Object.assign(stubs,{
 'expo-router': `import React from'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),setParams:()=>{},canGoBack:()=>false,back:()=>{}};export const useRouter=()=>router;export const useNavigation=()=>({dispatch:()=>{}});export const useLocalSearchParams=()=>window.__params;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;export const Stack={Screen:({options})=>options.header?.()??null};`,
 '@/lib/receipt-batch':`export const receiptBatches={read:async()=>window.__pending?{}:null};`,
 '@/lib/vault-pending':`export const vaultPending={read:async()=>window.__pending?'unfinished':null};`,
 '@/lib/vault-data':`export const fetchVault=async()=>{if(window.__readError)throw Error('offline');return structuredClone(window.__vault)};export const formatVaultDate=d=>d;`,
 '@/lib/care-save':`export const acknowledgeCareSave=async()=>{};`,
 '@/lib/care-data':`export const fetchCare=async()=>{if(window.__readError)throw Error('offline');return structuredClone(window.__care)};export const completeCareTask=async id=>{window.__writes.push({id});if(window.__saveError)throw Error('offline');window.__care.tasks=window.__care.tasks.map(t=>t.id===id?{...t,displayStatus:'completed'}:t);return{nextDate:null}};export const formatCareDate=d=>d||'No due date';export const formatCareRecurrence=d=>d||'One-time';export const careFilters=[{value:'all',label:'All'},{value:'overdue',label:'Overdue'},{value:'due_soon',label:'Due soon'},{value:'upcoming',label:'Upcoming'},{value:'completed',label:'Done'}];`,
 'expo-crypto':`export const randomUUID=()=> 'decision-new';`,
 '@/lib/purchase-data':`export const pendingPurchase=async()=>null;export const clearPendingPurchase=async()=>{};export const savePurchase=async intent=>{window.__writes.push(intent);if(window.__saveError)throw Error('Could not save');return {id:intent.id,revision:1,payload:intent.payload}};`,
 '@/components/DateField':`import React from'react';import{TextField}from'@/components/TextField';export const DateField=({label,value,onChange,disabled})=><TextField label={label} value={value} onChangeText={onChange} editable={!disabled}/>;`,
 '@/components/EnergyEvidenceReview':`export const EnergyEvidenceReview=()=>null;`,
 '@/lib/api':`export class ApiError extends Error{};export const apiGet=async url=>{if(url.includes('capabilities'))return{receiptBatch:true};if(window.__readError)throw new ApiError('Could not load. Try again.');if(url.includes('purchase-decisions'))return structuredClone(window.__purchase);if(url.endsWith('/outcome'))return structuredClone(window.__outcome);if(url.endsWith('/evidence'))return structuredClone(window.__statement);if(url.endsWith('/read'))return {enabled:true,attempt:null};return structuredClone(window.__offer)};export const apiPatch=async(url,body)=>{window.__writes.push({url,body});if(window.__saveError)throw new ApiError('Save not confirmed. Your edits remain here.');if(url.endsWith('/evidence'))return {...window.__statement,fields:body.fields,reviewedAt:'2026-10-16',needsReview:false};if(url.endsWith('/outcome'))return {...window.__outcome,target:{...body},version:'v2'};return{version:'v2',offers:body.offers}};export const apiFormPost=async(url,form)=>{window.__reads.push({url,consent:form.get('consent'),text:form.get('text')});if(window.__offerReadError)throw new ApiError('Could not read the offer. Your details are kept.');return{reading:structuredClone(window.__reading)}};export const apiPost=async()=>{throw Error('Unexpected paid request')};`,
});

Object.assign(stubs,{
 'expo-router/react-navigation':`export const useIsFocused=()=>true;export const usePreventRemove=()=>{};`,
 'react-native-safe-area-context':`export {View as SafeAreaView,View as SafeAreaProvider} from 'react-native';export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
 'react-native':`import React from'react';import{Text as BaseText,StyleSheet,useWindowDimensions as dimensions}from'react-native-web';export * from'react-native-web';export const Text=p=>{const s=StyleSheet.flatten(p.style)||{},f=window.__scale||1;return <BaseText {...p} style={[p.style,{fontSize:(s.fontSize||14)*f,lineHeight:(s.lineHeight||(s.fontSize||14)*1.4)*f}]}/>};export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__scale||1});`,
 '@/components/EmailImportEntry':`export const useEmailImport=()=>null;export const EmailImportEntry=()=>null;`,
 '@/lib/care-data':`export const fetchCare=async()=>{if(window.__readError)throw Error('offline');return structuredClone(window.__care)};export const completeCareTask=async id=>{window.__writes.push({id});if(window.__saveError)throw Error('offline');if(window.__defer)await new Promise(r=>window.__finish=r);window.__care.tasks=window.__care.tasks.map(t=>t.id===id?{...t,displayStatus:'completed'}:t);return{nextDate:null}};export const formatCareDate=d=>d||'No due date';export const formatCareRecurrence=d=>d||'One-time';export const careFilters=[{value:'open',label:'To do'},{value:'all',label:'All'},{value:'overdue',label:'Overdue'},{value:'due_soon',label:'Due soon'},{value:'upcoming',label:'Upcoming'},{value:'completed',label:'Done'}];`,
});

Object.assign(stubs,{
 'react-native-keyboard-controller':`export {ScrollView as KeyboardAwareScrollView}from'react-native';export const KeyboardToolbar=()=>null;`,
 'expo-symbols':`export const SymbolView=()=>null;`,
 '@/lib/api':`export class ApiError extends Error{};export const apiGet=async()=>{if(window.__fail)throw Error('offline');return{rows:[{id:'doc',kind:'document',title:'Home insurance policy and renewal documents',detail:'Policy · saved original',created_at:'2026-10-24'}],total:1,nextCursor:null}};export const apiPost=async(url,body,options)=>{window.__writes.push({url,body,options});if(window.__fail)throw Error('offline');return body.action==='request'?{id:'claim-id',message:'Check your inbox.'}:{claimed:true}};`,
});

delete stubs['@/components/ProfileUI'];
delete stubs['@/components/FounderWelcome'];
stubs['expo-secure-store']=`export const getItemAsync=async()=>null;export const setItemAsync=async()=>{};`;
stubs['@/lib/membership']=`export const acknowledgeProWelcome=async()=>{};`;
stubs['@/lib/use-membership']=`export const useMembershipState=()=>({});`;
Object.assign(stubs,{
 '@/auth/AppLockProvider':`export const useAppLock=()=>({state:{ready:true,enabled:false,busy:false},label:'Face ID',available:false,detail:'Device authentication is not available on this device.',change:async()=>{}});`,
 '@/lib/vault-save-intent':`export const newVaultSaveRequestId=()=> 'fixture-feedback-id';`,
 '@/lib/supabase':`export const supabase={auth:{getSession:async()=>({data:{session:window.__session}}),updateUser:async({data})=>window.__fail?{error:Error('offline')}:{data:{user:{user_metadata:data}}}}};`,
 '@/lib/household-data':`export const fetchHousehold=async()=>{if(window.__fail)throw Error('offline');return{available:true,accessRole:window.__member?'member':'owner',home:{id:'home',nickname:'Maple home'}}};`,
 '@/lib/household-profile':`export const renameHousehold=async(id,old,name,user)=>{window.__writes.push({id,name,user});if(window.__fail)throw Error('Could not save. Your name remains here.');return name};`,
 'expo-notifications':`export const getPermissionsAsync=async()=>({status:'denied'});`,
 '@/lib/push-notifications':`export const registerPushNotifications=async()=>null;`,
 '@/lib/notification-data':`const preferences={push_enabled:false,shared_expenses:true,connections:true,bills:true,care:true,recalls:true,timezone:'America/Toronto'};export const fetchNotificationPreferences=async()=>({preferences,canManageRecalls:true});export const saveNotificationPreferences=async patch=>({preferences:{...preferences,...patch}});`,
 '@/lib/api':`export class ApiError extends Error{};export const apiGet=async url=>{if(window.__fail)throw Error('offline');if(url.endsWith('/feedback'))return {items:window.__items};if(url.endsWith('/preferences'))return{enabled:true,push_enabled:false,schedulerActive:false,last_checked_at:null,last_error:null};return{checkedAt:'2026-10-24T12:00:00Z',itemCount:3,missingBrandCount:1,matches:[]}};export const apiPost=async(url,body)=>{window.__writes.push({url,body});if(window.__fail)throw Error('Send not confirmed. Check saved feedback or retry.');if(url.endsWith('/feedback'))window.__items=[{...body,status:'new',created_at:'2026-10-24T12:00:00Z'}];return{message:'Synthetic fixture only'}};`,
});
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const [name,file]of Object.entries({security:'app-security',feedback:'feedback',appearance:'profile-appearance',notifications:'notification-settings',household:'household/details',sharing:'household/sharing',recalls:'recalls',recallprefs:'recall-settings',about:'about-rezlee'})){
 await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Screen from'${root}/apps/mobile/app/${file}.tsx';createRoot(document.getElementById('root')).render(<Screen/>);`,loader:'tsx',resolveDir:root},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.jpg':'dataurl','.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.path.endsWith('/api') && a.path.startsWith('.'))return{path:'@/lib/api',namespace:'stub'};if(a.path.endsWith('/AuthProvider') && a.path.startsWith('.'))return{path:'@/auth/AuthProvider',namespace:'stub'};if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/'))for(const ext of ['.ts','.tsx','/index.ts']){const p=root+'/apps/mobile/src/'+a.path.slice(2)+ext;if(fs.existsSync(p))return{path:p};}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
 }
 const server=require('node:http').createServer((req,res)=>{const n=path.basename(req.url);if(n.endsWith('.js')){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(out+'/'+n));}res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#F7F6F2}*{box-sizing:border-box}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+n+'.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{for(const width of[320,390])for(const scale of[1,1.6])for(const scenario of['security','feedback','appearance','notifications','household','sharing','recalls','recallprefs','about']){
 const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());await page.addInitScript(({scale})=>{window.__scale=scale;window.__params={};window.__routes=[];window.__writes=[];window.__items=[];window.__session={user:{id:'fixture-account',email:'fixture@example.invalid',email_confirmed_at:'2026-10-01',identities:[{provider:'email'}],user_metadata:{full_name:'Review User'}}};},{scale});
 await page.goto('http://127.0.0.1:'+server.address().port+'/'+scenario);

 await page.waitForTimeout(200);
 if(scenario==='feedback'){
 await page.getByRole('textbox').fill('Please make it easier to find my home records.');
 await page.evaluate(()=>window.__fail=true);await page.getByRole('button',{name:'Send feedback',exact:true}).click();await page.getByRole('button',{name:'Retry same message',exact:true}).waitFor();
 await page.screenshot({path:out+`/feedback-recovery-${width}-${scale}.png`,fullPage:true});
 await page.evaluate(()=>window.__fail=false);await page.getByRole('button',{name:'Retry same message',exact:true}).click();await page.getByText('Feedback received',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>new Set(window.__writes.map(x=>x.body.id)).size),1);
 }
 if(scenario==='appearance'){
 await page.getByRole('textbox',{name:'Your initials'}).fill('RK');
 }
 if(scenario==='sharing'){
 await page.getByRole('button',{name:'Review people and invitations'}).click();assert.equal(await page.evaluate(()=>window.__routes.at(-1)),'/household');
 }
 await page.screenshot({path:out+`/${scenario}-${width}-${scale}.png`,fullPage:true});
 assert((await page.locator('body').innerText()).length>80,'Screen must have useful content');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push({scenario,width,scale,passed:true});await page.close();}
 fs.writeFileSync(out+'/results.json',JSON.stringify({checks,boundaries:'Actual source. Synthetic account/API and browser text scaling; not native keyboard acceptance.'},null,2));console.log('PASS',checks.length);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

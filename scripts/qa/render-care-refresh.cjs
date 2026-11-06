/* Actual React Native screens; network, auth, device APIs and routing are simulated. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.cwd();
const deps = process.env.REZLEE_QA_DEPS || '/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const esbuild = require('esbuild'), { chromium } = require(deps + '/playwright-core');
const out = root + '/docs/qa/care-refresh-20261017';
const stubs = {
 'expo-router': `import React from'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),setParams:()=>{},canGoBack:()=>false,back:()=>{}};export const useRouter=()=>router;export const useNavigation=()=>({dispatch:()=>{}});export const useLocalSearchParams=()=>({billId:'bill-a'});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;export const Stack={Screen:({options})=>options.header?.()??null};`,
 'expo-router/react-navigation': `export const usePreventRemove=(dirty,handler)=>{window.__dirty=dirty;window.__leave=handler};`,
 'react-native': `import {useWindowDimensions as dimensions}from'react-native-web';export * from'react-native-web';export const useWindowDimensions=()=>({...dimensions(),fontScale:window.__scale||1});export const Alert={alert:(title,body,buttons)=>{window.__alert={title,body,buttons}}};export const Share={share:async x=>{window.__shared=x}};`,
 'react-native-safe-area-context': `export {View as SafeAreaView}from'react-native';export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
 'expo-document-picker': `export const getDocumentAsync=async()=>({canceled:true});`,
 'expo-image-picker': `export const launchImageLibraryAsync=async()=>({canceled:true});export const requestCameraPermissionsAsync=async()=>({granted:false});export const launchCameraAsync=async()=>({canceled:true});`,
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
 '@/lib/api':`export class ApiError extends Error{};export const apiGet=async url=>{if(url.includes('capabilities'))return{receiptBatch:true};if(window.__readError)throw new ApiError('Could not load. Try again.');if(url.includes('purchase-decisions'))return structuredClone(window.__purchase);if(url.endsWith('/outcome'))return structuredClone(window.__outcome);if(url.endsWith('/evidence'))return structuredClone(window.__statement);if(url.endsWith('/read'))return {enabled:true,attempt:null};return structuredClone(window.__offer)};export const apiPatch=async(url,body)=>{window.__writes.push({url,body});if(window.__saveError)throw new ApiError('Save not confirmed. Your edits remain here.');if(url.endsWith('/evidence'))return {...window.__statement,fields:body.fields,reviewedAt:'2026-10-16',needsReview:false};if(url.endsWith('/outcome'))return {...window.__outcome,target:{...body},version:'v2'};return{version:'v2',offers:body.offers}};export const apiPost=async()=>{throw Error('Unexpected paid request')};`,
});
Object.assign(stubs,{
 'expo-router':`import React from'react';const router={push:x=>window.__routes.push(x),replace:x=>window.__routes.push(x),setParams:()=>{},canGoBack:()=>false,back:()=>{}};export const useRouter=()=>router;export const useNavigation=()=>({dispatch:x=>window.__dispatch=x});export const useLocalSearchParams=()=>window.__params;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=()=>null;export const Stack={Screen:({options})=>options.header?.()??null};`,
 '@/lib/vault-save-intent':`export const newVaultSaveRequestId=()=> 'save-a';`,
 '@/lib/vault-pending':`export const vaultPending={read:async()=>null,remember:async()=>{},forget:async()=>{}};`,
 '@/lib/inventory-create':`export const inventoryCreateStore={load:async()=>null,remember:async()=>{},forget:async()=>{}};`,
 '@/components/BarcodeLookup':`export const BarcodeLookup=()=>null;`,
 '@/lib/quote-data':`export const pendingQuote=async()=>null;export const clearPendingQuote=async()=>{};export const fetchQuote=async()=>structuredClone(window.__quote);export const saveQuote=async intent=>{window.__writes.push(intent);if(window.__saveError)throw Error('Save not confirmed. Your edits are kept.');return{revision:1,payload:intent.payload,read_status:'idle',read_result:null}};`,
 '@/lib/repair-data':`export const fetchRepairs=async()=>structuredClone(window.__repairs);export const pendingRepair=async()=>null;export const repairStatus=s=>s==='resolved'?'Resolved':'In progress';export const saveRepair=async intent=>{window.__writes.push(intent);return{...window.__repair,id:'repair-new',progress:{...window.__repair.progress,intake:intent.intake}}};`,
 '@/lib/care-save':`export const pendingCareReminder=async()=>null;export const resetRemovedCareReminder=async()=>{};`,
 '@/lib/care-data':`export const fetchCare=async()=>structuredClone(window.__care);export const formatCareDate=d=>d||'No date';export const formatCareRecurrence=d=>d||'One-time';export const createCareTask=async body=>{window.__writes.push(body);return{requestId:'new-task'}};export const completeCareTask=async id=>{window.__writes.push({id});return{nextDate:'2026-11-16'}};export const deleteCareTask=async()=>{throw Error('Unexpected deletion')};`,
 '@/lib/household-data':`export const fetchHousehold=async()=>structuredClone(window.__household);`,
 '@/lib/custom-cleaning':`export const fetchCleaningRoutines=async()=>structuredClone(window.__routines);export const readRoutineDraft=async()=>null;export const storeRoutineDraft=async(_,draft)=>{window.__draft=draft};export const clearRoutineDraft=async()=>{};export const recoverRoutineSave=async()=>{};export const saveCustomRoutine=async(homeId,draft)=>{window.__writes.push({homeId,draft})};`,
 '@/lib/provider-data':`export const fetchProviderConnections=async()=>structuredClone(window.__providers);`,
 '@/lib/public-links':`export const openPublicLink=async kind=>window.__routes.push('public:'+kind);`,
 '@/components/AppleAccountNotice':`export const AppleAccountNotice=()=>null;`,
 '@/lib/statement-draft':`export const statementDrafts={read:async()=>null,write:async()=>{},clear:async()=>{}};`,
 '@/lib/bill-upload-pending':`export const pendingBillUpload=async()=>null;export const rememberBillUpload=async()=>{};export const forgetBillUpload=async()=>{};`,
 '@/lib/onboarding-data':`export const fetchOnboarding=async()=>({home:{id:'home-a',nickname:'Our place'},accessRole:'owner'});`,
 '@/lib/bills-data':`export const fetchBillCapabilities=async()=>({originalUpload:true});export const fetchBills=async()=>({bills:[]});`,
 '@/lib/api':`export class ApiError extends Error{};export const apiGet=async url=>{
 if(window.__readError)throw new ApiError('Could not load. Try again.');
 if(url.includes('/email-memory?capabilities'))return{enabled:true,reading:true,homeId:'home-a',homeName:'Our place'};if(url.includes('/email-memory'))return{jobs:[],homeId:'home-a',homeName:'Our place'};
 if(url.includes('/vault/records?capabilities'))return{receiptBatch:true,saveRecovery:true,homeId:'home-a',homeName:'Our place'};
 if(url.includes('/vault/records'))return{record:{title:'Dishwasher warranty',category:'Warranty',hasFile:true,file_name:'warranty.pdf',issued_on:'2025-10-16',expires_on:'2027-10-16',notes:'Keep the proof of purchase',updated_at:'v1'}};
 if(url.includes('/ai/scan'))return{receiptExtraction:false,statementExtraction:false};
 if(url.includes('/inventory/create'))return{homeId:'home-a',createRecovery:true};
 if(url.includes('/inventory'))return{item:{name:'Kitchen dishwasher',brand:'Bosch',model_number:'SHE53',warranty_expires_on:'2027-10-16'}};
 if(url.includes('/quotes'))return{homeName:'Our place',reviews:[],documents:[],truncated:false};
 throw Error('Unexpected GET '+url);
 };export const apiPost=async(url,body)=>{window.__writes.push({url,body});if(window.__saveError)throw new ApiError('Save not confirmed. Your edits are kept.');return{itemId:'item-a'}};export const apiFormPost=async(url,form)=>{window.__writes.push({url,body:Object.fromEntries(form.entries())});if(window.__saveError)throw new ApiError('Save not confirmed. Your edits are kept.');return{id:'record-new'}};export const apiPatch=apiPost;export const apiDelete=async()=>{throw Error('Unexpected deletion')};`,
});
delete stubs['@/components/ProfileUI'];
stubs['@/lib/membership']=`export const loadMembership=async()=>({purchasesAvailable:false,membership:{plan:'pro',lifetime:true}});export const restoreMembership=async()=>{throw Error('Unexpected restore')};`;
stubs['@/lib/store-purchases']=`export const availablePlans=async()=>[];export const buyPlan=async()=>{throw Error('Unexpected purchase')};export const restorePlans=async()=>{throw Error('Unexpected restore')};`;

// API and device boundaries are fixtures; screen components and event handlers are real.
delete stubs['@/lib/care-data'];
stubs['@/lib/care-save']=`export const acknowledgeCareSave=async()=>{};export const submitCareSave=async()=>{};export const submitCareReminder=async body=>{window.__writes.push(body);return{requestId:'reminder'}};export const pendingCareReminder=async()=>null;export const resetRemovedCareReminder=async()=>{};`;
stubs['expo-crypto']=`export const randomUUID=()=>crypto.randomUUID();`;
stubs['@/lib/custom-cleaning']=`export const fetchCleaningRoutines=async()=>structuredClone(window.__routines);export const readRoutineDraft=async()=>window.__draft||null;export const readPendingRoutine=async()=>window.__pending||null;export const storeRoutineDraft=async(_,draft)=>{window.__draft=structuredClone(draft)};export const clearRoutineDraft=async()=>{window.__draft=null};export const recoverRoutineSave=async()=>null;export const saveCustomRoutine=async(homeId,draft)=>{window.__writes.push({homeId,draft});if(window.__saveError)throw Error('The connection dropped. Your choices are kept.');};export const addCarePerson=async(homeId,id,displayName)=>{const member={id,display_name:displayName,status:'local',linked_user_id:null};window.__peopleWrites.push({homeId,id,displayName});return{member}};`;
stubs['@/lib/api']=`export class ApiError extends Error{};export const apiGet=async()=>structuredClone(window.__care);export const apiPost=async(url,body)=>{window.__writes.push({url,body});return{nextDate:null}};export const apiDelete=async()=>{throw Error('Unexpected deletion')};`;
stubs['./care-save']=stubs['@/lib/care-save'];stubs['./api']=stubs['@/lib/api'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const [name,file]of Object.entries({routine:'care/custom-routine',routines:'care/routines',care:'(tabs)/care',reminder:'care/add'})){
  await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import App from'${root}/apps/mobile/app/${file}.tsx';createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext}}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
 }
 const server=require('node:http').createServer((req,res)=>{const name=path.basename(req.url);if(name.endsWith('.js')){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(out+'/'+name));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#F7F6F2}*{box-sizing:border-box}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+name+'.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const viewport of [{width:390,height:844,scale:1},{width:320,height:700,scale:1},{width:390,height:844,scale:1.6}])for(const scenario of ['new','six','local','pending','member','paused','reminder']){
  const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}}),errors=[];
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.addInitScript(({scenario,scale})=>{
   window.__scale=scale;window.__routes=[];window.__writes=[];window.__peopleWrites=[];window.__params={};window.__draft=null;window.__pending=null;
   window.__household={available:true,accessRole:'owner',home:{id:'home-a',nickname:'Our place'},members:['Raza','Sumbul','Alex','Sam','Taylor','Jamie'].map((display_name,i)=>({id:'person-'+i,display_name,status:'active',linked_user_id:'user-'+i}))};
   window.__routines={homeId:'home-a',role:'owner',managedPeopleAvailable:true,routines:[]};
   const tasks=Array.from({length:12},(_,i)=>({key:'task-key-'+i,title:['Wipe counters','Wash dishes','Clean sink','Check fridge','Clean toilet','Clean shower','Fresh towels','Vacuum floors','Tidy toys','Change sheets','Fold clothes','Empty bins'][i],room:'Kitchen',start:'2026-10-20',unit:'week',every:1,weekdays:[2],members:[],rotation:'fixed'}));
   if(scenario==='six')window.__draft={id:'routine-a',version:0,applyCurrent:false,values:{title:'Our routine',timezone:'America/Toronto',state:'active',tasks}};
   if(scenario==='pending'){window.__pending={id:'routine-a',version:0,applyCurrent:false,values:{title:'Our routine',timezone:'America/Toronto',state:'active',tasks:[tasks[0]]}};window.__saveError=true;}
   if(scenario==='paused')window.__routines.routines=[{id:'routine-a',title:'Weekend reset',timezone:'America/Toronto',state:'paused',version:1,definition:tasks.slice(0,3)}];
   window.__care={accessRole:scenario==='member'?'member':'owner',adoption:{cleaning:true},tasks:tasks.slice(0,6).map((t,i)=>({id:t.key,title:t.title,category:t.room,due_date:t.start,recurrence:'custom',status:'open',displayStatus:'upcoming',assignedMemberId:'person-'+i,assigneeName:window.__household.members[i].display_name,canComplete:i===1,cleaningRoutineId:'routine-a'}))};
  },{scenario,scale:viewport.scale});
  const screen=scenario==='member'?'care':scenario==='paused'?'routines':scenario==='reminder'?'reminder':'routine';
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+screen);
  const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByRole('textbox',{name,exact:true});
  async function capture(name){
   if(viewport.scale>1)await page.evaluate(scale=>{for(const el of document.querySelectorAll('[dir="auto"],textarea,input'))if(!el.dataset.scaled){const s=getComputedStyle(el);el.style.fontSize=parseFloat(s.fontSize)*scale+'px';if(s.lineHeight!=='normal')el.style.lineHeight=parseFloat(s.lineHeight)*scale+'px';el.dataset.scaled='1';}},viewport.scale);
   await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(el.scrollTop)el.scrollTop=0});
   assert.deepEqual(errors,[],name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
   await page.screenshot({path:out+'/'+name+'-'+viewport.width+'-'+viewport.scale+'.png'});
  }
  if(scenario==='new'||scenario==='local'){
   await page.getByRole('checkbox',{name:'Wipe kitchen counters',exact:true}).waitFor();await capture('choose-jobs');
   await page.getByRole('checkbox',{name:'Wipe kitchen counters',exact:true}).click();await button('Share this job').click();
   if(scenario==='local'){await button('Add someone whose tasks you manage').click();await field('First name or nickname').fill('Mina');await button('Add to household').click();await page.waitForFunction(()=>window.__peopleWrites.length===1);await button('Mina, managed by you').last().click();assert.equal(await page.evaluate(()=>window.__peopleWrites[0].displayName),'Mina');}
   else{await button('Raza').first().click();await button('Sumbul').first().click();await button('Take turns each week').click();assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks[0].members),['person-0','person-1']);}
   await capture(scenario==='local'?'managed-person':'share-jobs');await button('Review the routine').click();await capture('review-'+scenario);await button('Start our routine').click();await page.waitForFunction(()=>window.__writes.length===1);assert.equal(await page.evaluate(()=>window.__routes.at(-1).pathname),'/care/routines');
  }else if(scenario==='six'){
   await button('Share the jobs').click();for(const name of ['Raza','Sumbul','Alex','Sam','Taylor','Jamie'])await button(name).first().click();await button('Spread jobs across these people').click();
   assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks.map(t=>t.members[0])),Array.from({length:12},(_,i)=>'person-'+i%6));await capture('six-people');
   await button('Take turns each week').click();assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks.slice(0,6).map(t=>t.members[0])),Array.from({length:6},(_,i)=>'person-'+i));await button('Review the routine').click();await button('Start our routine').click();await page.waitForFunction(()=>window.__writes.length===1);
  }else if(scenario==='pending'){
   await button('Check saved routine').waitFor();assert.equal(await button('Start our routine').isDisabled(),true);await button('Retry the same save').click();await page.waitForFunction(()=>window.__writes.length===1);await page.getByText('The connection dropped. Your choices are kept.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__routes.length),0);await capture('pending-save');
  }else if(scenario==='member'){
   await page.getByText('Your household’s to-dos',{exact:true}).waitFor();await capture('care-member');assert.equal(await button('Remember something').count(),0);assert.equal(await button('Mark Wipe counters complete').count(),0);
   await button('Sumbul').click();assert.equal(await button('Wash dishes. View task').count(),1);assert.equal(await button('Wipe counters. View task').count(),0);await button('Mark Wash dishes complete').click();await page.waitForFunction(()=>window.__writes.length===1);
  }else if(scenario==='paused'){
   await button('Resume routine').waitFor();await capture('paused-routine');await button('Resume routine').click();await page.waitForFunction(()=>window.__writes.length===1);assert.equal(await page.evaluate(()=>window.__writes[0].draft.values.state),'active');
  }else if(scenario==='reminder'){
   await button('Put the bins out').click();assert.equal(await field('Task').inputValue(),'Put the bins out');await capture('reminder');await button('Save reminder').click();await page.waitForFunction(()=>window.__writes.length===1);
  }
  assert.deepEqual(errors,[],scenario);checks.push({scenario,...viewport,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({passed:checks.length,checks,boundaries:'Actual React Native screens and handlers rendered with RN Web. API/auth/storage/router are fixtures; no live customer data or messages. Native phone acceptance remains.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

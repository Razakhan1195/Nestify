const fs=require('node:fs'),assert=require('node:assert/strict'),{build}=require('esbuild');
const root=process.cwd(),out=root+'/docs/checkpoints/native-entry-20261021',deps='/Users/razakhan/Library/Caches/Rezlee/feedback-qa-20261017/node_modules';
const React=require(deps+'/react'),{create,act}=require(deps+'/react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const fixture=[
"import React from 'react';",
"let auth={session:{user:{id:'account-a',email:'qa@example.invalid'}},isLoading:false},route='/';",
"const listeners=new Set();const notify=()=>{for(const f of listeners)f()};",
"export const state={calls:[],pending:[],receipt:null,invitation:null,groupInvitation:null,groupInviteError:false,receiptError:false,inviteError:false,draft:null,draftError:false,history:[],switching:{current:false}};",
"export const setAuth=id=>{auth={session:id?{user:{id,email:'qa@example.invalid'}}:null,isLoading:false};notify()};",
"export const reset=(o={})=>{Object.assign(state,{calls:[],pending:[],receipt:null,invitation:null,groupInvitation:null,groupInviteError:false,receiptError:false,inviteError:false,draft:null,draftError:false,history:[],switching:{current:false}},o);route=o.route||'/';auth={session:o.signedOut?null:{user:{id:'account-a',email:'qa@example.invalid'}},isLoading:false}};",
"const sub=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};",
"export const useAuth=()=>React.useSyncExternalStore(sub,()=>auth);export const useRoute=()=>React.useSyncExternalStore(sub,()=>route);",
"export const navigate=href=>{route=typeof href==='string'?href:href.pathname;state.history.push(route);notify()};",
"export const useAccountSwitch=()=>({busy:false,error:null,switching:state.switching,switchAccount:async()=>setAuth(null)});",
"export const receipt=async()=>{if(state.receiptError)throw Error('private receipt failure');return state.receipt};",
"export const invitation=async()=>{if(state.inviteError)throw Error('private invite failure');return state.invitation};",
"export const readDraft=async()=>{if(state.draftError)throw Error('private draft failure');return state.draft};",
"export const fetchOnboarding=id=>{state.calls.push(id);return new Promise((resolve,reject)=>state.pending.push({id,resolve,reject}))};",
"export const Redirect=({href})=>{React.useEffect(()=>navigate(href),[href]);return React.createElement('redirect',{href})};",
"export const Tabs=({children})=>React.createElement('accepted-tabs',null,children);Tabs.Screen=p=>React.createElement('tab-screen',p);"
].join('\n');
const stubs={
 fixture,'expo-router':"export{Redirect,Tabs}from'fixture';",'@/auth/AuthProvider':"export{useAuth}from'fixture';",
 '@/auth/useAccountSwitch':"export{useAccountSwitch}from'fixture';",
 '@/lib/account-deletion':"export{receipt as readDeletionReceipt}from'fixture';",
 '@/lib/phone-invites':"export{invitation as readIncomingPhoneInvite}from'fixture';",
 '@/lib/expense-group-invites':"import{state}from'fixture';export const readIncomingGroupInvite=async()=>{if(state.groupInviteError)throw Error('private group invite');return state.groupInvitation};",
 '@/lib/onboarding-data':"export{fetchOnboarding}from'fixture';",
 '@/lib/onboarding-draft':"import{readDraft}from'fixture';export const setupDrafts={read:readDraft};",
 '@/lib/api':"export class ApiError extends Error{}",
 '@/components/SetupAccount':"export const SetupAccount='account-switch';",
 '@/components/RezleeLoading':"export const RezleeLoading='loading';",
 '@/components/WorkspaceUI':"export const TabHeader='header';",
 '@/components/Brief':"export const ReadNotice='retry-notice';",
 '@/lib/tab-events':"export const emitHomeTabPress=()=>{};",
 'react-native':"export const View='view',Text='text',Pressable='pressable',ActivityIndicator='loading';export const Platform={OS:'ios',select:v=>v.ios??v.default};",
 'react-native-safe-area-context':"export const useSafeAreaInsets=()=>({top:44,bottom:34,left:0,right:0});",
 '@expo/vector-icons':"export const Feather='icon';"
};
async function compile(mode){
 const base=mode==='baseline'?out+'/before/':root+'/';
 const input="import React from'react';import Entry from "+JSON.stringify(base+'apps/mobile/app/index.tsx')+";import Layout from "+JSON.stringify(base+'apps/mobile/app/(tabs)/_layout.tsx')+";import{useRoute}from'fixture';export*from'fixture';export function App(){const route=useRoute();return route==='/'?<Entry/>:route==='/(tabs)/home'?<Layout/>:<destination route={route}/>}";
 const file=out+'/'+mode+'-journey.cjs';
 await build({stdin:{contents:input,resolveDir:root,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:require.resolve(deps+'/'+a.path),external:true}));
 b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const f=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(f+ext))return{path:f+ext};}});
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));
 }}]});return require(file);
}
const payload=(role='owner',home='home-a')=>({home:home?{id:home}:null,accessRole:home?role:null});
async function mount(h,options={}){h.reset(options);let r;await act(async()=>{r=create(React.createElement(h.App))});return r;}
async function settle(h,value=payload()){const item=h.state.pending.shift();assert.ok(item,'Pending onboarding call expected');await act(async()=>item.resolve(value));}
async function close(r){await act(async()=>r.unmount());}
(async()=>{
 const results=[],baseline=await compile('baseline'),fixed=await compile('fixed');
 for(const [mode,h,expected] of [['baseline',baseline,2],['fixed',fixed,1]]){
  const r=await mount(h);for(let n=0;n<expected;n++)await settle(h);
  assert.equal(h.state.calls.length,expected);assert.equal(r.root.findAllByType('accepted-tabs').length,1);
  results.push({scenario:'existing-owner-entry',mode,networkGates:h.state.calls.length,pass:true});await close(r);
 }
 for(const scenario of ['signed-out','deletion','invitation','new-home','owner-draft','member-draft','draft-error','receipt-error','invitation-error','invalid-role','offline-retry','late-account','signout-during-read','direct-tabs','group-invitation','group-invite-error','group-only']){
  const options=scenario==='signed-out'?{signedOut:true}:scenario==='deletion'?{receipt:{userId:'account-a'}}:scenario==='invitation'?{invitation:'saved-invitation'}:scenario==='owner-draft'||scenario==='member-draft'?{draft:{phase:'choose',homeId:'home-a'}}:scenario==='draft-error'?{draftError:true}:scenario==='receipt-error'?{receiptError:true}:scenario==='invitation-error'?{inviteError:true}:scenario==='direct-tabs'?{route:'/(tabs)/home'}:scenario==='group-invitation'?{groupInvitation:'saved-group-invitation'}:scenario==='group-invite-error'?{groupInviteError:true}:{};
  const r=await mount(fixed,options);
  if(['signed-out','deletion','invitation','group-invitation'].includes(scenario)){
   assert.equal(fixed.state.calls.length,0);assert.equal(fixed.state.history.at(-1),scenario==='signed-out'?'/(auth)/welcome':scenario==='deletion'?'/delete-account':scenario==='group-invitation'?'/shared/join':'/household/join');
  }else if(['receipt-error','invitation-error','group-invite-error'].includes(scenario)){
   assert.equal(fixed.state.calls.length,0);assert.equal(fixed.state.history.length,0);assert.ok(JSON.stringify(r.toJSON()).includes('Could not load Rezlee'));assert.ok(!JSON.stringify(r.toJSON()).includes('private'));
  }else if(scenario==='late-account'){
   const old=fixed.state.pending.shift();await act(async()=>fixed.setAuth('account-b'));
   assert.equal(r.root.findAllByType('accepted-tabs').length,0);await settle(fixed,payload('member','home-b'));await act(async()=>old.resolve(payload('owner')));
   assert.equal(r.root.findAllByType('tab-screen').find(n=>n.props.name==='bills').props.options.href,null);
   assert.deepEqual(fixed.state.calls,['account-a','account-b']);
  }else if(scenario==='signout-during-read'){
   const old=fixed.state.pending.shift();await act(async()=>fixed.setAuth(null));await act(async()=>old.resolve(payload()));
   assert.equal(r.root.findAllByType('accepted-tabs').length,0);assert.equal(fixed.state.history.at(-1),'/(auth)/login');
  }else if(scenario==='offline-retry'){
   const first=fixed.state.pending.shift();await act(async()=>first.reject(Error('private network')));
   assert.equal(r.root.findAllByType('accepted-tabs').length,0);assert.ok(!JSON.stringify(r.toJSON()).includes('private network'));
   await act(async()=>r.root.findByType('retry-notice').props.onRetry());await settle(fixed);
   assert.equal(fixed.state.calls.length,2);assert.equal(r.root.findAllByType('accepted-tabs').length,1);
  }else{
   await settle(fixed,scenario==='group-only'?{...payload('owner',null),expenseGroupsAvailable:true}:scenario==='new-home'?payload('owner',null):scenario==='invalid-role'?payload('unknown'):payload(scenario==='member-draft'?'member':'owner'));
   if(['new-home','owner-draft'].includes(scenario))assert.equal(fixed.state.history.at(-1),'/onboarding');
   else if(scenario==='group-only')assert.equal(fixed.state.history.at(-1),'/shared/groups');
   else if(scenario==='invalid-role'){assert.equal(r.root.findAllByType('accepted-tabs').length,0);assert.equal(r.root.findAllByType('retry-notice').length,1);}
   else assert.equal(r.root.findAllByType('accepted-tabs').length,1);
   assert.equal(fixed.state.calls.length,1);
  }
  results.push({scenario,mode:'fixed',networkGates:fixed.state.calls.length,pass:true});await close(r);
 }
 fs.writeFileSync(out+'/journey-results.json',JSON.stringify({at:new Date().toISOString(),passed:results.length,results,scope:'Actual React entry/tab lifecycle with fixture network/router/storage/native boundaries. Existing-owner sequential onboarding calls: two before, one after. No permission cache or physical-device timing claim.'},null,2));
 console.log(JSON.stringify({passed:results.length,beforeNetworkGates:2,afterNetworkGates:1}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});

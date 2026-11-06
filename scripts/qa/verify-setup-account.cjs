/* Real React screens/hooks; controlled network, storage and native boundaries. */
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=process.cwd(),deps=process.env.REZLEE_FEEDBACK_QA_DEPS||'/Users/razakhan/Library/Caches/Rezlee/feedback-qa-20261017/node_modules';
const React=require(deps+'/react'),{create,act}=require(deps+'/react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const out='/Users/razakhan/Library/Application Support/Rezlee/store-configuration-20261017/setup-account-qa.cjs';
const stubs={
 fixture:`import React from'react';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
export const state={auth:null,listeners:new Set(),routes:[],reads:[],drafts:new Map(),writes:[],clears:[],signouts:[],creates:[],holdWrite:null,receipt:null};
export const signOut=options=>{const d=deferred();state.signouts.push({options,...d});return d.promise};
export function setAuth(userId,email){state.auth={isLoading:false,session:userId?{user:{id:userId,email:email||userId+'@example.com'}}:null,signOut};for(const fn of state.listeners)fn()};setAuth(null);
export function useAuth(){return React.useSyncExternalStore(fn=>{state.listeners.add(fn);return()=>state.listeners.delete(fn)},()=>state.auth)};
export const router={replace:route=>state.routes.push(route)};
export const fetchOnboarding=()=>{const d=deferred();state.reads.push(d);return d.promise};
export const createHomeProfile=form=>{const d=deferred();state.creates.push({form,...d});return d.promise};
export const setupDrafts={read:async id=>state.drafts.get(id)||null,write:async(id,draft)=>{state.writes.push({id,draft});if(state.holdWrite)await state.holdWrite.promise;state.drafts.set(id,draft)},clear:async id=>{state.clears.push(id);state.drafts.delete(id)}};`,
 '@/auth/AuthProvider':`export{useAuth}from'fixture';`,
 './AuthProvider':`export{useAuth}from'fixture';`,
 'expo-router':`import React from'react';import{router}from'fixture';export const useRouter=()=>router;export const Redirect=p=>React.createElement('redirect',p);`,
 'react-native':`export const View='view',Text='text',Pressable='pressable',ScrollView='scroll-view',KeyboardAvoidingView='keyboard-view';export const Platform={OS:'ios',select:v=>v.ios??v.default};`,
 'react-native-safe-area-context':`export const SafeAreaView='safe-area';`,
 '@expo/vector-icons':`export const Feather='icon';`,
 '@/components/RezleeLoading':`export const RezleeLoading=()=>'Loading';`,
 '@/components/AddressFields':`export const AddressFields='address';`,
 '@/components/TextField':`export const TextField='field';`,
 '@/components/Button':`import React from'react';export const Button=p=>React.createElement('button',p,p.label);`,
 '@/components/BillExamplePreview':`export const BillExamplePreview=()=>null;`,
 '@/components/HomeStartJourney':`export const StartingGoalOptions='goals';`,
 '@/lib/onboarding-data':`export{fetchOnboarding,createHomeProfile}from'fixture';`,
 '@/lib/onboarding-draft':`export{setupDrafts}from'fixture';`,
 '@/lib/home-start-preference':`export const saveStartingGoal=async()=>{};`,
 '@/lib/api':`export class ApiError extends Error{}`,
 '@/lib/phone-invites':`export const readIncomingPhoneInvite=async()=>null;`,
 '@/lib/account-deletion':`import{state}from'fixture';export const readDeletionReceipt=async()=>{if(state.receipt instanceof Error)throw state.receipt;return state.receipt};`,
};
const empty={home:null,homeTypeOptions:['Condo'],ownershipTypeOptions:['Rent'],accessRole:'owner'};
const form={nickname:'Home',street_address:'',city:'Toronto',province:'ON',postal_code:'M5V 2T6',home_type:'Condo',ownership_type:'Rent',approximate_year_built:''};
(async()=>{
 await build({stdin:{contents:`export{default as Setup}from${JSON.stringify(root+'/apps/mobile/app/onboarding.tsx')};export{default as Index}from${JSON.stringify(root+'/apps/mobile/app/index.tsx')};export * from'fixture';`,loader:'tsx',resolveDir:root},outfile:out,bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root+'/apps/mobile/src'},plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:require.resolve(deps+'/'+a.path),external:true}));
 b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));
 }}]});
 const h=require(out),s=h.state;let r;let checks=0;
 const mount=async(component=h.Setup)=>{await act(async()=>{r=create(React.createElement(component))})};
 const unmount=async()=>{await act(async()=>r.unmount())};
 const change=async id=>{await act(async()=>h.setAuth(id))};
 const resolve=async(payload=empty)=>{await act(async()=>s.reads.at(-1).resolve(payload))};
 const button=label=>r.root.findAllByType('button').find(n=>n.props.label===label);
 const switcher=()=>r.root.findAllByType('pressable').find(n=>n.props.accessibilityLabel==='Use a different account');
 const clickSwitch=async()=>{await act(async()=>switcher().props.onPress())};
 const text=()=>JSON.stringify(r.toJSON());
 await mount();assert.equal(r.root.findByType('redirect').props.href,'/(auth)/welcome');assert.equal(s.reads.length,0);checks++;await unmount();
 await change('a');await mount();assert.ok(text().includes('a@example.com'));assert.ok(switcher());checks++;
 const lateA=s.reads.at(-1);await change('b');await act(async()=>lateA.resolve({...empty,home:{id:'a-home'}}));assert.equal(s.routes.length,0);assert.ok(!text().includes('a@example.com'));await resolve();assert.equal(r.root.findByType('address').props.value.city,'');checks++;
 await act(async()=>{switcher().props.onPress();switcher().props.onPress();button('Continue').props.onPress()});assert.equal(s.signouts.length,1);assert.deepEqual(s.signouts[0].options,{scope:'local'});assert.equal(s.creates.length,0);assert.equal(r.root.findByType('address').props.disabled,true);checks++;
 await act(async()=>s.signouts[0].reject(Error('offline')));assert.ok(text().includes('couldn’t sign you out'));assert.equal(s.auth.session.user.id,'b');assert.equal(s.routes.length,0);await resolve();checks++;
 await clickSwitch();await act(async()=>{h.setAuth(null);s.signouts.at(-1).resolve()});assert.equal(r.root.findByType('redirect').props.href,'/(auth)/welcome');assert.equal(s.clears.length,0);checks++;await unmount();
 // Restored drafts and mutual exclusion with a real save operation.
 await change('saved');s.drafts.set('saved',{version:1,updatedAt:Date.now(),form,goal:'bills',phase:'form'});await mount();await resolve();assert.equal(r.root.findByType('address').props.value.city,'Toronto');assert.ok(text().includes('Continue where you left off'));checks++;
 const count=s.signouts.length;await act(async()=>{void button('Continue').props.onPress();switcher().props.onPress()});assert.equal(s.signouts.length,count);assert.equal(s.creates.length,1);assert.equal(switcher().props.disabled,true);checks++;
 await act(async()=>s.creates.at(-1).resolve({...empty,home:{id:'saved-home'}}));assert.ok(text().includes('Your place is ready'));assert.ok(switcher());await unmount();
 // A delayed draft write may finish for its owner, but must not create a home with the new session.
 await change('slow');s.drafts.set('slow',{version:1,updatedAt:Date.now(),form,goal:'bills',phase:'form'});await mount();await resolve();s.holdWrite=h.deferred();await act(async()=>{void button('Continue').props.onPress()});await change('new');await act(async()=>s.holdWrite.resolve());s.holdWrite=null;assert.equal(s.creates.length,1);await resolve();assert.equal(r.root.findByType('address').props.value.city,'');assert.ok(s.drafts.has('slow'));checks++;await unmount();
 // Existing households still skip setup; signed-out users see welcome, not an empty setup.
 await change('returning');await mount();await resolve({...empty,home:{id:'existing'}});assert.equal(s.routes.at(-1),'/(tabs)/home');checks++;await unmount();
 await change('load-error');await mount();await act(async()=>s.reads.at(-1).reject(Error('offline')));assert.ok(text().includes('Setup could not load'));assert.ok(switcher());await clickSwitch();await act(async()=>s.signouts.at(-1).resolve());assert.equal(s.routes.at(-1),'/(auth)/welcome');checks++;await unmount();
 // Entry recovery exposes the same escape without destroying deletion/invitation state.
 await change('entry-error');s.receipt=Error('storage failure');await mount(h.Index);assert.ok(text().includes('Could not load Rezlee'));assert.ok(switcher());await clickSwitch();await act(async()=>s.signouts.at(-1).resolve());assert.equal(s.routes.at(-1),'/(auth)/welcome');checks++;await unmount();
 s.receipt=null;await change(null);await mount(h.Index);assert.equal(r.root.findByType('redirect').props.href,'/(auth)/welcome');checks++;await unmount();
 console.log(JSON.stringify({checks,result:'passed',scope:'Actual React screens and hook; fixture auth/network/storage/native APIs, not phone acceptance.'}));
})().catch(e=>{console.error(e);process.exitCode=1});

/* Component lifecycle verification; device APIs are controlled fixtures, not phone acceptance. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=process.cwd(),deps=process.env.REZLEE_FEEDBACK_QA_DEPS||'/Users/razakhan/Library/Caches/Rezlee/feedback-qa-20261017/node_modules';
const React=require(deps+'/react'),{create,act}=require(deps+'/react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const work='/Users/razakhan/Library/Application Support/Rezlee/store-configuration-20261017/feedback-component-qa';fs.mkdirSync(work,{recursive:true});
const fixture=`import React from'react';let value={session:null,isLoading:false,recentSignIn:null};const listeners=new Set();
export const state={reads:new Map(),app:'active',events:new Set(),mounts:0,unmounts:0,clicks:0};
export const setAuth=next=>{value={...value,...next};for(const fn of listeners)fn()};
export function useAuth(){return React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>value)}
export function read(id){return new Promise(resolve=>state.reads.set(id,resolve))}
export function settle(id,value){state.reads.get(id)?.(value)}
export function background(){state.app='background';for(const fn of state.events)fn('background')}
export function Probe(){React.useEffect(()=>{state.mounts++;return()=>{state.unmounts++}},[]);return React.createElement('input',{value:'in-flight entry',onClick:()=>{state.clicks++}})};`;
const stubs={
 fixture,
 '@/auth/AuthProvider':`export{useAuth}from'fixture';`,
 'react-native':`import React from'react';import{state}from'fixture';export const View='view',Text='text',Modal='native-modal',Pressable='pressable';export const Platform={OS:'ios',select:v=>v.ios??v.default};export const ScrollView=React.forwardRef((p,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo:()=>{}}));return React.createElement('scroll-view',p,p.children)});export const useWindowDimensions=()=>({width:390,height:844,fontScale:1});export const AppState={get currentState(){return state.app},addEventListener(_,fn){state.events.add(fn);return{remove:()=>state.events.delete(fn)}}};`,
 'react-native-safe-area-context':`export const SafeAreaView='safe-area';`,
 'expo-secure-store':`import{read}from'fixture';export const getItemAsync=key=>read(key.replace('rezlee.lock.v1.',''));export const setItemAsync=async()=>{};`,
 './biometrics':`export const biometricCapability=async()=>({available:true,label:'Face ID',detail:''});export const authenticateBiometric=async()=>true;`,
 '@/components/Button':`import React from'react';export const Button=p=>React.createElement('button',p,p.label);`,
 '@/components/RezleeLoading':`import React from'react';export const RezleeLoading=()=>React.createElement('loading');`,
 '@/lib/supabase':`import{setAuth}from'fixture';export const supabase={auth:{signOut:async()=>{setAuth({session:null});return{error:null}}}};`,
 'expo-router':`export const Redirect=()=>null;`,
 '@expo/vector-icons':`export const Feather='icon';`,
};
async function compile(mode){
 const input=mode==='baseline'?'/Users/razakhan/Library/Application Support/Rezlee/store-configuration-20261017/feedback-before/apps/mobile/src/auth/AppLockProvider.tsx':path.join(root,'apps/mobile/src/auth/AppLockProvider.tsx');
 await build({stdin:{contents:`export{AppLockProvider,AppLockScreen}from${JSON.stringify(input)};export * from'fixture';export{SignupIntroduction}from${JSON.stringify(root+'/apps/mobile/src/components/SignupIntroduction.tsx')};`,loader:'tsx',resolveDir:root},outfile:work+'/'+mode+'.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root+'/apps/mobile/src'},plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:require.resolve(deps+'/'+a.path),external:true}));
 b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:a.path==='./Button'?{path:'@/components/Button',namespace:'fixture'}:a.path==='./AuthProvider'?{path:'@/auth/AuthProvider',namespace:'fixture'}:a.path==='./app-lock-core'?{path:root+'/apps/mobile/src/auth/app-lock-core.ts'}:undefined);
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));
 }}]});return require(work+'/'+mode+'.cjs');
}
async function scenario(mode){
 const h=await compile(mode);let renderer;
 const tree=()=>React.createElement(h.AppLockProvider,null,React.createElement(h.AppLockScreen,{publicRoute:true},React.createElement(h.Probe)));
 await act(async()=>{renderer=create(tree())});
 assert.equal(h.state.mounts,1);
 await act(async()=>{h.setAuth({session:{user:{id:'account-a'}}})});
 const during={mounts:h.state.mounts,unmounts:h.state.unmounts,visibleNativeModals:renderer.root.findAllByType('native-modal').filter(n=>n.props.visible).length};
 await act(async()=>{h.settle('account-a',null)});
 await act(async()=>{renderer.root.findByType('input').props.onClick()});
 const after={...during,finalMounts:h.state.mounts,clicks:h.state.clicks};
 if(mode==='baseline'){
  assert.ok(during.unmounts>0||during.visibleNativeModals>0,'Baseline must demonstrate the risky lifecycle');
 }else{
  assert.equal(during.unmounts,0,'Session establishment must retain the sign-in navigator');
  assert.equal(during.visibleNativeModals,0,'No native privacy modal during first login');
  assert.equal(h.state.mounts,1);assert.equal(h.state.clicks,1);
  await act(async()=>{h.setAuth({recentSignIn:{userId:'account-a',at:Date.now()}})});
  await act(async()=>{h.settle('account-a',null)});
  assert.equal(h.state.mounts,1,'Fresh sign-in proof must not recreate the entry screen');
  await act(async()=>{h.setAuth({session:null,recentSignIn:null})});assert.equal(h.state.mounts,1);
  await act(async()=>{h.setAuth({session:{user:{id:'locked-account'}}})});
  await act(async()=>{h.settle('locked-account','1')});
  // Automatic biometric authentication is a fixture. A subsequent real
  // background visit must still shield the opened, opted-in account.
  await act(async()=>{h.background()});
  assert.equal(renderer.root.findAllByType('native-modal').some(n=>n.props.visible),true,'Privacy must remain on after real backgrounding');
 }
 await act(async()=>renderer.unmount());
 if(mode==='fixed'){
  let continued=0;
  await act(async()=>{renderer=create(React.createElement(h.SignupIntroduction,{onContinue:()=>continued++,onSignIn:()=>{},onBack:()=>{}}))});
  const next=()=>renderer.root.findAllByType('button').find(n=>n.props.label==='Next');
  await act(async()=>next().props.onPress());await act(async()=>next().props.onPress());
  await act(async()=>renderer.root.findAllByType('button').find(n=>n.props.label==='Create my account').props.onPress());assert.equal(continued,1);
  await act(async()=>renderer.root.findAllByType('pressable').find(n=>n.props.accessibilityLabel==='Skip introduction').props.onPress());assert.equal(continued,2);
  await act(async()=>renderer.unmount());
 }
 return after;
}
(async()=>{const result={baseline:await scenario('baseline'),fixed:await scenario('fixed'),boundary:'Real React component lifecycle, fixture SecureStore and biometric/native modal APIs. Does not establish physical iOS responsiveness.'};fs.writeFileSync(work+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exitCode=1});

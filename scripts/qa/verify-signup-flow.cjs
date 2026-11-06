/* Actual signup screens and controls, with controlled auth/native/storage boundaries. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{build}=require('esbuild');
const root=process.cwd(),deps='/Users/razakhan/Library/Caches/Rezlee/feedback-qa-20261017/node_modules';
const React=require(deps+'/react'),{create,act}=require(deps+'/react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const out='/Users/razakhan/Library/Application Support/Rezlee/store-configuration-20261017';
const stubs={
 fixture:`import React from'react';export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
export const state={session:null,listeners:new Set(),pending:null,writes:[],clears:0,requests:[],resends:[],routes:[],providers:null,social:[],now:1000000,timers:new Map()};
export const signUp=(...args)=>{const d=deferred();state.requests.push({args,...d});return d.promise};
export const resendConfirmation=(email)=>{const d=deferred();state.resends.push({email,...d});return d.promise};
let auth={session:null,signUp,resendConfirmation};export function setSession(session){auth={...auth,session};for(const fn of state.listeners)fn()};
export function useAuth(){return React.useSyncExternalStore(fn=>{state.listeners.add(fn);return()=>state.listeners.delete(fn)},()=>auth)};
export const router={replace:value=>state.routes.push(value),back:()=>state.routes.push('back'),canGoBack:()=>false};`,
 '@/auth/AuthProvider':`export{useAuth}from'fixture';`,
 'expo-router':`import{router}from'fixture';export const useRouter=()=>router;`,
 'expo-router/react-navigation':`export const usePreventRemove=()=>{};`,
 'react-native':`import React from'react';export const View='view',Text='text',Pressable='pressable',ActivityIndicator='spinner',KeyboardAvoidingView='keyboard-view';export const Keyboard={dismiss:()=>{}};export const Platform={OS:'ios',select:v=>v.ios??v.default};export const ScrollView=React.forwardRef((p,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo:()=>{}}));return React.createElement('scroll-view',p,p.children)});export const useWindowDimensions=()=>({width:320,height:568,fontScale:1});`,
 'react-native-safe-area-context':`export const SafeAreaView='safe-area';`,
 '@expo/vector-icons':`export const Feather='icon',FontAwesome='brand-icon';`,
 '@/components/Button':`import React from'react';export const Button=p=>React.createElement('button',p,p.label);`,
 './Button':`import React from'react';export const Button=p=>React.createElement('button',p,p.label);`,
 '@/components/TextField':`export const TextField='field';`,
 './LegalLinks':`export const LegalLinks=()=>'Terms and Privacy';`,
 '@/auth/pending-signup':`import{state}from'fixture';export const readPendingSignup=async()=>state.pending;export const rememberPendingSignup=async email=>{state.pending=email;state.writes.push(email)};export const clearPendingSignup=async()=>{state.pending=null;state.clears++};`,
 '@/auth/social-auth':`import{state,deferred}from'fixture';export const socialProviders=()=>state.providers.promise;export const startSocialSignIn=provider=>{const d=deferred();state.social.push({provider,...d});return d.promise};`,
};
async function compile(name,intro){
 const file=out+'/signup-flow-'+name+'.cjs';
 await build({stdin:{contents:`export{default as Signup}from${JSON.stringify(root+'/apps/mobile/app/(auth)/signup.tsx')};export{SignupIntroduction}from${JSON.stringify(intro)};export * from'fixture';`,loader:'tsx',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root+'/apps/mobile/src'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:require.resolve(deps+'/'+a.path),external:true}));b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});return require(file);
}
async function layoutCase(h,shouldFail){
 let r;await act(async()=>{r=create(React.createElement(h.SignupIntroduction,{onContinue:()=>{},onBack:()=>{},onSignIn:()=>{}}))});
 const handlers=r.root.findAllByType('view').filter(n=>n.props.onLayout).map(n=>n.props.onLayout);
 const run=async()=>await act(async()=>{for(let i=0;i<handlers.length;i++){const event={nativeEvent:{layout:{height:600+i*30}}};handlers[i](event);event.nativeEvent=null;}});
 if(shouldFail)await assert.rejects(run,TypeError);else{await run();const horizontal=r.root.findAllByType('scroll-view').find(n=>n.props.horizontal);assert.equal(horizontal.props.style.height,660)}
 await act(async()=>r.unmount());
}
(async()=>{
 const before=await compile('baseline',out+'/signup-refinement-before/apps/mobile/src/components/SignupIntroduction.tsx');await layoutCase(before,true);
 const h=await compile('fixed',root+'/apps/mobile/src/components/SignupIntroduction.tsx');await layoutCase(h,false);const s=h.state;
 const oldNow=Date.now,oldSet=global.setInterval,oldClear=global.clearInterval;Date.now=()=>s.now;global.setInterval=fn=>{const id=Symbol();s.timers.set(id,fn);return id};global.clearInterval=id=>s.timers.delete(id);
 let r,checks=2;
 const mount=async()=>{s.providers=h.deferred();await act(async()=>{r=create(React.createElement(h.Signup))})};
 const unmount=async()=>{await act(async()=>r.unmount())};
 const button=label=>r.root.findAllByType('button').find(n=>n.props.label===label);
 const text=()=>JSON.stringify(r.toJSON(),(key,value)=>key==='style'&&typeof value==='function'?value({pressed:false}):value);
 const field=label=>r.root.findAllByType('field').find(n=>n.props.label===label);
 const pressable=label=>r.root.findAllByType('pressable').find(n=>n.props.accessibilityLabel===label);
 await mount();assert.equal(r.root.findAllByType('field').length,0);assert.ok(button('Continue with email'));assert.ok(!text().includes('Skip introduction'));checks++;
 await act(async()=>s.providers.resolve({google:true,apple:true}));const social=r.root.findAllByType('pressable').filter(n=>/Continue with/.test(n.props.accessibilityLabel||''));assert.deepEqual(social.map(n=>n.props.accessibilityLabel),['Continue with Apple','Continue with Google']);fs.writeFileSync(out+'/signup-layout-choice.json',JSON.stringify(r.toJSON(),(key,value)=>key==='style'&&typeof value==='function'?value({pressed:false}):value));checks++;
 await act(async()=>{pressable('Continue with Apple').props.onPress();pressable('Continue with Apple').props.onPress()});assert.equal(s.social.length,1);assert.equal(button('Continue with email').props.disabled,true);checks++;
 await act(async()=>s.social[0].reject(Error('Sign-in wasn’t completed.')));assert.ok(text().includes('Sign-in wasn’t completed.'));assert.equal(button('Continue with email').props.disabled,false);checks++;
 await act(async()=>button('Continue with email').props.onPress());assert.equal(r.root.findAllByType('field').length,2);assert.equal(button('Create my account').props.disabled,true);checks++;
 await act(async()=>{field('Email address').props.onChangeText('new@example.com');field('Password').props.onChangeText('long-password-value')});assert.equal(button('Create my account').props.disabled,false);fs.writeFileSync(out+'/signup-layout-email.json',JSON.stringify(r.toJSON(),(key,value)=>key==='style'&&typeof value==='function'?value({pressed:false}):value));
 await act(async()=>pressable('Show password').props.onPress());assert.equal(field('Password').props.secureTextEntry,false);checks++;
 await act(async()=>pressable('Back to sign-up options').props.onPress());assert.equal(r.root.findAllByType('field').length,0);await act(async()=>button('Continue with email').props.onPress());assert.equal(field('Email address').props.value,'new@example.com');checks++;
 await act(async()=>{void button('Create my account').props.onPress();void button('Create my account').props.onPress()});assert.equal(s.requests.length,1);assert.equal(field('Email address').props.editable,false);checks++;
 await act(async()=>s.requests[0].resolve({error:null,confirmationRequired:true}));assert.ok(text().includes('Check your inbox.'));fs.writeFileSync(out+'/signup-layout-confirm.json',JSON.stringify(r.toJSON(),(key,value)=>key==='style'&&typeof value==='function'?value({pressed:false}):value));assert.equal(s.pending,'new@example.com');assert.equal(r.root.findAllByType('field').length,0);assert.ok(button('Send another email in 60s').props.disabled);checks++;
 await act(async()=>{s.now+=61000;for(const fn of s.timers.values())fn()});await act(async()=>{void button('Send another confirmation').props.onPress();void button('Send another confirmation').props.onPress()});assert.equal(s.resends.length,1);await act(async()=>s.resends[0].resolve({error:'Too many attempts. Wait a little before trying again.'}));assert.ok(text().includes('Too many attempts'));assert.ok(text().includes('Check your inbox.'));checks++;
 await unmount();await mount();assert.ok(text().includes('Check your inbox.'));assert.equal(s.providers.promise instanceof Promise,true);assert.equal(s.social.length,1);checks++;
 await act(async()=>button('Continue to sign in').props.onPress());assert.deepEqual(s.routes.at(-1),{pathname:'/(auth)/login',params:{email:'new@example.com'}});checks++;await unmount();
 s.pending=null;await mount();await act(async()=>s.providers.reject(Error('offline')));assert.ok(text().includes('Other sign-in options couldn’t load'));await act(async()=>button('Continue with email').props.onPress());assert.ok(field('Email address'));checks++;
 await act(async()=>{field('Email address').props.onChangeText('other@example.com');field('Password').props.onChangeText('long-password-value')});await act(async()=>{void button('Create my account').props.onPress()});await act(async()=>s.requests.at(-1).reject(Error('network failure')));assert.ok(text().includes('Check your connection'));assert.equal(button('Create my account').props.loading,false);checks++;
 await act(async()=>h.setSession({user:{id:'new-user'}}));assert.equal(s.routes.at(-1),'/');checks++;await unmount();
 Date.now=oldNow;global.setInterval=oldSet;global.clearInterval=oldClear;
 console.log(JSON.stringify({checks,result:'passed',baseline:'Reproduced TypeError by invalidating native layout events before deferred state reducers',fixed:'Layout snapshot survives event reuse; signup no longer renders duplicate carousel',scope:'Actual React signup, social controls and frame with native/network/storage fixtures; phone acceptance remains required.'}));
})().catch(e=>{console.error(e);process.exitCode=1});

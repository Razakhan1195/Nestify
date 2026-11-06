const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{build}=require('esbuild');
const root=process.cwd(),out=root+'/docs/checkpoints/expense-groups-20261021',deps='/Users/razakhan/Library/Caches/Rezlee/feedback-qa-20261017/node_modules';
const React=require(deps+'/react'),{create,act}=require(deps+'/react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const fixture=`
import React from'react';
let auth={session:{user:{id:'account-a'}},isLoading:false},params={};
const listeners=new Set(),notify=()=>{for(const f of listeners)f()};
export const state={storage:new Map(),writes:[],reads:[],post:null,readFailure:false,writeFailure:false,nextId:0};
export const setAuth=id=>{auth={session:id?{user:{id}}:null,isLoading:false};notify()};
export const setParams=value=>{params=value;notify()};
export const reset=()=>{state.storage.clear();state.writes=[];state.reads=[];state.post=null;state.readFailure=false;state.writeFailure=false;params={};auth={session:{user:{id:'account-a'}},isLoading:false}};
const sub=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
export const useAuth=()=>React.useSyncExternalStore(sub,()=>auth);
export const useLocalSearchParams=()=>React.useSyncExternalStore(sub,()=>params);
export const supabase={auth:{getSession:async()=>({data:auth})}};
export class ApiError extends Error{constructor(message,status){super(message);this.status=status}};
export const getItemAsync=async key=>{if(state.readFailure)throw Error('storage read unavailable');return state.storage.get(key)??null};
export const setItemAsync=async(key,value)=>{if(state.writeFailure)throw Error('storage write unavailable');state.storage.set(key,value)};
export const deleteItemAsync=async key=>{state.storage.delete(key)};
export const randomUUID=()=> 'request-'+(++state.nextId);
export const apiGet=(url,options)=>new Promise((resolve,reject)=>state.reads.push({url,options,resolve,reject}));
export const apiPost=async(url,body,options)=>{if(options?.expectedUserId&&options.expectedUserId!==auth.session?.user.id)throw new ApiError('Account changed',409);state.writes.push({url,body,options});return state.post?state.post():{ok:true,id:'entry-new',groupId:body.groupId??'new-group'}};
`;
const stubs={
 fixture,'expo-secure-store':"export{getItemAsync,setItemAsync,deleteItemAsync}from'fixture';",'expo-crypto':"export{randomUUID}from'fixture';",
 '@/auth/AuthProvider':"export{useAuth}from'fixture';",
 'expo-router':"import React from'react';export{useLocalSearchParams}from'fixture';export const useFocusEffect=fn=>React.useEffect(fn,[fn]);",
 'react-native':"export const ActivityIndicator='loading',KeyboardAvoidingView='keyboard',Pressable='pressable',ScrollView='scroll',Text='text',View='view';export const Platform={OS:'ios',select:v=>v.ios??v.default};",
 'react-native-safe-area-context':"export const SafeAreaView='safe';",
 '@expo/vector-icons':"export const Feather='icon';",
 '@/components/FormScrollView':"export const FormScrollView='form';",
 '@/components/SafeAreaModal':"export const SafeAreaModal='modal';",
 './ScreenNavigation':"export const ScreenNavigation='navigation';",
 './Brief':"export const QuietAction='action';",
};
(async()=>{
 const file=out+'/client-boundaries.cjs';
 await build({stdin:{contents:"import React from'react';import{useSharedLedger}from'./apps/mobile/src/components/SharedExpenseUI';export*from'./apps/mobile/src/lib/shared-expenses';export*from'./apps/mobile/src/lib/expense-groups';export*from'fixture';export function Probe({id}){const value=useSharedLedger(id);return React.createElement('probe',{value})}",resolveDir:root,loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:require.resolve(deps+'/'+a.path),external:true}));
 b.onResolve({filter:/.*/},a=>{
  if(stubs[a.path])return{path:a.path,namespace:'stub'};
  const resolved=path.resolve(a.resolveDir,a.path);
  if(resolved===root+'/apps/mobile/src/lib/api'||a.path==='@/lib/api')return{path:'api',namespace:'stub'};
  if(resolved===root+'/apps/mobile/src/lib/supabase')return{path:'supabase',namespace:'stub'};
  if(a.path.startsWith('@/')){const f=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx'])if(fs.existsSync(f+ext))return{path:f+ext};}
 });
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='api'?"export{apiGet,apiPost,ApiError}from'fixture';":a.path==='supabase'?"export{supabase}from'fixture';":stubs[a.path],loader:'tsx',resolveDir:root}));
 }}]});
 const h=require(file),results=[],groupA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',groupB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',command={operation:'add_person',name:'Alex'};
 const pass=name=>results.push({scenario:name,passed:true});
 const rejects=p=>assert.rejects(p);
 h.reset();await h.saveSharedExpense('home-a',command,undefined,'account-a');assert.equal(h.state.writes[0].url,'/api/mobile/v1/shared-expenses');assert.equal(h.state.storage.size,0);
 await h.saveSharedExpense(groupA,command,groupA,'account-a');assert.equal(h.state.writes[1].url,'/api/mobile/v1/expense-groups');assert.equal(h.state.writes[1].body.groupId,groupA);assert.equal(h.state.writes[1].body.action,'ledger');pass('Household and group writes retain explicit scope');
 h.reset();h.state.post=()=>{throw new h.ApiError('Timeout',0)};await rejects(h.saveSharedExpense(groupA,command,groupA,'account-a'));const initial=h.state.writes[0].body;
 await rejects(h.saveSharedExpense(groupB,command,groupB,'account-a'));assert.equal(h.state.writes.length,1);h.state.post=null;await h.saveSharedExpense(groupA,command,groupA,'account-a');assert.deepEqual(h.state.writes[1].body,initial);assert.equal(h.state.storage.size,0);pass('Uncertain save retains exact intent and cannot migrate to another group');
 h.reset();h.setAuth('account-b');await rejects(h.saveSharedExpense(groupA,command,groupA,'account-a'));await rejects(h.saveGroupAction({action:'create_group',name:'Home'},'account-a'));assert.equal(h.state.writes.length,0);assert.equal(h.state.storage.size,0);pass('Account mismatch rejects before persisting or sending');
 for(const mode of ['ledger','group']){
  h.reset();let reject;h.state.post=()=>new Promise((_,no)=>{reject=no});
  const pending=mode==='ledger'?h.saveSharedExpense(groupA,command,groupA,'account-a'):h.saveGroupAction({action:'create_group',name:'Roommates'},'account-a');
  const caught=rejects(pending);while(!reject)await new Promise(r=>setImmediate(r));h.setAuth('account-b');reject(new h.ApiError('Account changed',409));await caught;
  assert.equal(h.state.storage.size,1);h.setAuth('account-a');h.state.post=null;
  if(mode==='ledger')await h.saveSharedExpense(groupA,command,groupA,'account-a');else await h.retryGroupAction('account-a');
  assert.equal(h.state.writes[0].body.requestId,h.state.writes[1].body.requestId);assert.equal(h.state.storage.size,0);pass(mode+' account switch preserves an unfinished save');
 }
 h.reset();h.state.writeFailure=true;await rejects(h.saveSharedExpense(groupA,command,groupA,'account-a'));assert.equal(h.state.writes.length,0);pass('Durable-save failure sends no financial mutation');
 h.reset();h.state.post=()=>{throw new h.ApiError('Balance changed',409)};await rejects(h.saveSharedExpense(groupA,command,groupA,'account-a'));assert.equal(h.state.storage.size,0);pass('Definitive same-account rejection allows corrected details');
 const payload=(group,id='entry')=>({groupId:group,home:{id:group,name:'Synthetic'},role:'owner',people:[],balances:[],entries:[{id}],changes:[],moreChanges:false,nextCursor:null});
 const value=r=>r.root.findByType('probe').props.value;
 async function mount(group,id){h.reset();h.setParams(group===undefined?{}:{groupId:group});let r;await act(async()=>{r=create(React.createElement(h.Probe,{id}))});return r;}
 async function resolve(index,data){await act(async()=>h.state.reads[index].resolve(data));}
 async function close(r){await act(async()=>r.unmount());}
 let r=await mount(groupA);await resolve(0,payload(groupA));assert.equal(value(r).data.viewerId,'account-a');
 await act(async()=>h.setParams({groupId:groupB}));assert.equal(value(r).data,null);await resolve(1,payload(groupB));assert.equal(value(r).data.groupId,groupB);pass('Changing groups hides the prior ledger immediately');await close(r);
 r=await mount(groupA);await act(async()=>h.setParams({groupId:groupB}));await resolve(1,payload(groupB));await resolve(0,payload(groupA));assert.equal(value(r).data.groupId,groupB);pass('Late previous-group response cannot replace current ledger');await close(r);
 r=await mount(groupA,'entry-one');await resolve(0,payload(groupA,'entry-one'));await act(async()=>r.update(React.createElement(h.Probe,{id:'entry-two'})));assert.equal(value(r).data,null);await resolve(1,payload(groupA,'entry-two'));assert.equal(value(r).data.entries[0].id,'entry-two');pass('Entry navigation hides stale detail before the next response');await close(r);
 r=await mount(groupA);await act(async()=>h.setAuth('account-b'));await resolve(1,payload(groupA));await resolve(0,payload(groupA));assert.equal(value(r).data.viewerId,'account-b');pass('Late previous-account response is discarded');await close(r);
 r=await mount([groupA,groupB]);assert.equal(h.state.reads.length,0);assert.equal(value(r).data,null);assert.match(value(r).error,/available expense group/);pass('Malformed group scope never falls back to household expenses');await close(r);
 r=await mount(groupA);await resolve(0,payload(groupB));assert.equal(value(r).data,null);assert.match(value(r).error,/could not be checked/);pass('Mismatched server scope is rejected');await close(r);
 r=await mount(groupA);await resolve(0,payload(groupA));let loading;await act(async()=>{loading=value(r).load()});await act(async()=>h.state.reads[1].reject(new h.ApiError('Revoked',403)));await loading;assert.equal(value(r).data,null);pass('Revoked membership clears the visible ledger');await close(r);
 fs.writeFileSync(out+'/client-results.json',JSON.stringify({at:new Date().toISOString(),passed:results.length,results,scope:'Actual client persistence, scoped networking and React ledger lifecycle with synthetic network/storage/native boundaries; not device acceptance.'},null,2));
 console.log(JSON.stringify({passed:results.length}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});

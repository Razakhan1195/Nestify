import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
type AuthState={session:{user:{id:string;email:string;identities:unknown[];user_metadata:object}}|null;isLoading:boolean};
type Rendered={type:unknown;props:unknown};
const root=path.resolve("apps/mobile");
const routes=['profile','app-security','profile-appearance','claim-membership','quick-guide','household/details'];
function load(route:string){
 let auth:AuthState={session:null,isLoading:true};
 const placeholder:()=>null=new Proxy(()=>null,{get:()=>placeholder});
 const exports:{default?:()=>Rendered}={};
 function requireMock(name:string){
  if(name==='react/jsx-runtime')return {jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})};
  if(name==='react')return {useRef:(value:unknown)=>({current:value}),useState:(value:unknown)=>[value,()=>{}],useEffect:()=>{}};
  if(name==='expo-router')return {Redirect:'Redirect',useRouter:()=>({}),useNavigation:()=>({})};
  if(name==='react-native')return {useWindowDimensions:()=>({height:840,fontScale:1}),Text:'Text',View:'View',Pressable:'Pressable'};
  if(name==='@/auth/AuthProvider')return {useAuth:()=>auth};
  if(name==='@/auth/AppLockProvider')return {useAppLock:()=>({state:{ready:true,busy:false},available:false,label:'Device unlock',detail:'Not enrolled'})};
  if(name==='@/components/RezleeLoading')return {RezleeLoading:'RezleeLoading'};
  return new Proxy({},{get:()=>placeholder});
 }
 const source=fs.readFileSync(path.join(root,'app',route+'.tsx'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(js,{exports,require:requireMock},{filename:route+'.tsx'});
 const render=exports.default;assert.ok(render);
 return {render,set:(value:AuthState)=>{auth=value;}};
}
for(const route of routes)test(route+' preserves its destination during session restoration',()=>{
 const app=load(route);
 assert.equal(app.render().type,'RezleeLoading','An unresolved session must not redirect to login');
 app.set({session:{user:{id:'synthetic',email:'review@example.invalid',identities:[],user_metadata:{}}},isLoading:false});
 assert.notEqual(app.render().type,'Redirect','Restored session should render the requested page');
 app.set({session:null,isLoading:false});
 assert.equal(app.render().type,'Redirect','Confirmed sign-out must still require authentication');
});

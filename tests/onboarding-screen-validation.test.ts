import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as validation from "../apps/mobile/src/lib/home-profile-validation";
import { homeTypeOptions, ownershipTypeOptions } from "../src/lib/onboarding/config";
type Node = {type: unknown; props: Record<string, unknown>};
type Draft = {form:Record<string,string>;goal:string;phase:string};
const empty = {nickname:"Home",street_address:"",city:"",province:"",postal_code:"",home_type:"",ownership_type:"",approximate_year_built:""};
class ApiError extends Error { constructor(message:string,public status:number,public details?:unknown){super(message);} }
function screen(draft:Draft|null=null, reject?:ApiError) {
  const state:unknown[]=[];let cursor=0;
  const effects:(()=>void)[]=[];
  const saves:Record<string,unknown>[]=[];
  const session={user:{id:"11111111-1111-4111-8111-111111111111",email:"test@example.invalid",user_metadata:{}}};
  const router={replace:()=>{}};
  const account={busy:false,switching:{current:false},switchAccount:async()=>{},error:null};
  const payload={home:null,accessRole:null,addressSearchAvailable:false,homeTypeOptions,ownershipTypeOptions,goals:[],actions:[]};
  const exports:{default?:()=>Node}={};
  const requireMock=(name:string):unknown=>{
    if(name === "@/theme/useTheme") return {useTheme:()=>({colors:{}})};
    if(name==="react/jsx-runtime")return {jsx:(type:unknown,props:Node["props"])=>({type,props}),jsxs:(type:unknown,props:Node["props"])=>({type,props})};
    if(name==="react")return {
      useState:(initial:unknown)=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==="function"?initial():initial;return [state[i],(next:unknown)=>{state[i]=typeof next==="function"?next(state[i]):next;}];},
      useRef:(initial:unknown)=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},
      useEffect:(fn:()=>void,deps:unknown[])=>{const i=cursor++;const old=state[i] as unknown[]|undefined;if(!old||deps.some((v,j)=>v!==old[j]))effects.push(fn);state[i]=deps;},
    };
    if(name==="expo-router")return {Redirect:"Redirect",useRouter:()=>router};
    if(name==="react-native")return {Pressable:"Pressable",Text:"Text",View:"View"};
    if(name==="react-native-safe-area-context")return {SafeAreaView:"SafeAreaView"};
    if(name==="@expo/vector-icons")return {Feather:"Feather"};
    if(name==="@/auth/AuthProvider")return {useAuth:()=>({session,isLoading:false})};
    if(name==="@/auth/useAccountSwitch")return {useAccountSwitch:()=>account};
    if(name==="@/lib/home-profile-validation")return validation;
    if(name==="@/lib/canadian-address")return {validPostalCode:()=>true};
    if(name==="@/lib/profile-identity")return {profileName:()=>""};
    if(name==="@/lib/onboarding-draft")return {setupDrafts:{read:async()=>draft,write:async()=>{},clear:async()=>{}}};
    if(name==="@/lib/onboarding-draft-core")return {shouldResumeSetup:()=>false};
    if(name==="@/lib/api")return {ApiError};
    if(name==="@/lib/onboarding-data")return {fetchOnboarding:async()=>payload,createHomeProfile:async(input:Record<string,unknown>)=>{saves.push(input);if(reject)throw reject;return {...payload,home:{id:"home"}};}};
    if(name==="@/lib/supabase")return {supabase:{auth:{getSession:async()=>({data:{session}}),updateUser:async()=>({data:{user:session.user}})}}};
    if(name==="@/theme/tokens")return {colors:{},layout:{},radii:{},spacing:{},typography:{}};
    if(name==="@/lib/home-start")return {startingContent:{bills:{action:"Add a bill"}}};
    if(name==="@/lib/home-start-preference")return {saveStartingGoal:async()=>{}};
    if(name.startsWith("@/components/"))return new Proxy({},{get:(_,key)=>String(key)});
    throw Error("Unexpected import "+name);
  };
  const source=process.env.REZLEE_ONBOARDING_BEFORE ? "docs/checkpoints/signup-validation-20261104/before/apps/mobile/app/onboarding.tsx" : "apps/mobile/app/onboarding.tsx";
  const js=ts.transpileModule(fs.readFileSync(source,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(js,{exports,require:requireMock});
  const outer=exports.default!();
  const component=outer.type as (props:Node["props"])=>Node;
  let tree:Node;
  function render(){cursor=0;tree=component(outer.props);for(const effect of effects.splice(0))effect();return tree;}
  function nodes(value:unknown=tree):Node[]{
    if(Array.isArray(value))return value.flatMap(v=>nodes(v));
    if(!value||typeof value!=="object"||!("props" in value))return [];
    const n=value as Node;return [n,...(n.props.children === undefined ? [] : nodes(n.props.children))];
  }
  function find(predicate:(node:Node)=>boolean){const n=nodes().find(predicate);assert.ok(n,"Control not rendered");return n;}
  async function settle(){await new Promise<void>(resolve=>setImmediate(resolve));render();}
  async function load(){render();await settle();}
  const updateAddress=(change:Record<string,string>)=>{const n=find(n=>n.type==="AddressFields"&&!n.props.hideLocation === true);(n.props.onChange as (v:unknown)=>void)({...n.props.value as object,...change});render();};
  async function submit(){const n=find(n=>n.type==="Button"&&n.props.label==="Continue");assert.notEqual(n.props.disabled,true);await (n.props.onPress as ()=>Promise<void>)();render();}
  return {load,render,find,nodes,saves,settle,updateAddress,submit};
}
test("setup accepts only city and province with optional details left collapsed",async()=>{
  const h=screen();await h.load();
  h.updateAddress({city:"Toronto",province:"Ontario"});
  await h.submit();
  assert.equal(h.saves.length,1);
  assert.equal(h.saves[0].postal_code,"");assert.equal(h.saves[0].home_type,"");
  assert.ok(h.nodes().some(n=>n.type==="Text"&&n.props.children==="Your place is ready"));
});
test("missing required fields produce visible errors instead of a silently disabled Continue",async()=>{
  const h=screen();await h.load();await h.submit();
  assert.equal(h.saves.length,0);
  const fields=h.find(n=>n.type==="AddressFields").props.errors as validation.HomeProfileErrors;
  assert.ok(fields.city);assert.ok(fields.province);
  assert.ok(h.nodes().some(n=>n.props.accessibilityRole==="alert"&&String(n.props.children).includes("City:")));
});
test("server errors expand optional fields and attach the message to the actual input",async()=>{
  const h=screen(null,new ApiError("Check the highlighted fields.",400,{fieldErrors:{postal_code:["Enter a valid postal code."]}}));
  await h.load();h.updateAddress({city:"Toronto",province:"Ontario"});await h.submit();
  const fields=h.find(n=>n.type==="AddressFields"&&n.props.hideLocation === true).props.errors as validation.HomeProfileErrors;
  assert.equal(fields.postal_code,"Enter a valid postal code.");
  assert.ok(h.nodes().some(n=>n.props.accessibilityRole==="alert"&&String(n.props.children).includes("Postal code:")));
});
test("restored incomplete optional details are visible, and can be cleared before continuing",async()=>{
  const h=screen({form:{...empty,city:"Toronto",province:"Ontario",postal_code:"A1"},goal:"bills",phase:"form"});
  await h.load();
  h.find(n=>n.type==="AddressFields"&&n.props.hideLocation === true);
  await h.submit();assert.equal(h.saves.length,0);
  const address=h.find(n=>n.type==="AddressFields"&&n.props.hideLocation === true);
  (address.props.onChange as (v:unknown)=>void)({...address.props.value as object,postal_code:""});h.render();
  await h.submit();assert.equal(h.saves.length,1);
});
test("an invalid year expands details and points to the year field without losing entered values",async()=>{
  const h=screen();await h.load();h.updateAddress({city:"Toronto",province:"Ontario",approximate_year_built:"123"});
  await h.submit();assert.equal(h.saves.length,0);
  const year=h.find(n=>n.type==="TextField"&&n.props.label==="Approximate year built (optional)");
  assert.match(String(year.props.error),/1600/);assert.equal(year.props.value,"123");
});

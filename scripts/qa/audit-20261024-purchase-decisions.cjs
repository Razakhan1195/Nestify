/* Actual mobile decision screen and SecureStore retry helper, simulated transport/storage/native boundaries. */
const fs=require("node:fs"),assert=require("node:assert/strict"),esbuild=require("esbuild");
const {chromium}=require("/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules/playwright-core");
const root=process.cwd(),deps="/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules",out=root+"/docs/checkpoints/experience-audit-20261024/remaining/purchase-decisions";
const stubs={
 '@expo/vector-icons':`import React from'react';export const Feather=()=>React.createElement('span',{'aria-hidden':true},'›');`,
 'expo-symbols':`export const SymbolView=()=>null;`,
 'expo-haptics':`export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};`,
 'react-native-keyboard-controller': `export {ScrollView as KeyboardAwareScrollView} from 'react-native';export const KeyboardToolbar=()=>null;`,
 "expo-router":`import React from "react";const route=p=>{window.__params=typeof p==="string"?{}:p.params;window.dispatchEvent(new Event("route"));};export const useRouter=()=>({push:route,replace:route,canGoBack:()=>false});export const useNavigation=()=>({dispatch:()=>{}});export const useLocalSearchParams=()=>window.__params;export const useFocusEffect=cb=>React.useEffect(cb,[cb]);`,
 "expo-router/react-navigation":"export const useIsFocused=()=>true;export const usePreventRemove=()=>{};",
 "react-native-safe-area-context":'export {View as SafeAreaView,View as SafeAreaProvider} from "react-native";',
 "expo-crypto":"export const randomUUID=()=>crypto.randomUUID();",
 "expo-secure-store":"export const getItemAsync=async k=>localStorage.getItem(k);export const setItemAsync=async(k,v)=>localStorage.setItem(k,v);export const deleteItemAsync=async k=>localStorage.removeItem(k);",
 "@/lib/supabase":"export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'fixture-owner'}}}})}};",
 "@/components/ScreenNavigation":'import React from "react";import{Text}from "react-native";export const ScreenNavigation=({title})=><Text accessibilityRole="header">{title}</Text>;',
 "expo-haptics":'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:"Light"};',
 "@/lib/api":`export class ApiError extends Error{constructor(m,s){super(m);this.status=s;}}
 export async function apiGet(path){const id=new URL(path,"http://fixture").searchParams.get("id"),decisions=Object.values(window.__rows);if(id&&!window.__rows[id])throw new ApiError("Unavailable",404);return {homeId:"11111111-1111-4111-8111-111111111111",homeName:"Fixture home",decisions:id?[window.__rows[id]]:decisions,sources:window.__sources,truncated:false};}
 export async function apiPost(path,intent){window.__posts.push(intent);if(window.__dropBefore){window.__dropBefore=false;throw new Error("Connection interrupted");}const old=window.__rows[intent.id];if(old&&old.last_request_id!==intent.requestId&&old.revision!==intent.version)throw new ApiError("Decision changed",409);const row=old?.last_request_id===intent.requestId?old:{id:intent.id,revision:(old?.revision??0)+1,last_request_id:intent.requestId,payload:intent.payload,updated_at:new Date().toISOString()};window.__rows[intent.id]=row;if(window.__dropAfter){window.__dropAfter=false;throw new Error("Connection interrupted");}return {decision:row};}`
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await esbuild.build({stdin:{contents:`import React from "react";import{createRoot}from"react-dom/client";import Screen from "${root}/apps/mobile/app/purchase-decision.tsx";function App(){const[v,set]=React.useState(0);React.useEffect(()=>{const fn=()=>set(x=>x+1);window.addEventListener("route",fn);return()=>window.removeEventListener("route",fn)},[]);return <Screen key={v}/>;}createRoot(document.getElementById("root")).render(<App/>);`,loader:"tsx",resolveDir:root},outfile:out+"/preview.js",bundle:true,format:"iife",platform:"browser",jsx:"automatic",alias:{react:deps+"/react","react-dom":deps+"/react-dom","react-native":deps+"/react-native-web"},define:{global:"globalThis","process.env.NODE_ENV":'"production"'},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>{let key=a.path;if(a.path==="./api")key="@/lib/api";if(a.path==="./supabase")key="@/lib/supabase";if(stubs[key])return{path:key,namespace:"stub"};if(a.path.startsWith("@/"))for(const ext of [".ts",".tsx","/index.ts"]){const p=root+"/apps/mobile/src/"+a.path.slice(2)+ext;if(fs.existsSync(p))return{path:p};}});b.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:stubs[a.path],loader:"tsx",resolveDir:root}));}}]});
 const server=require("node:http").createServer((req,res)=>{if(req.url==="/preview.js"){res.setHeader("Content-Type","application/javascript");res.end(fs.readFileSync(out+"/preview.js"));}else{res.setHeader("Content-Type","text/html");res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/preview.js"></script>');}});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}),checks=[];
 try{
 for(const scenario of ["replace","compare","compatibility","lost-response","not-sent"]){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(9000);page.on("pageerror",e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  await page.addInitScript(s=>{window.__params={kind:s==="lost-response"||s==="not-sent"?"replace":s};window.__rows={};window.__posts=[];window.__sources=["A","B"].map((name,i)=>({documentId:i?"22222222-2222-4222-8222-222222222222":"33333333-3333-4333-8333-333333333333",title:"Quote "+name,sourceVersion:"2026-10-13T00:00:00Z",reviewRevision:1,reviewed:true,sourceCurrent:true,fields:{supplier:"Fixture "+name,scope:"Same water heater installation",partsLabour:"Exact model, labour included",price:"CAD total confirmed below",taxes:"Included",exclusions:"No extras confirmed",schedule:"This month",payment:"On completion",warranty:"One year workmanship"}}));},scenario);
  await page.goto("http://127.0.0.1:"+server.address().port);const button=name=>page.getByRole("button",{name,exact:true});
  await page.getByLabel(scenario==="compare"?"What is the job?":"Decision name",{exact:true}).fill("Fixture "+scenario);
  if(scenario==="compare"){
    await button("Choose Quote A").click();await button("Choose Quote B").click();await button("Check differences").click();
    for(const [name,total] of [["Quote A","1000.10"],["Quote B","1200.10"]]){
     await page.getByLabel("All-in total · "+name+" (CAD)",{exact:true}).fill(total);
     await page.getByRole('checkbox',{name:'Tax and all required fees included · '+name,exact:true}).click();
     await page.getByRole('checkbox',{name:'Same work, quantities and models · '+name,exact:true}).click();
    }
    await button('Keep my decision').click();await page.getByText('The difference is CAD 200.00. This is a price difference, not verified savings or a recommendation.',{exact:true}).waitFor();
    await button('Save comparison').click();await page.getByText('Decision saved privately. No purchase, booking or message has been made.',{exact:true}).waitFor();
    await page.evaluate(()=>{window.__sources[0].reviewRevision=2;window.__params={id:Object.keys(window.__rows)[0]};window.dispatchEvent(new Event('route'));});
    await button('Check differences').click();await page.getByText('This original needs review again. Earlier figures are excluded.',{exact:true}).waitFor();
    await button('Keep my decision').click();await page.getByText('Some details still need checking',{exact:true}).waitFor();
    assert.equal(await page.getByText(/The difference is CAD/).count(),0);
   }else if(scenario==="compatibility"){
   await page.getByLabel("Existing item and exact model",{exact:true}).fill("Fixture model A");
   await page.getByLabel("Candidate part or product and exact model",{exact:true}).fill("Fixture model B");
   await page.getByLabel("Requirement, including units",{exact:true}).fill("Width 600 mm");
   await page.getByLabel("Manufacturer manual URL, title and page, or installer reference",{exact:true}).fill("Fixture manufacturer manual page 3");
   await page.getByLabel("Exact requirement and what your model provides",{exact:true}).fill("Requires 600 mm; verified opening 610 mm");
   await page.getByRole("checkbox",{name:"Matches this reference",exact:true}).click();await page.getByText(/Your recorded checks match/).waitFor();
   await page.getByLabel("Candidate part or product and exact model",{exact:true}).fill("Changed model");
   await page.getByText(/Compatibility is unresolved/).waitFor();await button("Save decision").click();
  }else{
   for(const [label,value] of [["Complete repair cost (CAD)","350.10"],["Replacement product cost (CAD)","600.20"],["Delivery, installation and required parts (CAD)","125.25"]])await page.getByLabel(label,{exact:true}).fill(value);
   await page.getByRole("checkbox",{name:"These amounts include tax and all required fees, with nothing counted twice",exact:true}).click();
   await page.getByText(/Unknown costs are not treated as zero/).waitFor();
   await page.getByLabel("Removal and disposal (CAD)",{exact:true}).fill("0");
   await page.getByRole("checkbox",{name:"These amounts include tax and all required fees, with nothing counted twice",exact:true}).click();
   await page.getByText("Repair has a lower upfront total by CAD 375.35.",{exact:true}).waitFor();
   if(scenario==="lost-response")await page.evaluate(()=>window.__dropAfter=true);
   if(scenario==="not-sent")await page.evaluate(()=>window.__dropBefore=true);
   await button("Save decision").click();
   if(scenario!=="replace"){
    await page.getByText("Check an unfinished save",{exact:true}).waitFor();
    const pending=await page.evaluate(()=>window.__posts[0]);
    await page.evaluate(p=>{window.__params={id:p.id};window.dispatchEvent(new Event("route"));},pending);
    if(scenario==="not-sent"){await button("Retry same save").click();}
    await page.getByText(/Saved decision confirmed|Decision saved privately/).waitFor();
    assert.equal(await page.evaluate(()=>Object.values(window.__rows)[0].revision),1);
    assert.equal(await page.evaluate(()=>Object.keys(window.__rows).length),1);
   }
  }
  await page.screenshot({path:out+"/"+scenario+".png",fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"No sideways overflow");
  assert.deepEqual(errors,[]);checks.push(scenario);await page.close();
 }
 fs.writeFileSync(out+"/results.json",JSON.stringify({checks,boundaries:"Actual screen and retry helper; simulated API, secure storage, router and native keyboard. No device/OAuth/provider acceptance."},null,2));console.log("PASS",checks);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

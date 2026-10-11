const fs=require("node:fs"),esbuild=require("/Users/razakhan/Documents/rezlee-mobile-test/node_modules/esbuild"),{chromium}=require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");
const root="/Users/razakhan/Documents/rezlee-mobile-test",deps="/tmp/rezlee-bill-qa-tools-20261008/node_modules",out=root+"/docs/qa/provider-directory-20261011";
const stubs={
"@/auth/AuthProvider":'export const useAuth=()=>({session:null});',
"@/components/AppNotifications":'export const NotificationBell=()=>null;',
"@/components/ProfileUI":'export const ProfileBadge=()=>null;',

"expo-symbols":'import React from "react";export const SymbolView=()=>React.createElement("span",null,"←");',
"expo-haptics":'export const impactAsync=async()=>{};export const selectionAsync=async()=>{};export const notificationAsync=async()=>{};export const ImpactFeedbackStyle={Light:1};export const NotificationFeedbackType={Error:1};',
"react-native-safe-area-context":'import{View}from"react-native";export const SafeAreaView=View;export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});',

"expo-router":'import React from "react";export const Stack=Object.assign(({children})=>children,{Screen:()=>null});export const useLocalSearchParams=()=>window.__params??{};export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const useNavigation=()=>({});export const useRouter=()=>({push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false});',
"@/components/DeckHostedAuth":'export const DeckHostedAuth=()=>null;',
"@/lib/provider-data":'export const providerCategories=["Electricity","Natural Gas","Water","Internet","Property Tax","Home Insurance","Other service"];export async function fetchProviderConnections(){return structuredClone(window.__payload)};export async function fetchProviderConnection(){return{provider:window.__existing}};export async function connectProviderRequest(){throw Error("No credential requests allowed in screen checks")};',

"@expo/vector-icons":'import React from "react";export function Feather(){return React.createElement("span",{"aria-hidden":true},"›");}',
"@/lib/api":'export class ApiError extends Error{};export async function apiGet(p){window.__requests.push(p);if(window.__failOriginal)throw new ApiError("Could not open the original. Try again.");return {url:"https://example.invalid/fixture-original"};}export async function apiPost(){};export async function apiPatch(){};export async function apiDelete(){};export async function apiFormPost(){};',
};

stubs["expo-router"]='import React from "react";const router={push:p=>window.__actions.push(p),replace:p=>window.__actions.push(p),canGoBack:()=>false};export const Redirect=({href})=>{React.useEffect(()=>router.replace(href),[]);return null;};export const Stack=Object.assign(({children})=>children,{Screen:()=>null});export const useLocalSearchParams=()=>window.__params??{};export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const useNavigation=()=>({});export const useRouter=()=>router;';
stubs["react-native-webview"]='export const WebView=()=>null;';
stubs["@/lib/ezgb-data"]='export async function fetchEzgbAuthorization(){throw Error("No real authorization during rendering")};export async function fetchEzgbSyncStatus(){};export async function syncEzgb(){};';
stubs["@/components/DeckHostedAuth"]='import React from "react";export function DeckHostedAuth(props){window.__hosted=props;return React.createElement("div",null,"Hosted sign-in opened");}';

(async()=>{
fs.mkdirSync(out,{recursive:true});
const entry='import React from "react";import{createRoot}from"react-dom/client";import Connect from "'+root+'/apps/mobile/app/provider/connect";import Deck from "'+root+'/apps/mobile/app/provider/deck";import Green from "'+root+'/apps/mobile/app/provider/ezgb";window.__actions=[];const Screen=window.__screen==="deck"?Deck:window.__screen==="green"?Green:Connect;createRoot(document.getElementById("root")).render(<Screen/>);';
const rn='export * from "'+deps+'/react-native-web";export const Linking={openURL:async()=>{window.__actions.push("link-opened")}};';
await esbuild.build({stdin:{contents:entry,loader:"tsx",resolveDir:root},outfile:out+"/preview.js",bundle:true,platform:"browser",format:"iife",jsx:"automatic",loader:{".png":"dataurl"},alias:{react:deps+"/react","react-dom":deps+"/react-dom"},define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>{if(a.path==="react-native")return{path:"rn",namespace:"stub"};if(a.path==="./api")return{path:"@/lib/api",namespace:"stub"};if(stubs[a.path])return{path:a.path,namespace:"stub"};if(a.path.startsWith("@/")){const p=root+"/apps/mobile/src/"+a.path.slice(2);for(const ext of [".ts",".tsx","/index.ts"])if(fs.existsSync(p+ext))return{path:p+ext};}});b.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:a.path==="rn"?rn:stubs[a.path],loader:"js",resolveDir:root}));}}]});
fs.writeFileSync(out+"/preview.html",'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}</style><div id="root"></div><script src="./preview.js"></script>');
const server=require("node:http").createServer((req,res)=>{const f=req.url==="/preview.js"?"preview.js":"preview.html";res.setHeader("Content-Type",f.endsWith(".js")?"application/javascript":"text/html");res.end(fs.readFileSync(out+"/"+f));});await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}),checks=[];
const payload=JSON.parse(fs.readFileSync(root+"/docs/checkpoints/provider-directory-20261011/render-fixture.json","utf8"));
async function pageFor(width,screen="connect",params={}) {
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(({payload,screen,params})=>{window.__payload=payload;window.__screen=screen;window.__params=params;},{payload,screen,params});
 await page.goto("http://127.0.0.1:"+server.address().port);
 return {page,errors};
}
async function checkPage(page,errors,name){
 if(errors.length)throw Error(name+": "+errors.join(";"));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);if(overflow)throw Error(name+": horizontal overflow");
 await page.screenshot({path:out+"/"+name+".png",fullPage:true});checks.push({name,ok:true});
}
try{
 for(const width of [320,390,820]){
  const {page,errors}=await pageFor(width);await page.getByText("Find your provider",{exact:true}).waitFor();await page.getByLabel("Search providers across Canada").fill("Alectra");
  await page.getByRole("button",{name:/Alectra Utilities\. Electricity/}).waitFor();
  if(await page.getByRole("button",{name:/Water via Alectra Utilities\. Water\. Coming soon/}).count()!==1)throw Error("Missing water separation");
  await checkPage(page,errors,"finder-alectra-"+width);
  await page.getByRole("button",{name:/Alectra Utilities\. Electricity/}).click();
  const route=await page.evaluate(()=>window.__actions.at(-1));if(route.pathname!=="/provider/ezgb"||route.params.utilityName!=="Alectra Utilities")throw Error("Wrong Green Button route");
  await page.getByLabel("Search providers across Canada").fill("Rogers");
  await page.getByRole("button",{name:"Rogers. Phone & internet. Coming soon",exact:true}).click();
  await page.getByText("We’re still testing Rogers sign-in.",{exact:false}).waitFor();await checkPage(page,errors,"rogers-coming-soon-"+width);
  await page.getByRole("button",{name:"Upload a statement",exact:true}).click();
  if(await page.evaluate(()=>window.__actions.at(-1))!=="/bill/batch")throw Error("Missing upload fallback");
  await page.getByRole("button",{name:"Back to results",exact:true}).click();
  await page.getByLabel("Search providers across Canada").fill("Bell");await page.getByRole("button",{name:"Bell. Phone & internet. Connect · Deck",exact:true}).click();
  if((await page.evaluate(()=>window.__actions.at(-1))).pathname!=="/provider/deck")throw Error("Wrong Deck route");
  await page.getByLabel("Search providers across Canada").fill("NoSuchProviderXYZ");await page.getByText("No match yet.",{exact:false}).waitFor();await checkPage(page,errors,"no-match-"+width);await page.close();
 }
 for(const provider of payload.catalog.filter(p=>p.connectionAvailable)){
  const {page,errors}=await pageFor(390,"deck",{registryProviderId:provider.id});
  await page.getByRole("button",{name:"Continue securely with Deck",exact:true}).waitFor();
  if(await page.getByRole("button",{name:"Continue securely with Deck",exact:true}).isDisabled())throw Error(provider.name+": disabled");
  if(!await page.getByText("Provider website: "+provider.website_url,{exact:true}).count())throw Error(provider.name+": wrong portal");
  await page.getByRole("button",{name:"Continue securely with Deck",exact:true}).click();await page.getByText("Hosted sign-in opened",{exact:true}).waitFor();
  const hosted=await page.evaluate(()=>({id:window.__hosted.registryProviderId,months:window.__hosted.historyMonths}));
  if(hosted.id!==provider.id||hosted.months!==6)throw Error(provider.name+": hosted selection lost");
  if(["Bell","Intact","City of Toronto Water"].includes(provider.name))await checkPage(page,errors,"deck-"+provider.name.replaceAll(" ","-"));else {if(errors.length)throw Error(errors.join(";"));checks.push({name:"hosted-"+provider.name,ok:true});}
  await page.close();
 }
 const {page:green,errors:greenErrors}=await pageFor(390,"green",{utilityName:"Alectra Utilities"});
 await green.getByText("Connect Alectra Utilities",{exact:true}).waitFor();await green.getByText("Green Button is the recommended connection.",{exact:false}).waitFor();await checkPage(green,greenErrors,"green-button-handoff");await green.close();
 const {page:paused,errors:pausedErrors}=await pageFor(390,"deck",{registryProviderId:"11d2d635-9635-4971-bc49-809919b0b90d"});
 await paused.getByText("Connection coming soon",{exact:true}).waitFor();if(await paused.getByRole("button",{name:"Continue securely with Deck",exact:true}).count())throw Error("Paused deep link offered sign-in");await checkPage(paused,pausedErrors,"paused-deep-link");await paused.close();
 fs.writeFileSync(root+"/docs/checkpoints/provider-directory-20261011/render-results.json",JSON.stringify({checks,nativeDeviceTested:false},null,2));console.log(JSON.stringify({passed:checks.length,screenshots:out}));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

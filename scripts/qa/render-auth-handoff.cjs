/* Render the actual root providers and login/entry screens; native/auth/network boundaries are simulated. */
const fs = require("node:fs"), assert = require("node:assert/strict"), esbuild = require("esbuild");
const { chromium } = require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");
const root = process.cwd(), deps = "/tmp/rezlee-bill-qa-tools-20261008/node_modules";
const out = process.env.REZLEE_QA_OUTPUT || root + "/docs/qa/google-auth-handoff-20261013";
const stubs = {
  "@/auth/AuthProvider": `import React from "react";
    const C=React.createContext(null);
    export function AuthProvider({children}) {
      const [s,set]=React.useState({session:null,isLoading:false,recentSignIn:null});
      React.useEffect(()=>{window.__auth=(id,proof=false)=>set({session:id?{user:{id}}:null,isLoading:false,recentSignIn:proof?{userId:id,at:Date.now()}:null});},[]);
      return <C.Provider value={{...s,signIn:async()=>{window.__auth("owner-a",true);return {};},resendConfirmation:async()=>({})}}>{children}</C.Provider>;
    }
    export const useAuth=()=>React.useContext(C);`,
  "expo-router": `import React from "react";import{useNotifications}from "${root}/apps/mobile/src/components/AppNotifications.tsx";import Login from "${root}/apps/mobile/app/(auth)/login.tsx";import Index from "${root}/apps/mobile/app/index.tsx";
    const router={replace:href=>{window.__routes.push(href);window.__path=typeof href==="string"?href:href.pathname;window.dispatchEvent(new Event("route"));},push:href=>router.replace(href),canGoBack:()=>false};
    export const useRouter=()=>router;export const useLocalSearchParams=()=>({});export const useRootNavigationState=()=>({key:"root"});
    export function usePathname(){const[p,set]=React.useState(window.__path);React.useEffect(()=>{const update=()=>set(window.__path);window.addEventListener("route",update);return()=>window.removeEventListener("route",update)},[]);return p;}
    export function Redirect({href}){React.useEffect(()=>router.replace(href),[href]);return null;}
    function Home(){const {unread}=useNotifications();return <div><h1>Your household</h1><output data-testid="unread">{unread}</output><input aria-label="Unsaved note" defaultValue=""/><button onClick={()=>{window.__auth(null);router.replace("/(auth)/login");}}>Fixture sign out</button></div>}
    export function Stack({screenLayout}){const p=usePathname();React.useEffect(()=>{window.__mounts++;return()=>window.__unmounts++;},[]);const node=p==="/"?<Index/>:p.includes("/home")?<Home/>:<Login/>;return <div data-testid="navigator" style={{height:"100%"}}>{screenLayout?screenLayout({children:node}):node}</div>}
    Stack.Screen=()=>null;`,
  "expo-router/react-navigation": "export const usePreventRemove=()=>{};",
  "expo-status-bar": "export const StatusBar=()=>null;",
  "react-native-safe-area-context": 'export {View as SafeAreaView,View as SafeAreaProvider} from "react-native";',
  "expo-secure-store": `export async function getItemAsync(key){if(!key.startsWith("rezlee.lock."))return null;window.__reads++;if(window.__holdRead)return new Promise(resolve=>window.__readReleases.push(()=>resolve(window.__lockEnabled?"1":null)));if(window.__readFail)throw Error("private storage");return window.__lockEnabled?"1":null;}export async function setItemAsync(){}`,
  "@/auth/biometrics": `export const biometricCapability=async()=>({available:true,label:"Face ID",detail:""});export async function authenticateBiometric(){window.__biometrics++;return window.__biometricResult;}`,
  "@/lib/supabase": "export const supabase={auth:{signOut:async()=>{window.__auth(null);return {error:null}}}};",
  "@/auth/social-auth": `export const socialProviders=async()=>({google:true,apple:true});export async function startSocialSignIn(){window.__starts++;await new Promise(r=>window.__finishBrowser=r);if(window.__socialError)throw Error("We couldn’t sign you in. Please try again.");if(!window.__cancel)window.__auth(window.__nextUser,true);return {cancelled:window.__cancel};}`,
  "@/auth/pending-signup": "export const clearPendingSignup=async()=>{};",
  "@/auth/email-code": "export const emailCodeReady=true;",
  "@/lib/public-links": "export const openPublicLink=async()=>{};",
  "expo-haptics": 'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:"Light"};',
  "@expo/vector-icons": 'import React from "react";export const Feather=()=> <span/>;',
  "@/lib/notification-data": `export async function fetchNotifications(_,id){window.__notificationUsers.push(id);if(window.__holdNotifications&&id==="owner-a")return new Promise(resolve=>window.__notificationRelease=()=>resolve({unread:99}));return {unread:id==="owner-b"?2:5};}export const openNotification=async()=>({href:"/notifications"});export const readNotification=async()=>{};`,
  "@/lib/push-notifications": "export const registerPushNotifications=async()=>{};export const getInitialNotificationTarget=async()=>null;export const addNotificationTargetListener=()=>({remove(){}});export const clearNotificationResponse=async()=>{};",
  "./WelcomeEmailSync": "export const WelcomeEmailSync=()=>null;",
  "@/lib/account-deletion": "export const readDeletionReceipt=async()=>null;",
  "@/lib/phone-invites": "export const readIncomingPhoneInvite=async()=>null;",
  "@/lib/onboarding-data": "export const fetchOnboarding=async()=>({home:{id:'home'},accessRole:'owner'});",
  "@/lib/onboarding-draft": "export const setupDrafts={read:async()=>null};",
  "@/lib/api": "export class ApiError extends Error{};"
};
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  await esbuild.build({stdin:{contents:`import React from "react";import{createRoot}from"react-dom/client";import Root from "${root}/apps/mobile/app/_layout.tsx";createRoot(document.getElementById("root")).render(<Root/>);`,loader:"tsx",resolveDir:root},outfile:out+"/preview.js",bundle:true,format:"iife",platform:"browser",jsx:"automatic",loader:{".png":"dataurl"},alias:{react:deps+"/react","react-dom":deps+"/react-dom","react-native":deps+"/react-native-web"},define:{global:"globalThis","process.env.NODE_ENV":'"production"'},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>{if(["./AuthProvider","./biometrics"].includes(a.path))return{path:"@/auth/"+a.path.slice(2),namespace:"stub"};if(stubs[a.path])return{path:a.path,namespace:"stub"};if(a.path.startsWith("@/"))for(const ext of [".ts",".tsx","/index.ts"]){const p=root+"/apps/mobile/src/"+a.path.slice(2)+ext;if(fs.existsSync(p))return{path:p};}});b.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:stubs[a.path],loader:"tsx",resolveDir:root}));}}]});
  const server=require("node:http").createServer((req,res)=>{if(req.url==="/preview.js"){res.setHeader("Content-Type","application/javascript");res.end(fs.readFileSync(out+"/preview.js"));}else{res.setHeader("Content-Type","text/html");res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/preview.js"></script>');}});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  const checks=[];
  try{
    for(const scenario of ["google","slow-preference","apple","cancel-retry","provider-error-retry","password","locked-return","account-switch"]){
      const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
      page.setDefaultTimeout(8000);page.on("pageerror",e=>errors.push(e.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
      await page.addInitScript(s=>{
        window.__path="/(auth)/login";window.__mounts=0;window.__unmounts=0;window.__routes=[];window.__reads=0;window.__readReleases=[];
        window.__lockEnabled=s==="locked-return";window.__holdRead=s==="slow-preference";window.__biometrics=0;window.__biometricResult=false;
        window.__starts=0;window.__nextUser="owner-a";window.__cancel=s==="cancel-retry";window.__socialError=s==="provider-error-retry";
        window.__notificationUsers=[];window.__holdNotifications=s==="account-switch";
      },scenario);
      await page.goto("http://127.0.0.1:"+server.address().port);
      const button=name=>page.getByRole("button",{name,exact:true});
      await button("Continue with Google").waitFor();
      if(scenario==="password"){
        await page.getByLabel("Email",{exact:true}).fill("fixture@example.invalid");await page.getByLabel("Password",{exact:true}).fill("fixture");
        await button("Sign in").click();
      }else{
        await button(scenario==="apple"?"Continue with Apple":"Continue with Google").click();
        await page.waitForFunction(()=>Boolean(window.__finishBrowser));await page.evaluate(()=>window.__finishBrowser());
        if(["cancel-retry","provider-error-retry"].includes(scenario)){
          await page.waitForFunction(()=>!document.querySelector('input[aria-label="Email"]').disabled);
          assert.deepEqual(await page.evaluate(()=>({mounts:window.__mounts,unmounts:window.__unmounts})),{mounts:1,unmounts:0});
          await page.evaluate(()=>{window.__cancel=false;window.__socialError=false;window.__finishBrowser=null;});
          await button("Continue with Google").click();await page.waitForFunction(()=>Boolean(window.__finishBrowser));await page.evaluate(()=>window.__finishBrowser());
        }
        if(scenario==="slow-preference"){
          await page.waitForFunction(()=>window.__readReleases.length>0);
          assert.equal(await page.getByTestId("navigator").count(),1,"Root navigator disappeared while account security loaded");
          assert.equal(await page.getByRole("heading",{name:"Your household"}).count(),0,"Account content rendered before security resolved");
          await page.screenshot({path:out+"/security-loading.png"});
          await page.evaluate(()=>{window.__holdRead=false;window.__readReleases.forEach(r=>r());});
        }
      }
      try { await page.getByRole("heading",{name:"Your household"}).waitFor(); } catch(error) { const evidence=await page.evaluate(()=>({mounts:window.__mounts,unmounts:window.__unmounts,routes:window.__routes,path:window.__path,reads:window.__reads,body:document.body.innerText}));fs.writeFileSync(out+"/failure.json",JSON.stringify({scenario,evidence,errors},null,2));await page.screenshot({path:out+"/failure.png"});throw error; }
      assert.deepEqual(await page.evaluate(()=>({mounts:window.__mounts,unmounts:window.__unmounts})),{mounts:1,unmounts:0},"Sign-in must not tear down the root navigator");
      if(scenario==="locked-return"){
        await page.getByLabel("Unsaved note").fill("Keep my household draft");
        await page.evaluate(()=>window.__auth("owner-a",false));
        await page.getByRole("heading",{name:"Your place is private"}).waitFor();
        assert.equal(await page.getByLabel("Unsaved note").evaluate(el=>{for(let p=el;p;p=p.parentElement)if(getComputedStyle(p).opacity==="0"&&p.getAttribute("aria-hidden")==="true")return true;return false;}),true,"Locked screen must be invisible and excluded from accessibility");
        await page.evaluate(()=>{window.__biometricResult=true;});await button("Unlock with Face ID").click();
        await page.getByRole("heading",{name:"Your household"}).waitFor();
        assert.equal(await page.getByLabel("Unsaved note").inputValue(),"Keep my household draft");
      }
      if(scenario==="account-switch"){
        await page.waitForFunction(()=>Boolean(window.__notificationRelease));
        await button("Fixture sign out").click();await button("Continue with Google").waitFor();
        await page.evaluate(()=>{window.__nextUser="owner-b";window.__finishBrowser=null;});await button("Continue with Google").click();
        await page.waitForFunction(()=>Boolean(window.__finishBrowser));await page.evaluate(()=>window.__finishBrowser());
        await page.getByRole("heading",{name:"Your household"}).waitFor();
        await page.evaluate(()=>window.__notificationRelease());
        await page.waitForFunction(()=>document.querySelector('[data-testid="unread"]')?.textContent==="2");
        assert.deepEqual(await page.evaluate(()=>({mounts:window.__mounts,unmounts:window.__unmounts})),{mounts:1,unmounts:0},"Account switch must retain the navigator");
      }
      assert.deepEqual(errors,[]);
      await page.screenshot({path:out+"/"+scenario+".png"});
      checks.push({scenario,pass:true});await page.close();
    }
    fs.writeFileSync(out+"/results.json",JSON.stringify({passed:checks.length,checks,boundary:"Actual root layout, AppLockProvider/controller, AppNotifications, Login/SocialSignIn and entry routing. React Native Web; simulated OAuth, device storage/biometrics, navigator and network. Proves mount continuity and privacy/route behavior; not native UIKit or physical OAuth acceptance."},null,2)+"\n");
    console.log(JSON.stringify({passed:checks.length,out}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

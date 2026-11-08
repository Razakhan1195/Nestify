const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const source=fs.readFileSync(path.join(__dirname,"../src/lib/store-purchases.ts"),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function fixture({platform="ios",nativeFails=false,urlFails=false,user="qa",changeDuringNative=false}={}){
 const calls=[];let current=user;
 const purchases={configure:()=>calls.push("configure"),showManageSubscriptions:async()=>{calls.push("native");if(changeDuringNative)current="other";if(nativeFails)throw Error("native unavailable");}};
 const module={exports:{}};
 const requireMock=name=>{
  if(name==="react-native")return {Platform:{OS:platform},Linking:{openURL:async url=>{calls.push(url);if(urlFails)throw Error("store unavailable");}}};
  if(name==="expo-constants")return {__esModule:true,default:{appOwnership:"standalone"}};
  if(name==="./supabase")return {supabase:{auth:{getSession:async()=>({data:{session:{user:{id:current}}}})}}};
  if(name==="./store-product-policy")return {eligibleStorePlan:()=>true};
  if(name==="react-native-purchases")return {__esModule:true,default:purchases};
  throw Error("Unexpected import "+name);
 };
 vm.runInNewContext(code,{require:requireMock,module,exports:module.exports,process:{env:{EXPO_PUBLIC_REVENUECAT_IOS_KEY:"test-public-key",EXPO_PUBLIC_REVENUECAT_ANDROID_KEY:"test-public-key"}}});
 return {calls,manage:module.exports.managePlans};
}
(async()=>{
 let f=fixture();await f.manage("qa");assert.deepEqual(f.calls,["configure","native"]);
 f=fixture({nativeFails:true});await f.manage("qa");assert.deepEqual(f.calls,["configure","native","https://apps.apple.com/account/subscriptions"]);
 f=fixture({platform:"android"});await f.manage("qa");assert.deepEqual(f.calls,["https://play.google.com/store/account/subscriptions"]);
 f=fixture({nativeFails:true,urlFails:true});await assert.rejects(f.manage("qa"),/store unavailable/);
 f=fixture({user:"other"});await assert.rejects(f.manage("qa"),/account changed/);assert.deepEqual(f.calls,[]);
 f=fixture({nativeFails:true,changeDuringNative:true});await assert.rejects(f.manage("qa"),/account changed/);assert.deepEqual(f.calls,["configure","native"]);
 console.log("PASS: native management, store fallback, Android routing, errors, and account isolation (6 cases)");
})().catch(e=>{console.error(e);process.exitCode=1;});

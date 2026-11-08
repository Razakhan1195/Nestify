import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return {promise, resolve}; }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
 const calls: string[] = [], handlers = new Set<(state: string) => void>(), cleanup: (() => void)[] = [];
 const buttons = new Map<string, () => void>(), sheet = deferred(), purchase = deferred();
 const payload = {enabled:true,purchasesAvailable:true,membership:{plan:"pro",source:"store",proWelcomeSeen:true}};
 const jsx = (type: unknown, props: {label?:string;onPress?:()=>void}) => { if(props?.label&&props.onPress)buttons.set(props.label,props.onPress);return {type,props}; };
 const modules: Record<string, unknown> = {
  "react/jsx-runtime": {jsx,jsxs:jsx},
  "react": {useCallback:(fn:unknown)=>fn,useMemo:(fn:()=>unknown)=>fn(),useRef:(current:unknown)=>({current}),useState:(value:unknown)=>[typeof value==="function"?value():value,()=>{}],useEffect:(fn:()=>unknown)=>{const end=fn();if(typeof end==="function")cleanup.push(end as ()=>void);}},
  "expo-router": {useRouter:()=>({}),useFocusEffect:(fn:()=>()=>void)=>cleanup.push(fn())},
  "react-native": {AppState:{currentState:"active",addEventListener:(_:string,fn:(state:string)=>void)=>{handlers.add(fn);return {remove:()=>handlers.delete(fn)};}},Platform:{OS:"android"},StyleSheet:{create:(styles:unknown)=>styles}},
  "@/theme/useTheme": {useTheme:()=>({colors:{},premium:{}})},
  "@/theme/tokens": {editorialType:{},typography:{}},
  "@/lib/read-timeout": {withReadTimeout:(value:unknown)=>value},
  "@/lib/membership": {getMembershipSnapshot:()=>payload,loadMembership:async()=>{calls.push("load");return payload;},restoreMembership:async()=>{calls.push("restore");return payload;}},
  "@/lib/membership-presentation": {membershipPresentation:()=>({lifetime:false})},
  "@/lib/store-purchases": {managePlans:()=>sheet.promise,restorePlans:()=>purchase.promise},
 };
 const source=ts.transpileModule(fs.readFileSync("apps/mobile/app/membership.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports: {mount?:(props:{userId:string})=>unknown}={};
 vm.runInNewContext(source+"\nexports.mount=MembershipContent;",{exports,require:(name:string)=>modules[name]??{},Date,Map,Set,Promise});
 exports.mount!({userId:"reviewer"});
 return {calls,buttons,sheet,purchase,emit:(state:string)=>handlers.forEach(fn=>fn(state)),close:()=>cleanup.reverse().forEach(fn=>fn()),handlers};
}

test("returning from an external store refreshes the still-focused membership screen once", async()=>{
 const h=fixture();await flush();assert.deepEqual(h.calls,["load"]);
 h.emit("background");h.emit("active");h.emit("active");await flush();
 assert.deepEqual(h.calls,["load","load"]);
 h.close();assert.equal(h.handlers.size,0);h.emit("active");assert.equal(h.calls.length,2);
});
test("native subscription management completes its own refresh without a competing foreground read",async()=>{
 const h=fixture();await flush();h.buttons.get("Manage subscription")!();
 h.emit("inactive");h.emit("active");assert.deepEqual(h.calls,["load"]);
 h.sheet.resolve();await flush();assert.deepEqual(h.calls,["load","load"]);h.close();
});
test("return from a purchase sheet cannot interrupt receipt restoration",async()=>{
 const h=fixture();await flush();h.buttons.get("Restore purchases")!();
 h.emit("background");h.emit("active");assert.deepEqual(h.calls,["load"]);
 h.purchase.resolve();await flush();assert.deepEqual(h.calls,["load","restore"]);h.close();
});

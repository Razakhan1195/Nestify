import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {safeBack} from "../apps/mobile/src/lib/navigation";

function source(relative:string){return ts.createSourceFile(relative,fs.readFileSync(path.resolve(relative),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function handler(relative:string,label:string){
 const file=source(relative);let found:ts.Expression|undefined;
 function visit(node:ts.Node){
  if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node)){
   const attrs=node.attributes.properties;
   const named=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==="label");
   const target=named&&ts.isJsxAttribute(named)&&named.initializer&&ts.isStringLiteral(named.initializer)&&named.initializer.text===label;
   const childText=ts.isJsxOpeningElement(node)&&node.parent.getText(file).includes('"Back to Security"');
   if(target||(label==="Back to Security"&&node.tagName.getText(file)==="Pressable"&&childText)){
    const press=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==="onPress");
    if(press&&ts.isJsxAttribute(press)&&press.initializer&&ts.isJsxExpression(press.initializer))found=press.initializer.expression;
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(file);assert.ok(found,"Expected customer exit control: "+label);
 const body=ts.transpileModule("const action = "+found.getText(file)+";",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return (router:unknown,session:unknown,id:string)=>new Function("router","safeBack","session","id",body+"return action();")(router,safeBack,session,id);
}
for(const [file,label,fallback] of [
 ["apps/mobile/app/feedback.tsx","Back to Profile","/account"],
 ["apps/mobile/app/(auth)/forgot-password.tsx","Back to Security","/app-security"],
 ["apps/mobile/app/bill/statement-details.tsx","Back to account","/bill/bill-123"],
]){
 for(const history of [false,true])test(label+" exits "+(history?"with history":"a direct entry"),()=>{
  const calls:string[]=[];
  handler(file,label)({canGoBack:()=>history,back:()=>calls.push("back"),replace:(to:string)=>calls.push(to)},{user:{id:"qa"}},"bill-123");
  assert.deepEqual(calls,[history?"back":fallback]);
 });
}
test("Password help returns signed-out customers to sign in",()=>{
 const calls:string[]=[];handler("apps/mobile/app/(auth)/forgot-password.tsx","Back to Security")({canGoBack:()=>false,back:()=>calls.push("back"),replace:(to:string)=>calls.push(to)},null,"");
 assert.deepEqual(calls,["/(auth)/login"]);
});
test("Statement completion has a usable exit when its identifier is missing",()=>{
 const calls:string[]=[];handler("apps/mobile/app/bill/statement-details.tsx","Back to account")({canGoBack:()=>false,back:()=>calls.push("back"),replace:(to:string)=>calls.push(to)},{user:{id:"qa"}},"");
 assert.deepEqual(calls,["/(tabs)/bills"]);
});
test("Needs you keeps a fallback header outside loading and failure branches",()=>{
 const file=source("apps/mobile/app/needs-you.tsx");
 const screen=file.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text==="NeedsYouScreen");
 assert.ok(screen?.body);
 const rendered=screen.body.statements.find(ts.isReturnStatement)?.expression;
 assert.ok(rendered&&ts.isJsxFragment(rendered));
 const header=rendered.children.find((n):n is ts.JsxSelfClosingElement=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==="ScreenNavigation");
 assert.ok(header);
 const fallback=header.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==="fallback");
 assert.ok(fallback&&ts.isJsxAttribute(fallback)&&fallback.initializer&&ts.isJsxExpression(fallback.initializer)&&fallback.initializer.expression);
 const choose=new Function("careOnly","return "+fallback.initializer.expression.getText(file));
 assert.equal(choose(false),"/(tabs)/home");
 assert.equal(choose(true),"/(tabs)/care");
 assert.ok(rendered.children.some(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==="NeedsYouContent"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
test("login and signup render approved Apple and Google actions on the first render, before any network effect", async () => {
 const work=await mkdtemp(join(tmpdir(),"rezlee-entry-ui-"));
 try {
  const stubs:Record<string,string>={
   "@/theme/useTheme":'export const useTheme=()=>({colors:{primary:"green",foreground:"black",border:"gray",mutedForeground:"gray"}});',
   "react-native":'import React from "react";const node=tag=>({children})=>React.createElement(tag,null,children);export const View=node("div"),Text=node("span"),Pressable=node("button"),ActivityIndicator=node("progress"),Platform={OS:"ios"},Keyboard={dismiss(){}};',
   "@expo/vector-icons":'export const FontAwesome="i";',
   "./Button":'import React from "react";export const Button=({label})=>React.createElement("button",null,label);',
   "@/auth/social-auth":'export const releasedSocialProviders=()=>({google:true,apple:true});export const socialProviders=()=>new Promise(()=>{});export const startSocialSignIn=async()=>{};',
   "@/theme/tokens":'export const colors={primary:"green",foreground:"black",border:"gray",mutedForeground:"gray"},spacing={md:16,xs:4},typography={meta:{}};'
  };
  const output=join(work,"entry.cjs");
  await build({stdin:{contents:`import React from "react";import {renderToStaticMarkup} from "react-dom/server";import {SocialSignIn} from ${JSON.stringify(resolve("apps/mobile/src/components/SocialSignIn.tsx"))};export const render=appearance=>renderToStaticMarkup(React.createElement(SocialSignIn,{appearance,disabled:false,onBusy(){},onError(){}}));`,resolveDir:process.cwd(),loader:"tsx"},outfile:output,bundle:true,platform:"node",format:"cjs",jsx:"automatic",plugins:[{name:"native",setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:createRequire(import.meta.url).resolve(a.path)}));b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"stub"}:undefined);b.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:stubs[a.path],loader:"js",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output);
  for(const appearance of ["default","signup"]) {const html=h.render(appearance);assert.match(html,/Continue with Apple/);assert.match(html,/Continue with Google/);assert.doesNotMatch(html,/Checking sign-in options/);}
 } finally { await rm(work,{recursive:true,force:true}); }
});

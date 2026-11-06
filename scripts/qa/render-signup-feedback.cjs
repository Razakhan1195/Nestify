/* Server-render the actual signup composition for layout review, not native acceptance. */
const fs=require('node:fs'),{build}=require('esbuild');
const root=process.cwd(),deps='/Users/razakhan/Library/Caches/Rezlee/design-qa-20261016/node_modules';
const out='/Users/razakhan/Library/Application Support/Rezlee/store-configuration-20261017/feedback-component-qa';
const stubs={
 'react-native':`export * from'react-native-web';export const useWindowDimensions=()=>({width:globalThis.__qaWidth||390,height:844,fontScale:1});`,
 'react-native-safe-area-context':`export{View as SafeAreaView}from'react-native-web';`,
 '@expo/vector-icons':`import React from'react';import{ArrowLeft,ArrowUpRight,FileText,CheckCircle,ShoppingBag,Shield,Paperclip,Calendar,Loader}from'lucide-react';const icons={'arrow-left':ArrowLeft,'arrow-up-right':ArrowUpRight,'file-text':FileText,'check-circle':CheckCircle,'shopping-bag':ShoppingBag,shield:Shield,paperclip:Paperclip,calendar:Calendar};export const Feather=({name,size=20,color})=>React.createElement(icons[name]||Loader,{size,color,strokeWidth:1.6});`,
};
(async()=>{
fs.mkdirSync(out,{recursive:true});
await build({stdin:{contents:`import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{AppRegistry}from'react-native-web';import{SignupIntroduction}from'./apps/mobile/src/components/SignupIntroduction';
export function render(width){globalThis.__qaWidth=width;AppRegistry.registerComponent('Signup',()=>()=>React.createElement(SignupIntroduction,{onContinue:()=>{},onSignIn:()=>{},onBack:()=>{}}));const app=AppRegistry.getApplication('Signup');const markup=renderToStaticMarkup(app.element);const css=renderToStaticMarkup(app.getStyleElement());return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rezlee signup introduction</title>'+css+'<style>html,body,#root{margin:0;height:100%;background:#F7F6F2}#root{display:flex;flex-direction:column;max-width:'+width+'px;margin:auto;}</style></head><body><div id="root">'+markup+'</div></body></html>';}`,loader:'tsx',resolveDir:root},outfile:out+'/signup-ssr.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root+'/apps/mobile/src','react-native-web':deps+'/react-native-web','react':root+'/node_modules/react','react-dom':root+'/node_modules/react-dom'},define:{__DEV__:'false'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
const h=require(out+'/signup-ssr.cjs');for(const width of [320,390])fs.writeFileSync(out+'/signup-'+width+'.html',h.render(width));console.log('Generated actual signup layout HTML at 320 and 390 pixels.');
})().catch(e=>{console.error(e);process.exitCode=1});

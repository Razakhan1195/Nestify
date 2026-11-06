// Local-only component preview. Synthetic data, no sign-in, AI or provider calls.
// Uses the production component via react-native-web; focus/network are fixtures.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(process.cwd() + "/package.json");
const { build } = require("esbuild");
const root = process.cwd(), temp = "/tmp/rezlee-plan-render", out = "/tmp/rezlee-plan-render/output";
mkdirSync(out, { recursive: true });
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ElectricityPlanComparison} from '${root}/apps/mobile/src/components/utility/ElectricityPlanComparison';
import {evidenceDefaults} from '${root}/apps/mobile/src/lib/statement-evidence';
import {colors} from '${root}/apps/mobile/src/theme/tokens';
const size=new URLSearchParams(location.search).get('size')||'390';
const original={id:'preview-a',label:'Electricity',providerName:'Example Hydro',providerId:null,category:'Electricity',categoryId:'electricity',accountNumber:'Home A',currency:'CAD',source:'manual',isHistoricalStatement:true,amount:123,billingPeriodStart:'2026-08-01',billingPeriodEnd:'2026-08-30',reviewedEvidence:{...evidenceDefaults,usage:'600',unit:'kWh',reading:'actual',ratePlan:'TOU'},reviewedEnergyEvidence:{version:1,service:'electricity',scope:'single_service',lines:[['off_peak','300'],['mid_peak','200'],['on_peak','100']].map(([band,quantity])=>({label:band,kind:'energy',amount:'',quantity,unit:'kWh',rate:'',rateUnit:'',band,quote:''}))}};
function App(){const [mode,setMode]=useState('manual');const bill=mode==='missing'?{...original,reviewedEvidence:null}:original;return <div style={{width:Number(size),margin:'24px auto',background:colors.canvas,padding:20,boxSizing:'border-box',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}}><p style={{fontSize:12,color:colors.mutedForeground}}>SYNTHETIC COMPONENT PREVIEW · {size} pt</p><label>Test state <select value={mode} onChange={e=>setMode(e.target.value)}><option value="manual">Printed TOU bill</option><option value="missing">Missing usage</option><option value="stale">Rates need review</option><option value="connected">Connected: all plans</option><option value="failure">Connection failure</option></select></label><h2 style={{fontSize:22,fontWeight:600,color:colors.foreground}}>Electricity insights</h2><div style={{padding:'16px 0 24px',color:colors.foreground}}><div>Example Hydro · Home A</div><div style={{fontSize:32,fontWeight:600,marginTop:8}}>$123.00</div><div style={{fontSize:13,marginTop:6}}>Saved period charges · Aug 1–30, 2026</div></div><ElectricityPlanComparison key={mode} bill={['connected','failure'].includes(mode)?undefined:bill} providerId={['connected','failure'].includes(mode)?mode:undefined} today={mode==='stale'?'2026-10-27':'2026-09-27'}/></div>}
createRoot(document.getElementById('root')).render(<App/>);
`;
const mock = `export class ApiError extends Error {status=500;} export async function apiGet(url){await new Promise(r=>setTimeout(r,350));if(url.includes('/failure/'))throw new ApiError('Synthetic offline failure');return {status:'ready',basis:'current_rates_saved_usage',source:'saved_intervals',statementId:'preview',period:{start:'2026-08-01',end:'2026-08-30'},kwh:600,recordedPlan:'tou',rates:{effectiveDate:'2025-11-01',verifiedAt:'2026-09-27',reviewBefore:'2026-10-27'},plans:[{plan:'tou',minor:8110},{plan:'ulo',minor:6998},{plan:'tiered',minor:7200}],missing:[],thresholdKwh:600,message:'The same saved usage at today’s verified prices. These are electricity-charge scenarios, not your next bill or verified savings.',olderUsage:false};}`;
const result = await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false, minify: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" }, nodePaths: [temp + "/node_modules", root + "/apps/mobile/node_modules", root + "/node_modules"],
  plugins: [{ name: "preview", setup(b) {
    b.onResolve({ filter: /^react-native$/ }, () => ({ path: resolve(temp, "node_modules/react-native-web/dist/index.js") }));
    b.onResolve({ filter: /^expo-router$|^@expo\/vector-icons$|^@\/lib\/api$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "expo-router" ? "export {useEffect as useFocusEffect} from 'react';" : args.path === "@/lib/api" ? mock : "import React from 'react'; export function Feather({name,size,color}){return <span aria-hidden='true' style={{fontSize:size,color}}>{name==='chevron-up'?'⌃':'⌄'}</span>}", resolveDir: root, loader: "jsx" }));
    b.onResolve({ filter: /^@\// }, args => ({ path: [".ts", ".tsx", ".js"].map(ext => resolve(root,"apps/mobile/src",args.path.slice(2))+ext).find(existsSync) }));
    b.onResolve({ filter: /^react$|^react-dom\/client$|^react\/jsx-runtime$/ }, args => ({ path: require.resolve(args.path, {paths:[temp]}) }));
  } }],
});
writeFileSync(out + "/bundle.js", result.outputFiles[0].text);
writeFileSync(out + "/index.html", '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rezlee electricity plan · component QA</title><style>html,body{margin:0;background:#e3e3dc}button,select{font:inherit}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>'+result.outputFiles[0].text.replace(/<\/script/gi,"<\\/script")+'</script></body></html>');
console.log(out + "/index.html");

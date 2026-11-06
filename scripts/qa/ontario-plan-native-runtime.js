if(process.env.EXPO_PUBLIC_API_URL!=="https://staging.rezlee.com")throw Error("Unexpected environment");
const mods=[...globalThis.__r.getModules()];
const find=s=>{const row=mods.find(([,m])=>m.verboseName?.endsWith(s));return row?globalThis.__r(row[0]):null;};
const router=find("expo-router/build/exports.js")?.router, api=find("src/lib/api.ts");
const hook=globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
if(!router||!api||!hook)return {blocked:"Native modules unavailable"};
const payload=await api.apiGet("/api/mobile/v1/bills");
const saved=payload.bills?.find(b=>b.source==="manual"&&b.isHistoricalStatement);
if(!saved)return {blocked:"No existing statement to enter account route"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function nodes(start){const out=[],stack=[start];while(stack.length&&out.length<45000){const f=stack.pop();out.push(f);for(let c=f.child;c;c=c.sibling)stack.push(c);}return out;}
function all(){const out=[];for(const [id,renderer]of hook.renderers)for(const root of hook.getFiberRoots(id)||[])for(const f of nodes(root.current))out.push({f,renderer});return out;}
const name=f=>f.type?.name||f.elementType?.name||f.type?.render?.name;
const findNode=n=>all().find(x=>name(x.f)===n);
const textIn=f=>nodes(f).flatMap(x=>[x.memoizedProps?.children].flat(6).filter(v=>["string","number"].includes(typeof v)).map(String)).join(" ").replace(/\s+/g," ");
async function wait(n){for(let i=0;i<30;i++){const f=findNode(n);if(f)return f;await sleep(150);}throw Error(n+" did not mount");}
const defaults={previousBalance:"",amountDue:"",subtotal:"",tax:"",credits:"",usage:"",unit:"",reading:"",ratePlan:"",discountEnds:""};
const bill=(id,start,end,amount,usage,gas=false)=>({id,label:"SYNTHETIC PREVIEW ONLY",providerName:gas?"Synthetic gas preview":"Synthetic energy preview",providerId:null,category:gas?"Gas":"Electricity",categoryId:gas?"gas":"electricity",accountNumber:"Temporary example — not saved",currency:"CAD",source:"manual",isHistoricalStatement:true,amount,billingPeriodStart:start,billingPeriodEnd:end,reviewedEvidence:{...defaults,usage:String(usage),unit:gas?"m³":"kWh",reading:"actual"}});
const current=bill("synthetic-current","2026-08-01","2026-08-20",100,240), old=bill("synthetic-old","2026-07-01","2026-07-30",120,300);
const checks={},events=[];
let originalProps,restored=false;
router.push({pathname:"/bill/history-insights",params:{billId:saved.id}});
try{
 let target=await wait("ManualHistoryInsights"); originalProps=target.f.memoizedProps;
 target.renderer.overrideProps(target.f,[],{...originalProps,bills:[current],complete:true,today:"2026-09-27",initialBillId:current.id});
 await sleep(700);
 let panel=await wait("ElectricityPlanComparison");
 const toggle=()=>nodes(findNode("ElectricityPlanComparison").f).find(f=>f.memoizedProps?.accessibilityLabel==="Compare electricity plans. Ontario residential rates"&&f.memoizedProps.onPress);
 checks.collapsed=toggle().memoizedProps.accessibilityState.expanded===false;
 toggle().memoizedProps.onPress(); await sleep(300);
 panel=findNode("ElectricityPlanComparison");let text=textIn(panel.f);
 checks.expanded=toggle().memoizedProps.accessibilityState.expanded===true;
 checks.savedQuantity=text.includes("240 kWh");
 checks.tieredScenario=text.includes("$28.80");
 checks.noInventedBands=text.includes("not calculated");
 checks.costExclusions=text.includes("Delivery, losses, taxes and rebates are excluded");
 const details=nodes(panel.f).find(f=>f.memoizedProps?.onPress&&f.memoizedProps?.accessibilityRole==="button"&&textIn(f).includes("Rates & assumptions"));
 details?.memoizedProps.onPress();await sleep(200);
 checks.assumptionsOpen=textIn(findNode("ElectricityPlanComparison").f).includes("600 kWh");
 toggle().memoizedProps.onPress();await sleep(200);
 checks.collapses=toggle().memoizedProps.accessibilityState.expanded===false;
 target=findNode("ManualHistoryInsights");
 target.renderer.overrideProps(target.f,[],{...originalProps,bills:[bill("gas-preview","2026-08-01","2026-08-20",77,42,true)],complete:true,today:"2026-09-27",initialBillId:"gas-preview"});
 await sleep(500);checks.gasHasNoElectricityPanel=!findNode("ElectricityPlanComparison");
}catch(e){checks.error=String(e.message||e);}
finally{
 if(originalProps){const target=findNode("ManualHistoryInsights");if(target){target.renderer.overrideProps(target.f,[],originalProps);await sleep(250);restored=true;}}
 router.back();
}
return {checks,restored,allPassed:!checks.error&&Object.values(checks).every(Boolean),method:"Native component props and actual handlers; temporary labelled synthetic input; no screenshot, physical taps, writes or paid calls"};

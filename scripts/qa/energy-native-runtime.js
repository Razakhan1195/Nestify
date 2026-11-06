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
 let target=await wait("ManualHistoryInsights");
 originalProps=target.f.memoizedProps;
 async function apply(rows,complete=true){
  target=findNode("ManualHistoryInsights");
  target.renderer.overrideProps(target.f,[],{...originalProps,bills:rows,complete,today:"2026-09-01",initialBillId:rows[0]?.id,onOpen:id=>events.push(id)});
  await sleep(500);return await wait("EnergyBillInsights");
 }
 let energy=await apply([current]);let text=textIn(energy.f);
 checks.oneBillFacts=text.includes("$100.00")&&text.includes("240 kWh")&&text.includes("Upload an earlier bill")&&!text.includes("What changed");
 let disclosure=nodes(energy.f).find(f=>name(f)==="Disclosure"&&f.memoizedProps.title==="Bill details and original");
 disclosure.memoizedProps.onPress();await sleep(200);
 checks.detailsOpen=nodes(findNode("EnergyBillInsights").f).some(f=>name(f)==="QuietAction"&&f.memoizedProps.label==="Review or correct details");
 energy=await apply([current,old]);text=textIn(energy.f);
 checks.twoBillChange=text.includes("What changed")&&text.includes("$20.00 lower.")&&text.includes("25% higher")&&text.includes("10 → 12");
 const radio=nodes(energy.f).find(f=>f.memoizedProps?.accessibilityRole==="radio"&&f.memoizedProps?.onPress&&f.memoizedProps.children?.props?.children==="Usage / day");
 radio.memoizedProps.onPress();await sleep(200);
 checks.usageToggle=textIn(findNode("EnergyBillInsights").f).includes("kWh per day · actual readings");
 disclosure=nodes(findNode("EnergyBillInsights").f).find(f=>name(f)==="Disclosure"&&f.memoizedProps.title==="Period details");
 disclosure.memoizedProps.onPress();await sleep(200);
 const row=nodes(findNode("EnergyBillInsights").f).find(f=>name(f)==="BriefRow"&&f.memoizedProps.detail?.includes("/ day"));
 checks.exactPeriodDetails=!!row;row?.memoizedProps.onPress();checks.periodOpensCorrectStatement=events.includes(old.id)||events.includes(current.id);
 const twelve=Array.from({length:12},(_,i)=>{const month=i%12+1;return bill("synthetic-"+i,"2025-"+String(month).padStart(2,"0")+"-01","2025-"+String(month).padStart(2,"0")+"-20",100+i,200+i);});
 energy=await apply(twelve);checks.twelvePeriods=textIn(energy.f).includes("12 saved periods.");
 const estimated={...current,reviewedEvidence:{...current.reviewedEvidence,reading:"estimated"}};
 energy=await apply([estimated,old]);text=textIn(energy.f);checks.estimatedReading=text.includes("Estimated reading")&&text.includes("Part of this bill is estimated"); if(!checks.estimatedReading)checks.estimatedDebug={text:text.slice(0,2200),reading:energy.f.memoizedProps.account.bills[0].reviewedEvidence.reading};
 energy=await apply([current,old],false);text=textIn(energy.f);checks.failedRefreshKeepsFacts=text.includes("$100.00")&&text.includes("Showing saved information")&&!text.includes("What changed");
 const gas=bill("synthetic-gas","2026-08-01","2026-08-20",77,42,true);
 await apply([gas,current,old]);
 const chooser=nodes(findNode("ManualHistoryInsights").f).find(f=>f.memoizedProps?.accessibilityLabel?.startsWith("Choose account.")&&f.memoizedProps.onPress);
 checks.multipleAccountChoice=!!chooser;chooser?.memoizedProps.onPress();await sleep(200);
 const choice=nodes(findNode("ManualHistoryInsights").f).find(f=>f.memoizedProps?.accessibilityRole==="radio"&&f.memoizedProps.onPress&&textIn(f).includes("Synthetic energy preview"));
 choice?.memoizedProps.onPress();await sleep(600);
 checks.accountSwitch=!!choice&&findNode("EnergyBillInsights")?.f.memoizedProps.account.category==="Electricity"; if(!checks.accountSwitch)checks.switchDebug={choice:!!choice,category:findNode("EnergyBillInsights")?.f.memoizedProps.account.category,choosing:!!chooser};
}catch(e){checks.error=String(e.message||e);}
finally{
 if(originalProps){const target=findNode("ManualHistoryInsights");if(target){target.renderer.overrideProps(target.f,[],originalProps);await sleep(250);restored=true;}}
 router.back();
}
return {checks,restored,allPassed:!checks.error&&Object.values(checks).every(Boolean),method:"Native rendered component props and real UI handlers with transient labelled fixtures; no records saved, no screenshot or physical taps"};

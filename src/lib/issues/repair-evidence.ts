import {unstable_cache} from "next/cache";
import {remainingGuideSteps} from "./repair-guides";
import type {Progress} from "./session";
export type Evidence={id:string;label:string;url:string;checkedAt:string;text:string;scope:"general"|"manual";delivery?:"live"|"reviewed_reference"};
export const repairSources=[
 {id:"fridge",label:"Whirlpool: refrigerator troubleshooting",url:"https://www.whirlpool.ca/en_ca/blog/kitchen/refrigerator-troubleshooting.html",match:/fridge|refrigerator|freezer/i},
 {id:"dishwasher",label:"Whirlpool: dishwasher checks",url:"https://www.whirlpool.com/blog/kitchen/how-to-fix-a-dishwasher.html",match:/dishwash/i},
 {id:"washer",label:"Whirlpool: washing-machine checks",url:"https://www.whirlpool.com/blog/washers-and-dryers/how-to-fix-a-washing-machine.html",match:/washing machine|washer|laundry/i},
 {id:"tap",label:"Moen: faucet aerators",url:"https://solutions.moen.com/Article_Library/Faucet_Aerator_Cleaning",match:/faucet|tap|sink/i},
 {id:"network",label:"Rogers: internet connection checks",url:"https://www.rogers.com/support/internet/unable-to-access-the-internet-rogers-xfinity-gateway",match:/internet|wi.?fi|router|modem/i},
 {id:"thermostat",label:"Honeywell Home: heating checks",url:"https://www.honeywellhome.com/blogs/support/why-is-my-heating-not-working-no-heat",match:/thermostat|heating|furnace/i},
];
const hosts=new Set(repairSources.map(s=>new URL(s.url).hostname));
export function allowedGuideUrl(raw:string){try{const u=new URL(raw);return u.protocol==="https:"&&!u.username&&!u.password&&(!u.port||u.port==="443")&&hosts.has(u.hostname);}catch{return false;}}
export function articleText(html:string){
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??html;
 return main.replace(/<(script|style|nav|header|footer|svg)\b[^>]*>[\s\S]*?<\/\1>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim().slice(0,32000);
}
export async function readArticle(url:string):Promise<string>{
 let current=url;
 for(let redirects=0;redirects<3;redirects++){
  if(!allowedGuideUrl(current))throw Error("Unsupported source");
  const response=await fetch(current,{redirect:"manual",signal:AbortSignal.timeout(5000),headers:{"Accept":"text/html"}});
  if(response.status>=300&&response.status<400){current=new URL(response.headers.get("location")??"",current).href;continue;}
  if(!response.ok||!response.headers.get("content-type")?.includes("text/html"))throw Error("Source HTTP "+response.status+" "+(response.headers.get("content-type")??"missing").split(";")[0]);
  if(Number(response.headers.get("content-length")??0)>1500000)throw Error("Source too large");
  const reader=response.body?.getReader();if(!reader)throw Error("Empty source");
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000)throw Error("Source too large");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const text=articleText(Buffer.concat(chunks).toString("utf8"));if(text.length<300)throw Error("Source unavailable");return text;
 }
 throw Error("Source redirect unavailable");
}
// Short, reviewed quotations keep existing safe checks usable when a publisher
// declines server-side retrieval. This is not a live fetch or an exact-model manual.
export const reviewedReferences:Record<string,{checkedAt:string;text:string}>={
 fridge:{checkedAt:"2026-10-10T17:45:00.000Z",text:"ensure no items are blocking the vents. inspect the door seal to confirm they are in full contact with the refrigerator."},
 network:{checkedAt:"2026-10-10T23:58:02Z",text:"see if there is a known outage in your area. Restart and reconnect to your Gateway (if on WiFi), then try again."},
 tap:{checkedAt:"2026-10-10T23:58:02Z",text:"Moen produces a variety of faucet aerators. debris and mineral deposits, which can restrict water pressure or distort the spray pattern."},
};
export function reviewedRepairEvidence(id:string,now=Date.now()):Evidence|null {
 const source=repairSources.find(s=>s.id===id),review=reviewedReferences[id];
 if(!source||!review||now<Date.parse(review.checkedAt)||now-Date.parse(review.checkedAt)>30*86400000)return null;
 return {id:source.id,label:source.label,url:source.url,...review,scope:"general",delivery:"reviewed_reference"};
}
export function evidenceFailureCode(error:unknown){
 const message=error instanceof Error?error.message:"";
 if(/^Source HTTP [0-9]{3}/.test(message))return message.match(/^Source HTTP [0-9]{3}/)![0];
 if(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name))return "source_timeout";
 if(/cache/i.test(message))return "cache_unavailable";
 return ["Unsupported source","Source too large","Empty source","Source redirect unavailable","Article content unavailable","Source unavailable"].includes(message)?message:"source_fetch_failed";
}
export async function loadRepairSource(id:string,read=readArticle,now=Date.now()):Promise<Evidence|null>{
 const source=repairSources.find(s=>s.id===id);if(!source)return null;
 try {
  const text=await read(source.url);
  if(!source.match.test(text))throw Error("Article content unavailable");
  return {id:source.id,label:source.label,url:source.url,text,checkedAt:new Date(now).toISOString(),scope:"general",delivery:"live"};
 }catch(error){
  const reviewed=reviewedRepairEvidence(id,now);
  console.warn("[repair-evidence] retrieval",{sourceId:id,code:evidenceFailureCode(error),fallback:reviewed?"reviewed_reference":"unavailable"});
  return reviewed;
 }
}
// Cache bounded failures as well as successes; a blocked publisher should not delay
// every customer or be hammered by retries. Dates inside evidence are preserved.
const cachedSource=unstable_cache(async(id:string)=>loadRepairSource(id),["repair-official-evidence-v3"],{revalidate:3600});
export async function retrieveRepairEvidence(p:Progress):Promise<Evidence[]>{
 // Only retrieve evidence an eligible check can actually use. Observation-only
 // heating/unknown-equipment cases do not need unrelated article downloads.
 const urls=new Set(remainingGuideSteps(p).flatMap(step=>step.source?[step.source.url]:[]));
 const selected=repairSources.filter(s=>urls.has(s.url)).slice(0,2);
 const result=await Promise.all(selected.map(async source=>{
  try{return await cachedSource(source.id);}
  catch(error){
   console.warn("[repair-evidence] cache",{sourceId:source.id,code:evidenceFailureCode(error)});
   return reviewedRepairEvidence(source.id);
  }
 }));
 return result.filter((r):r is Evidence=>!!r&&(r.delivery!=="reviewed_reference"||!!reviewedRepairEvidence(r.id)));
}

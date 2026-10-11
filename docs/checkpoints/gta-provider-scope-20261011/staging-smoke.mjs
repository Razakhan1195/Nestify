import fs from "node:fs";import{execFileSync}from"node:child_process";import crypto from "node:crypto";
const cp="/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/gta-provider-scope-20261011";
const s=JSON.parse(fs.readFileSync(process.env.HOME+"/Library/Application Support/Rezlee/rogers-hosted-staging-settings.json","utf8"));
if(s.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging required");
const base=JSON.parse(fs.readFileSync(cp+"/deployment.json","utf8")).url;
const key=s.SUPABASE_SECRET_KEY,anon=s.NEXT_PUBLIC_SUPABASE_ANON_KEY,sb=s.NEXT_PUBLIC_SUPABASE_URL;
async function req(url,method="GET",body,headers={}){if(url.startsWith(base)){
 const args=["vercel","curl",url.slice(base.length),"--deployment",base,"--scope","razakhan1195s-projects","--","--silent","--show-error","--request",method,"--write-out","\\n%{http_code}","--header","Content-Type: application/json"];
 for(const[k,v]of Object.entries(headers))args.push("--header",k+": "+v);if(body)args.push("--data-raw",JSON.stringify(body));
 let out;try{out=execFileSync("npx",args,{cwd:"/tmp/rezlee-gta-provider-scope-staging-20261011",encoding:"utf8",timeout:60000,stdio:["ignore","pipe","pipe"]}).trim()}catch{throw Error("Protected staging smoke request failed");}
 const cut=out.lastIndexOf("\n");let json;try{json=JSON.parse(out.slice(0,cut))}catch{}return{status:Number(out.slice(cut+1)),json};
}const r=await fetch(url,{method,headers:{"Content-Type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});let json;try{json=await r.json()}catch{}return{status:r.status,json};}
const admin={apikey:key,Authorization:"Bearer "+key},checks=[];let userId;
const routing=JSON.parse(fs.readFileSync("/Users/razakhan/Documents/rezlee-mobile-test/src/lib/deck/gta-provider-routing.json","utf8")).providers;
let report;
function check(name,ok,extra={}){checks.push({name,ok,...extra});}
try{
 const email="gta-scope-"+crypto.randomUUID()+"@example.invalid",password=crypto.randomBytes(30).toString("base64url");
 const u=await req(sb+"/auth/v1/admin/users","POST",{email,password,email_confirm:true},admin);if(u.status!==200)throw Error("Synthetic user creation "+u.status);userId=u.json.id;
 const home=await req(sb+"/rest/v1/homes","POST",{user_id:userId,nickname:"GTA scope QA",province:"ON",country:"Canada"},{...admin,Prefer:"return=representation"});if(home.status!==201)throw Error("QA home "+home.status);
 const signed=await req(sb+"/auth/v1/token?grant_type=password","POST",{email,password},{apikey:anon});if(signed.status!==200)throw Error("QA authentication "+signed.status);
 const auth={Authorization:"Bearer "+signed.json.access_token};
 const unauth=await req(base+"/api/mobile/v1/providers");check("Unauthenticated catalogue denied",unauth.status===401);
 const result=await req(base+"/api/mobile/v1/providers?hostedAuthVersion=2","GET",undefined,auth);
 if(result.status!==200||!Array.isArray(result.json.catalog))throw Error("Catalogue smoke "+result.status);
 const catalog=result.json.catalog;
 check("30 online choices and 10 document alternatives",catalog.length===40&&catalog.filter(x=>x.connectionAvailable).length===30&&catalog.filter(x=>x.documentAlternative).length===10);
 check("No Green Button overlap offered as a new Deck connection",routing.filter(x=>x.greenButton).every(x=>!catalog.some(y=>y.id===x.id&&y.connectionAvailable)));
 check("No deferred regional provider in new catalogue",routing.filter(x=>x.route==="later").every(x=>!catalog.some(y=>y.id===x.id)));
 check("All automatic choices use secure hosted sign-in",catalog.filter(x=>x.connectionAvailable).every(x=>x.hostedAuth&&x.telecomHistory));
 for(const city of ["Toronto","Mississauga","Brampton","Caledon","Ajax","Pickering","Whitby","Oshawa","Clarington","Scugog","Uxbridge","Brock","Burlington","Oakville","Milton","Halton Hills","Aurora","East Gwillimbury","Georgina","King","Markham","Newmarket","Richmond Hill","Vaughan","Stouffville"]){
  check("Water route: "+city,catalog.some(r=>r.utility_type==="Water"&&(r.name+" "+r.searchAliases.join(" ")).toLowerCase().includes(city.toLowerCase())));
 }
 for(const name of ["Elexicon Energy","Enbridge Gas","Burlington Hydro","BC Hydro"]){
  const provider=routing.find(x=>x.name===name);
  const q=await req(base+"/api/mobile/v1/providers/hosted-auth","POST",{action:"start",registryProviderId:provider.id,historyMonths:1},auth);
  check("Blocked new connection: "+name,q.status===409&&typeof q.json?.error==="string",{status:q.status});
 }
 const intents=await req(sb+"/rest/v1/deck_hosted_auth_intents?select=id&user_id=eq."+userId,"GET",undefined,admin);
 check("Blocked attempts created no hosted intents",intents.status===200&&intents.json.length===0);
 const savedId=crypto.randomUUID(),elexicon=routing.find(x=>x.name==="Elexicon Energy");
 const saved=await req(sb+"/rest/v1/providers","POST",{id:savedId,user_id:userId,home_id:home.json[0].id,name:elexicon.name,registry_provider_id:elexicon.id,deck_connection_status:"disconnected"},admin);
 if(saved.status!==201)throw Error("Synthetic existing connection "+saved.status);
 const again=await req(base+"/api/mobile/v1/providers?hostedAuthVersion=2","GET",undefined,auth);
 check("Existing energy connection remains visible",again.status===200&&again.json.providers.some(x=>x.id===savedId));
 const oldEntry=again.json.catalog.find(x=>x.id===elexicon.id);
 check("Existing energy connection retains secure reconnect metadata",oldEntry?.existingOnly===true&&oldEntry.name===elexicon.name&&oldEntry.hostedAuth===true);
 const detail=await req(base+"/api/mobile/v1/providers/"+savedId+"?hostedAuthVersion=2","GET",undefined,auth);
 check("Existing connection detail remains accessible",detail.status===200&&detail.json.provider?.reconnectAvailable===true,{status:detail.status});
 const unknown=await req(base+"/api/mobile/v1/providers/"+crypto.randomUUID(),"GET",undefined,auth);
 check("Unowned provider detail unavailable",unknown.status===404,{status:unknown.status});
 report={base,checks,providerRunsStarted:0,syntheticUserRemoved:false};
 if(checks.some(c=>!c.ok))process.exitCode=1;
}finally{
 if(userId){const deleted=await req(sb+"/auth/v1/admin/users/"+userId,"DELETE",undefined,admin);if(deleted.status!==200)throw Error("QA cleanup failed "+deleted.status);if(report)report.syntheticUserRemoved=true;}
 if(report){fs.writeFileSync(cp+"/staging-smoke.json",JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.ok),providerRunsStarted:0,syntheticUserRemoved:report.syntheticUserRemoved}));}
}

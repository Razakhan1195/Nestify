import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {buildHomeContext} from "../../src/lib/assistant/home-context";
const settings=JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,opts);
const fixtures:{id:string;token:string;client:typeof admin;home:string}[]=[],records:{token:string;id:string}[]=[],checks:string[]=[];
const base="https://staging.rezlee.com";
const check=(name:string,ok:unknown)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name)};
async function fixture(){
 const email="capture-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable account creation failed");
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error("Fixture sign-in failed");
 const holder={id:made.data.user.id,client,token:login.data.session!.access_token,home:""};fixtures.push(holder);
 const h=await client.from("homes").insert({user_id:holder.id,nickname:"Disposable capture acceptance",home_type:"apartment",ownership_type:"renter",city:"Toronto",province:"Ontario"}).select("id").single();
 if(h.error)throw Error("Fixture home failed");holder.home=h.data.id;return holder;
}
async function api(token:string,path:string,body?:object|FormData,method=body?"POST":"GET"){
 const form=body instanceof FormData;
 const r=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token,...(!form?{"Content-Type":"application/json"}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
async function main(){
 let failure:string|null=null,cleaned=true;
 try{
  const owner=await fixture(),other=await fixture();
  const item=await api(owner.token,"/api/mobile/v1/inventory",{name:"Furnace",brand:"Example",model_number:"X100",serial_number:"PRIVATE-SERIAL",category:"HVAC",room_or_area:"Utility room",warranty_expires_on:"",product_barcode:""});
  check("reviewed scan fields save to existing inventory",item.status===200&&item.body.itemId);
  const viewed=await api(owner.token,"/api/mobile/v1/inventory?id="+item.body.itemId);
  check("exact model retained on reopen",viewed.body.item.model_number==="X100");
  check("another household cannot access scanned item",(await api(other.token,"/api/mobile/v1/inventory?id="+item.body.itemId)).status===404);
  const requestId=randomUUID(),title="Furnace inspection invoice",notes="Read from original and reviewed: Example Heating, model X100, quoted inspection CAD 140. Issue date 2026-09-14. No work completion or payment confirmed.";
  const form=new FormData();
  for(const [k,v] of Object.entries({requestId,expectedHomeId:owner.home,title,category:"Other",issued_on:"2026-09-14",expires_on:"",notes}))form.append(k,v);
  form.append("file",new File(["%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"],"disposable-service-invoice.pdf",{type:"application/pdf"}));
  const saved=await api(owner.token,"/api/mobile/v1/vault/records",form);
  check("reviewed document and original save together",saved.status===200&&saved.body.id);
  records.push({token:owner.token,id:saved.body.id});
  const retry=await api(owner.token,"/api/mobile/v1/vault/records",form);
  check("retry returns the same document without duplication",retry.status===200&&retry.body.id===saved.body.id);
  const record=await api(owner.token,"/api/mobile/v1/vault/records?id="+saved.body.id);
  check("dates, evidence notes and attachment survive reopen",record.body.record.issued_on==="2026-09-14"&&record.body.record.notes===notes&&record.body.record.hasFile===true);
  check("original has an authorized download path",(await api(owner.token,"/api/mobile/v1/vault/records?id="+saved.body.id+"&file=1")).status===200);
  check("other household cannot read the document",(await api(other.token,"/api/mobile/v1/vault/records?id="+saved.body.id)).status===404);
  const context=await buildHomeContext(owner.client,owner.id,{id:owner.home,nickname:"Disposable capture"} as never);
  check("current code reuses saved exact model",context.includes('"model":"X100"'));
  check("current code reuses reviewed invoice facts",context.includes("quoted inspection CAD 140"));
  check("serial number is not unnecessarily sent to assistant context",!context.includes("PRIVATE-SERIAL"));
  const care=await api(owner.token,"/api/mobile/v1/care");
  check("invoice creates no unconfirmed completed service",care.status===200&&care.body.tasks.length===0);
  const plan=await api(owner.token,"/api/mobile/v1/care/plan");
  check("saved equipment informs existing Care setup",plan.status===200&&plan.body.suggestedAreas.includes("heating"));
  const home=await api(owner.token,"/api/mobile/v1/home?availability=1");
  check("household remains accessible after capture",home.status===200&&home.body.home.id===owner.home);
 }catch(e){failure=e instanceof Error?e.message:"Unknown failure";console.log("FAIL",failure);}
 finally{
  for(const record of records){const r=await api(record.token,"/api/mobile/v1/vault/records?id="+record.id,undefined,"DELETE").catch(()=>null);if(r?.status!==200)cleaned=false;}
  for(const user of fixtures)if((await admin.auth.admin.deleteUser(user.id)).error)cleaned=false;
  writeFileSync("docs/home-capture-live-2026-10-02.json",JSON.stringify({date:new Date().toISOString(),checks,failure,fixturesRemoved:cleaned,aiCalls:0,providerCalls:0,productionChanged:false,scope:"Existing staging save endpoints plus current local context loader"},null,2));
  process.exitCode=failure||!cleaned?1:0;
 }
}
void main();

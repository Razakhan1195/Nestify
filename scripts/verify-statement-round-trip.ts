/** Bounded, explicitly authorized live acceptance. Never writes to customer accounts. */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { gateway } from "@ai-sdk/gateway";
import { historicalStatementExtractionSchema } from "../src/lib/ai/historical-statement";
import {extractedIntakeEvidence,intakeEvidencePayload} from "../apps/mobile/src/lib/statement-intake-evidence";
import { statementSuggestions, statementChargeReview, statementDuplicate } from "../apps/mobile/src/lib/statement-review";
import { emptyStatementFields } from "../apps/mobile/src/lib/statement-batch-core";
import { missingStatementFields } from "../apps/mobile/src/lib/statement-reading";
import { manualHistoryAccounts, analyzeManualHistory, type HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
import { explainStatementChange } from "../apps/mobile/src/lib/statement-change";

function pdf(lines: string[]) {
 const escape=(v:string)=>v.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
 const content="BT /F1 10 Tf 40 760 Td "+lines.map((line,i)=>(i?"0 -18 Td ":"")+"("+escape(line)+") Tj").join("\n")+" ET";
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+Buffer.byteLength(content)+" >>\nstream\n"+content+"\nendstream"];
 let out="%PDF-1.4\n";const offsets:number[]=[];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";});
 const xref=Buffer.byteLength(out);out+="xref\n0 6\n0000000000 65535 f \n"+offsets.map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
 return new Uint8Array(Buffer.from(out));
}
async function main(){
 if(!process.argv.includes("--authorized-live"))throw Error("Explicit live acceptance authorization is required; no network calls made.");
 const settingsPath=process.env.REZLEE_ACCEPTANCE_SETTINGS_FILE;
 if(!settingsPath)throw Error("Provide isolated staging settings via REZLEE_ACCEPTANCE_SETTINGS_FILE.");
 const settings=JSON.parse(await readFile(settingsPath,"utf8"));
 const url="https://gjwvalpxnfbvryosmcbj.supabase.co",base="https://staging.rezlee.com";
 if(settings.NEXT_PUBLIC_SUPABASE_URL!==url)throw Error("Staging target mismatch; no requests made.");
 const before=await gateway.getCredits();
 if(Number(before.balance)<1)throw Error("At least one existing Gateway credit is required; no model calls made.");
 const admin=createClient(url,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const fixtures:Array<{id:string;home:string|null;token:string}>=[],checks:string[]=[],reads:Array<{case:string;ms:number}>=[];
 let failed=false,creditAfter:string|null=null;
 const check=(label:string,ok:unknown)=>{if(!ok)throw Error(label);checks.push(label);console.log("PASS",label);};
 async function account(){
  const email="statement-roundtrip-"+randomUUID()+"@example.invalid",password=randomUUID()+"Aa9!";
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(made.error||!made.data.user)throw Error("Could not create isolated staging fixture");
  const fixture={id:made.data.user.id,home:null as string|null,token:""};fixtures.push(fixture);
  const client=createClient(url,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password});if(login.error||!login.data.session)throw Error("Fixture sign-in failed");fixture.token=login.data.session.access_token;
  const home=await client.from("homes").insert({user_id:fixture.id,nickname:"Synthetic statement round-trip QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();
  if(home.error)throw Error("Fixture home creation failed");fixture.home=home.data.id;return fixture;
 }
 async function api(f:{token:string},path:string,method="GET",body?:FormData|Record<string,unknown>){
  const response=await fetch(base+path,{method,headers:{Authorization:"Bearer "+f.token,...(body&&!(body instanceof FormData)?{"Content-Type":"application/json"}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(55000)});
  return {status:response.status,data:await response.json()};
 }
 try{
  const a=await account(),b=await account();
  const caps=await api(a,"/api/mobile/v1/ai/scan");
  check("statement-only reader enabled",caps.status===200&&caps.data.statementExtraction===true);
  const uploadCaps=await api(a,"/api/mobile/v1/bills/capabilities");
  check("initial supporting evidence available",uploadCaps.status===200&&uploadCaps.data.statementIntakeEvidence===true);
  const cases=[
   {id:"internet-july",provider:"Synthetic Lake Internet",category:"Internet",account:"1234",start:"2026-07-01",end:"2026-07-31",issue:"2026-08-01",amount:113,due:313,subtotal:100,tax:13},
   {id:"internet-august",provider:"Synthetic Lake Internet",category:"Internet",account:"1234",start:"2026-08-01",end:"2026-08-31",issue:"2026-09-01",amount:135.6,due:335.6,subtotal:120,tax:15.6},
   {id:"electricity-august",provider:"Synthetic Ontario Electricity",category:"Electricity",account:"5678",start:"2026-08-01",end:"2026-08-31",issue:"2026-09-01",amount:90.4,due:290.4,subtotal:80,tax:10.4},
  ];
  const saved:Array<{id:string;requestId:string;form:()=>FormData;amount:number}>=[];
  for(const c of cases){
   const bytes=pdf(["SYNTHETIC QA STATEMENT - NOT A CUSTOMER BILL",c.provider,"Service: "+c.category,"Account number: 0000"+c.account,"Currency: CAD (Canadian dollars)","Service period: "+c.start+" to "+c.end,"Issue date: "+c.issue,"Payment due date: 2026-09-30","Previous balance: CAD 200.00","Subtotal BEFORE taxes and credits: CAD "+c.subtotal.toFixed(2),"Total current-period tax: CAD "+c.tax.toFixed(2),"Total current-period credits: CAD 0.00",...(c.category==="Electricity"?["Total service-period consumption: 510 kWh","Reading type: actual","Rate plan: Time-of-Use"]:[]),"Current period charges INCLUDING TAX: CAD "+c.amount.toFixed(2),"Total amount due INCLUDING previous balance: CAD "+c.due.toFixed(2),"Payment status: not provided. No receipt or payment confirmation."]);
   const form=new FormData();form.append("kind","bill_history");form.append("file",new File([bytes],c.id+".pdf",{type:"application/pdf"}));
   const start=Date.now(),response=await api(a,"/api/mobile/v1/ai/scan","POST",form);reads.push({case:c.id,ms:Date.now()-start});
   check(c.id+": live extraction returns successfully",response.status===200);
   const parsed=historicalStatementExtractionSchema.safeParse(response.data.data);check(c.id+": valid extraction schema",parsed.success);if(!parsed.success)throw Error("Invalid extracted schema");
   const raw=parsed.data,charges=statementChargeReview(raw),fields={...emptyStatementFields,...statementSuggestions(raw,""),record_kind:"historical" as const,amount:charges.amount};
   check(c.id+": provider/service/account extracted",fields.provider_name===c.provider&&fields.category===c.category&&fields.account_number==="Account ending "+c.account);
   check(c.id+": period charges kept separate from arrears",Number(fields.amount)===c.amount&&Number(fields.amount)!==c.due&&charges.currencyReview==="CAD");
   check(c.id+": service dates extracted",fields.billing_period_start===c.start&&fields.billing_period_end===c.end);
   check(c.id+": review needs no retyping",missingStatementFields(fields).length===0);
   const evidence=extractedIntakeEvidence(raw);
   check(c.id+": same read extracts balances and charge breakdown",Number(evidence.fields.subtotal)===c.subtotal&&Number(evidence.fields.tax)===c.tax&&evidence.fields.credits!==""&&Number(evidence.fields.credits)===0&&Number(evidence.fields.previousBalance)===200&&Number(evidence.fields.amountDue)===c.due);
   check(c.id+": source excerpts present",Boolean(evidence.quotes.subtotal&&evidence.quotes.tax));
   if(c.category==="Electricity")check("usage and unit extracted together",evidence.fields.usage==="510"&&evidence.fields.unit==="kWh"&&evidence.fields.reading==="actual");
   const requestId=randomUUID();
   const uploadForm=()=>{const form=new FormData();for(const [key,value]of Object.entries({...fields,requestId,expectedHomeId:a.home!,reviewed:"true",currency:"CAD"}))form.append(key,value);form.append("supporting_details",JSON.stringify(intakeEvidencePayload(evidence)));form.append("file",new File([bytes],c.id+".pdf",{type:"application/pdf"}));return form;};
   const upload=await api(a,"/api/mobile/v1/bills/history/upload","POST",uploadForm());check(c.id+": reviewed extraction saved",upload.status===200&&upload.data.billId);
   const detail=await api(a,"/api/mobile/v1/bills/"+upload.data.billId+"/evidence");
   check(c.id+": reviewed evidence persists on initial save",detail.status===200&&detail.data.fields?.tax===evidence.fields.tax&&detail.data.fields?.amountDue===evidence.fields.amountDue&&!detail.data.needsReview);
   const original=await api(a,"/api/mobile/v1/bills/"+upload.data.billId+"/original");check(c.id+": original accessible",original.status===200&&typeof original.data.url==="string");
   const download=await fetch(original.data.url,{redirect:"error",signal:AbortSignal.timeout(15000)});check(c.id+": original bytes retained",download.ok&&Buffer.from(await download.arrayBuffer()).equals(Buffer.from(bytes)));
   saved.push({id:upload.data.billId,requestId,form:uploadForm,amount:c.amount});
  }
  const first=saved[0];
  const replay=await api(a,"/api/mobile/v1/bills/history/upload","POST",first.form());check("same-request retry returns the same bill",replay.status===200&&replay.data.billId===first.id);
  const resume=await api(a,"/api/mobile/v1/bills/history/upload?requestId="+first.requestId,"PATCH");check("lost-response recovery returns the same bill",resume.status===200&&resume.data.billId===first.id);
  const duplicateForm=first.form();duplicateForm.set("requestId",randomUUID());
  const duplicate=await api(a,"/api/mobile/v1/bills/history/upload","POST",duplicateForm);check("new request cannot duplicate an existing period",duplicate.status===409&&statementDuplicate(duplicate.data)?.billId===first.id);
  const denied=await api(b,"/api/mobile/v1/bills/"+first.id+"/original");check("another household cannot retrieve the original",denied.status===404);
  const list=await api(a,"/api/mobile/v1/bills");check("exactly three saved statements remain",list.status===200&&list.data.bills.length===3);
  const accounts=manualHistoryAccounts(list.data.bills as HistoryBill[]);check("mixed providers produce two separate accounts",accounts.length===2);
  const internet=accounts.find(v=>v.category==="Internet")!,electricity=accounts.find(v=>v.category==="Electricity")!;
  check("internet history includes only its two periods",internet?.bills.length===2);
  check("electricity retains a useful standalone statement",electricity?.bills.length===1&&electricity.bills[0].amount===90.4);
  const analysis=explainStatementChange(analyzeManualHistory(internet,{today:"2026-09-26",complete:list.data.historyCoverage?.complete===true}));
  check("two extracted bills support a deterministic charge comparison",analysis?.changeMinor===2260);
  check("printed breakdown explains the recorded change",Boolean(analysis?.chargeBreakdown)&&analysis?.usage===null);
  const corrected=await api(a,"/api/mobile/v1/bills/"+saved[1].id,"PATCH",{amount:"140",due_date:"",name:"Synthetic Lake Internet",category:"Internet"});check("reviewed amount correction succeeds",corrected.status===200);
  const updated=await api(a,"/api/mobile/v1/bills");const correctedAccount=manualHistoryAccounts(updated.data.bills).find(v=>v.category==="Internet")!;
  check("account insight uses the corrected amount",explainStatementChange(analyzeManualHistory(correctedAccount,{today:"2026-09-26",complete:true}))?.changeMinor===2700);
 }catch(error){failed=true;console.log("FAIL",error instanceof Error?error.message:"Acceptance failed");}
 finally{
  for(const f of fixtures){try{
   if(f.home){const prefix=f.id+"/"+f.home+"/saves";const listed=await admin.storage.from("rezlee-documents").list(prefix,{limit:100});if(listed.error)throw Error("list");const paths=(listed.data??[]).map(v=>prefix+"/"+v.name);if(paths.length){const deleted=await admin.storage.from("rezlee-documents").remove(paths);if(deleted.error)throw Error("storage");}}
   const removed=await admin.auth.admin.deleteUser(f.id);if(removed.error)throw Error("account");console.log("CLEANED disposable fixture");
  }catch{failed=true;console.log("Fixture cleanup needs review");}}
  try{creditAfter=(await gateway.getCredits()).balance;}catch{/* Verification result remains honest if accounting read fails. */}
  const result={synthetic:true,liveModelCalls:reads.length,reads,checks,failed,fixtureCount:fixtures.length,creditBefore:before.balance,creditAfter,observedCreditDelta:creditAfter===null?null:Number(before.balance)-Number(creditAfter)};
  await writeFile("/tmp/rezlee-statement-intake-results.json",JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,failed,liveModelCalls:reads.length,creditAfter}));
 }
 if(failed)process.exitCode=1;
}
void main().catch(()=>{console.error("Acceptance preflight failed. Check authorization, isolated staging settings and existing credit access. No automatic retry.");process.exitCode=1;});

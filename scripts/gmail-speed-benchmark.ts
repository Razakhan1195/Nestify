// Controlled synthetic extraction comparison; never reads a real mailbox.
import {readFileSync,writeFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
import {generateText,Output} from "ai";
import {gateway} from "@ai-sdk/gateway";
import {EMAIL_EXTRACTION_INSTRUCTION,emailModelProposalSchema,normalizeEmailProposal} from "../src/lib/email-memory/extraction";
import {verifiedProposal} from "../src/lib/email-memory/review";
async function main(){
 const settings=JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
 if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
 for(const [k,v] of Object.entries(settings))if(typeof v==="string")process.env[k]=v;
 const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 const email="gmail-speed-"+crypto.randomUUID()+"@example.com",password=crypto.randomUUID()+crypto.randomUUID();
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error||!created.data.user)throw Error("Test account unavailable");
 const user=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 const fixtures=[
 {name:"notice",text:"Synthetic Enercare billing notice. Your amount due is CAD 46.18. Payment due date: 2026-10-10. View your actual statement in the customer portal. This email does not provide a billing period or current charges.",expected:{category:"utility_bill",amount_due:"46.18",period_charges:null,period_start:null,due_date:"2026-10-10"}},
 {name:"bill-with-arrears",text:"Synthetic Ontario electricity bill. Provider: Example Hydro. Service period 2026-08-01 to 2026-08-31. Current charges including tax: CAD 113.00. Previous balance CAD 40.00. Amount due CAD 153.00. Due date 2026-09-20. Automatic payment scheduled; payment has not been confirmed.",expected:{category:"utility_bill",period_charges:"113.00",amount_due:"153.00",period_start:"2026-08-01",period_end:"2026-08-31"}},
 {name:"receipt-unknown-warranty",text:"Synthetic appliance receipt. Example Appliances. Purchase date 2026-09-15. Refrigerator model FR123, total CAD 899.00. Warranty details are available separately from the manufacturer. No warranty duration or expiry date is specified.",expected:{category:"receipt",expires_on:null,period_charges:null,period_start:null}}
 ];
 const results:unknown[]=process.argv.includes("--finish")?JSON.parse(readFileSync("docs/qa/gmail-speed-benchmark-20261002.json","utf8")).results:[];
 try{
  const login=await user.auth.signInWithPassword({email,password});if(login.error)throw Error("Test sign-in failed");
  for(const [i,fixture] of fixtures.entries())for(const mode of i%2?["fast","baseline"]:["baseline","fast"]){
   if(process.argv.includes("--finish")&&(fixture.name!=="receipt-unknown-warranty"||mode!=="fast"))continue;
   const reserve=await user.rpc("reserve_rezlee_ai_request_v2");if(reserve.error||reserve.data!=="allowed")throw Error("Benchmark allowance unavailable");
   const started=Date.now();
   try{
    const result=await generateText({model:gateway("google/gemini-2.5-flash"),maxRetries:0,maxOutputTokens:2200,providerOptions:{gateway:{zeroDataRetention:true,disallowPromptTraining:true},...(mode==="fast"?{google:{thinkingConfig:{thinkingBudget:0}}}: {})},abortSignal:AbortSignal.timeout(25000),output:Output.object({schema:emailModelProposalSchema}),system:EMAIL_EXTRACTION_INSTRUCTION,messages:[{role:"user",content:[{type:"text",text:JSON.stringify({household_email_excerpt:fixture.text})}]}]});
    const value=normalizeEmailProposal(result.output),passed=Object.entries(fixture.expected).every(([k,v])=>(value as Record<string,unknown>)[k]===v)&&Boolean(verifiedProposal(value,fixture.text,false));
    const row={fixture:fixture.name,mode,elapsedMs:Date.now()-started,passed,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens,reasoningTokens:result.usage.outputTokenDetails?.reasoningTokens};results.push(row);console.log(JSON.stringify(row));
   }catch(e){const row={fixture:fixture.name,mode,elapsedMs:Date.now()-started,passed:false,errorType:e instanceof Error?e.name:"unknown"};results.push(row);console.log(JSON.stringify(row));}
  }
 }finally{await admin.auth.admin.deleteUser(created.data.user.id);writeFileSync("docs/qa/gmail-speed-benchmark-20261002.json",JSON.stringify({synthetic:true,calls:results.length,results},null,2));}
}
main().catch(()=>{console.error("Benchmark stopped safely; inspect sanitized results.");process.exitCode=1;});

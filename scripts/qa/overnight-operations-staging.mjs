import fs from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { attentionFilter } from "../../src/lib/ops/attention.ts";
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL,"https://gjwvalpxnfbvryosmcbj.supabase.co");
const db=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(name,value)=>{assert.ok(value,name);checks.push({name,pass:true});console.log("PASS",name)},checks=[];
const budget=await db.from("rezlee_ai_budget_config").select("enabled,daily_requests,monthly_requests").eq("singleton",true).single();
check("durable shared AI limits are readable and bounded",!budget.error&&budget.data.daily_requests>0&&budget.data.monthly_requests>0);
const attention=await db.from("account_deletion_jobs").select("id",{count:"exact",head:true}).or(attentionFilter("deletions",Date.now()));
check("live PostgREST accepts the deletion wait and attention filter",!attention.error);
const pending=await db.from("account_deletion_jobs").select("id",{count:"exact",head:true}).neq("status","completed");
check("all disposable deletion jobs were cleaned up",!pending.error&&pending.count===0);
for(const path of ["/api/admin/operations","/api/account-deletion/worker","/api/mobile/v1/account/deletion"]){
 const r=await fetch("https://staging.rezlee.com"+path,{redirect:"error",signal:AbortSignal.timeout(25000)});
 check("unauthenticated access refused: "+path,r.status===401);
}
const flags=Object.fromEntries(["ACCOUNT_DELETION_ENABLED","REZLEE_EMAIL_CODE_ENABLED","REZLEE_AI_DISABLED","REZLEE_STATEMENT_READING_ENABLED","REZLEE_OPS_ENABLED","REZLEE_DECK_TESTING_ENABLED","REZLEE_WELCOME_ENABLED","REZLEE_WELCOME_START_AT"].map(k=>[k,settings[k]??null]));
fs.writeFileSync("docs/checkpoints/overnight-finish-20261012/operations-results.json",JSON.stringify({verifiedAt:new Date().toISOString(),checks,budget:budget.data,attentionCount:attention.count,flags,notes:["No authenticated operator MFA session was impersonated.","No paid AI/provider calls or customer messages.","Request limits are not dollar budgets; production budgets and restore evidence remain gates."]},null,2));
console.log(JSON.stringify({passed:checks.length,budget:budget.data,flags},null,2));

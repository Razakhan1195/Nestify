import { effectiveBillTable } from "@/lib/product/bill-records";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { outcomeStatement } from "@/lib/product/bill-outcome";
import { evaluateBillTarget, parseBillTarget, sameOutcomeAccount, outcomeHasComparison, type OutcomeStatement, type BillTarget } from "../../../../../../../../apps/mobile/src/lib/bill-outcome";
import { historyDate } from "../../../../../../../../apps/mobile/src/lib/manual-history-insights";
import { moneyCents } from "../../../../../../../../apps/mobile/src/lib/statement-evidence";
export const dynamic = "force-dynamic";
const respond = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const date = z.string().refine(historyDate);
const amount = z.string().refine(v => moneyCents(v) !== null && moneyCents(v)! >= 0);
const schema = z.object({
  version: z.string(), kind: z.enum(["agreed_amount","usage_change"]).optional(),
  title: z.string().trim().min(1).max(120), expectedAmount: z.union([z.literal(""),amount]),
  effectiveDate: date, cost: z.union([z.literal(""), amount]), notes: z.string().max(2000),
  state: z.enum(["planned", "implemented", "completed", "abandoned"]), evidenceBillId: z.string().uuid().nullable(),
  snoozedUntil: date.nullable(), agreementConfirmed: z.boolean(), confirmBaseline: z.boolean().optional(),
}).strict();
const columns="id,name,provider_id,custom_provider_name,account_number_masked,currency,amount,billing_period_start,billing_period_end,original_document_id,source,status,raw_data,usage_amount,usage_unit,updated_at";
const literalPattern = (value: string) => value.trim().replace(/[\\%_]/g, "\\$&");
const overlaps=(a:OutcomeStatement,b:OutcomeStatement)=>a.id!==b.id&&historyDate(a.start)&&historyDate(a.end)&&historyDate(b.start)&&historyDate(b.end)&&a.start<=b.end&&a.end>=b.start;
async function load(request: Request, id: string) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { response: respond({ error: auth.error.message }, auth.error.status) };
  if (!z.string().uuid().safeParse(id).success) return { response: respond({ error: "Choose a saved statement." }, 400) };
  const home = await auth.supabase.from("homes").select("id").eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (home.error || !home.data) return { response: respond({ error: "Could not verify your household." }, 409) };
  const ctx = { supabase: auth.supabase, userId: auth.user.id, homeId: home.data.id };
  const loaded=await ctx.supabase.from("bills").select(columns).eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
  if(loaded.error)return {response:respond({error:"Could not load this statement. Try again."},503)};
  if(!loaded.data)return {response:respond({error:"That statement is unavailable."},404)};
  const bill=loaded.data, adapted=outcomeStatement(bill);
  const raw=(bill.raw_data && typeof bill.raw_data==="object" && !Array.isArray(bill.raw_data) ? bill.raw_data : {}) as Record<string,unknown>;
  const saved=await ctx.supabase.from("bill_outcome_actions").select("revision,target,baseline_snapshot,previous_baseline").eq("bill_id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
  if(saved.error)return {response:respond({error:"Follow-ups could not be loaded. Your saved bills and actions are unchanged; try again."},503)};
  const revision=saved.data?.revision??0;
  const target=parseBillTarget(saved.data?.target??raw.bill_target);
  if(!adapted&&!target)return {response:respond({error:"Choose a saved CAD telecom, electricity or gas statement with an identified account. Other saved bills remain available in History."},409)};
  const kind=target ? target.kind??"agreed_amount" : adapted!.kind;
  const supported=!!adapted&&adapted.kind===kind;
  const oldSnapshot=(saved.data?.baseline_snapshot??raw.bill_target_baseline_snapshot??{}) as OutcomeStatement;
  const baseline:OutcomeStatement=adapted?.statement??{...oldSnapshot,id:bill.id,provider:bill.custom_provider_name??oldSnapshot.provider??bill.name,account:bill.account_number_masked??oldSnapshot.account??"",category:typeof raw.category==="string"?raw.category:"Other",currency:bill.currency,amount:bill.amount,start:bill.billing_period_start,end:bill.billing_period_end,hasOriginal:!!bill.original_document_id};
  const hash=adapted?.hash??"unsupported:"+bill.updated_at;
  let query=ctx.supabase.from(effectiveBillTable()).select(columns).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).eq("source",bill.source!).eq("currency",bill.currency);
  if(bill.source==="manual")query=query.eq("status","archived").eq("raw_data->>record_kind","historical").eq("raw_data->>amount_basis","period_charges").eq("raw_data->>category",baseline.category).ilike("custom_provider_name",literalPattern(baseline.provider)).ilike("account_number_masked",literalPattern(baseline.account));
  else query=query.eq("provider_id",bill.provider_id!);
  const [history,active]=await Promise.all([
    query.order("billing_period_end",{ascending:false}).order("id").limit(501),
    ctx.supabase.from(effectiveBillTable()).select("id").eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle(),
  ]);
  if(history.error||active.error)return {response:respond({error:"Could not load the evidence. Your saved action is unchanged; try again."},503)};
  const records=history.data.flatMap(row=>{const value=outcomeStatement(row);return value&&value.kind===kind&&sameOutcomeAccount(baseline,value.statement)?[value.statement]:[];});
  const coverageComplete=history.data.length<=500, baselineActive=Boolean(active.data);
  function payload(action: BillTarget | null, currentRevision=revision) {
    const evidence = records.find(b => b.id === action?.evidenceBillId) ?? null;
    let result = action ? evaluateBillTarget(action, baseline, hash, evidence, new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })) : null;
    if (result?.state === "awaiting_evidence" && action?.evidenceBillId && !evidence) result = {...result,title:"Selected statement is no longer available",detail:"Choose another saved statement from this account. No result is claimed from missing or excluded evidence."};
    const overlap=records.some(b=>overlaps(b,baseline)||evidence&&overlaps(b,evidence));
    if(result&&outcomeHasComparison(result.state)&&(!coverageComplete||overlap||!baselineActive))
      result={state:"inconclusive",title:!baselineActive?"Baseline is excluded from comparisons":overlap?"Check overlapping statements":"History coverage is incomplete",
        detail:!baselineActive?"This statement was set aside as another copy. Review the bill records before using it as a baseline.":overlap?"Another saved statement overlaps the baseline or evidence period. Review duplicates or revisions before interpreting the result.":"The available history exceeds this check’s coverage. No result is verified.",
        differenceCents:null,usageComparison:null};
    if(result&&action?.state!=="abandoned"&&!supported)result={state:"needs_review",title:"This bill no longer supports the saved check",detail:"Its service, currency or account details changed. Review the baseline statement, or stop tracking this action without claiming a result.",differenceCents:null,usageComparison:null};
    return {version:bill.updated_at+"|"+currentRevision,kind,baseline,baselineActive,evidence,candidateCount:records.filter(b=>b.id!==id).length,baselineChanged:Boolean(action&&action.baseline!==hash),target:action,result,candidates:records.filter(b=>b.id!==id).slice(0,100),coverageComplete};
  }
  return {ctx,bill,raw,saved:saved.data,revision,target,hash,kind,supported,baseline,baselineActive,records,payload};
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const state=await load(request,(await params).id);
  return "response" in state?state.response:respond(state.payload(state.target));
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id=(await params).id,state=await load(request,id);
  if("response" in state)return state.response;
  const parsed=schema.safeParse(await readBoundedJson(request,12000).catch(()=>null));
  if(!parsed.success)return respond({error:"Check the amount, effective date and action details."},400);
  const body=parsed.data,kind=body.kind??"agreed_amount";
  if(kind!==state.kind||kind==="agreed_amount"&&(!body.agreementConfirmed||moneyCents(body.expectedAmount)===null)||kind==="usage_change"&&body.expectedAmount!=="")return respond({error:"Use this account’s supported comparison. Telecom needs a confirmed price; energy tracks recorded usage."},400);
  if(body.version!==state.payload(state.target).version)return respond({error:"This statement or action changed. Reload before saving; keep your edits until you review the saved version."},409);
  const stopping=body.state==="abandoned"&&Boolean(state.target);
  if(!stopping&&!state.supported)return respond({error:"This bill no longer supports the saved check. Review the original bill details, or stop tracking."},409);
  if(!stopping&&(!historyDate(state.baseline.end)||body.effectiveDate<=state.baseline.end))return respond({error:"Use a baseline statement that ends before the change takes effect."},400);
  if(!stopping&&!state.baselineActive)return respond({error:"This baseline is excluded as another copy. Review its bill records before continuing."},409);
  if(body.evidenceBillId&&!(stopping&&body.evidenceBillId===state.target?.evidenceBillId)&&!state.records.some(b=>b.id===body.evidenceBillId&&b.id!==id))return respond({error:"Choose a later statement from this account."},400);
  if(state.target&&state.target.baseline!==state.hash&&!body.confirmBaseline&&!stopping)return respond({error:"Review the corrected baseline and confirm it before updating this action."},409);
  const target:BillTarget={kind,id:state.target?.id??randomUUID(),title:body.title,expectedAmount:body.expectedAmount,effectiveDate:body.effectiveDate,cost:body.cost,notes:body.notes,state:body.state,evidenceBillId:body.evidenceBillId,baseline:body.confirmBaseline||!state.target?state.hash:state.target.baseline,savedAt:new Date().toISOString(),snoozedUntil:body.snoozedUntil};
  if(target.state==="completed"&&!outcomeHasComparison(state.payload(target).result?.state))return respond({error:"Choose a comparable statement before finishing this check, or stop tracking without claiming a result."},409);
  const snapshot=state.saved?.baseline_snapshot??state.raw.bill_target_baseline_snapshot??state.baseline;
  const previous=body.confirmBaseline&&state.target?.baseline!==state.hash?{hash:state.target?.baseline,snapshot}:state.saved?.previous_baseline??state.raw.bill_target_previous_baseline??null;
  const result=await state.ctx.supabase.rpc("save_rezlee_bill_outcome",{p_bill_id:id,p_bill_version:state.bill.updated_at,p_revision:state.revision,p_target:target,p_baseline:!state.target||body.confirmBaseline?state.baseline:snapshot,p_previous:previous});
  if(result.error)return respond({error:["40001","PT409"].includes(result.error.code)?"This statement or action changed. Reload before saving again.":"Could not confirm the save. Your edits remain; check the saved action before retrying."},["40001","PT409"].includes(result.error.code)?409:503);
  return respond(state.payload(target,result.data as number));
}

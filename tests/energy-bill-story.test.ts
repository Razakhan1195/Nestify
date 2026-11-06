import assert from "node:assert/strict";
import test from "node:test";
import { buildEnergyBillStory, energyAccountKind } from "../apps/mobile/src/lib/energy-bill-story";
import { manualHistoryAccounts, type HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
import { evidenceDefaults } from "../apps/mobile/src/lib/statement-evidence";

export const energyFixture = (id: string, start: string, end: string, amount: number, usage = "300", fields = {}): HistoryBill => ({
 id, label: "Synthetic electricity statement", providerName: "Example Ontario Utility", providerId: null,
 category: "Electricity", categoryId: "electricity", accountNumber: "Synthetic example only",
 currency: "CAD", source: "manual", isHistoricalStatement: true, amount, billingPeriodStart: start, billingPeriodEnd: end,
 reviewedEvidence: { ...evidenceDefaults, usage, unit: "kWh", reading: "actual", ...fields },
});
const old = energyFixture("old", "2026-07-01", "2026-07-30", 120, "300");
const current = energyFixture("current", "2026-08-01", "2026-08-20", 100, "240");
const story = (rows: HistoryBill[], complete = true, today = "2026-09-01") => buildEnergyBillStory(manualHistoryAccounts(rows)[0], { today, complete });

test("one electricity bill has useful facts, exact days and one upload next step; balances never enter period charges", () => {
 const s = story([{...current, reviewedEvidence: {...current.reviewedEvidence!, previousBalance: "900", amountDue: "1000"}}]);
 assert.equal(s.minor, 10000); assert.equal(s.usage?.daily, 12); assert.equal(s.analysis.latest?.days,20);
 assert.equal(s.change,null); assert.equal(s.history.points.length,1); assert.equal(s.next.action,"add");
 assert.equal(s.fields?.amountDue,"1000");
});
test("two unequal periods distinguish lower bill total from higher daily charges and usage", () => {
 const s=story([current,old]);
 assert.equal(s.change?.changeMinor,-2000); assert.equal(s.chargeDailyPercent,25);
 assert.equal(s.change?.usage?.previous.daily,10);assert.equal(s.change?.usage?.latest.daily,12);
 assert.equal(s.change?.gapDays,1);assert.equal(s.next.action,null);
});
test("reconciled tax and credit differences explain the saved total, not a tariff or appliance",()=>{
 const a={...current,reviewedEvidence:{...current.reviewedEvidence!,subtotal:"95",tax:"10",credits:"5"}};
 const b={...old,reviewedEvidence:{...old.reviewedEvidence!,subtotal:"115",tax:"15",credits:"10"}};
 const s=story([a,b]);assert.equal(s.breakdownDifference,0);
 const c=s.change!.chargeBreakdown!;
 assert.equal(c.subtotalChange+c.taxChange+c.creditEffect,s.change?.changeMinor);
 assert.deepEqual(c,{subtotalChange:-2000,taxChange:-500,creditEffect:500});
});
test("incorrect saved breakdown suggests correcting evidence rather than alleging overbilling",()=>{
 const s=story([{...current,reviewedEvidence:{...current.reviewedEvidence!,subtotal:"100",tax:"10",credits:"0"}}]);
 assert.equal(s.breakdownDifference,-1000);assert.equal(s.next.action,"details");assert.match(s.next.title,/saved breakdown/);
});
test("missing details never fall back to unreviewed imported usage",()=>{
 for(const reviewedEvidence of [null,undefined]){
  const s=story([{...current,reviewedEvidence,usageAmount:999,usageUnit:"kWh"},old]);
  assert.equal(s.usage,null);assert.equal(s.history.points.at(-1)?.usage,null);assert.equal(s.change?.usage,null);
  assert.equal(s.next.action,"details");assert.match(s.next.detail,/total usage/);
 }
});
test("estimated and mixed readings remain visible as facts but out of consumption comparisons",()=>{
 for(const reading of ["estimated","mixed"]){
  const s=story([{...current,reviewedEvidence:{...current.reviewedEvidence!,reading}},old]);
  assert.equal(s.usage?.amount,240);assert.equal(s.usage.actual,false);assert.equal(s.change?.usage,null);
  assert.equal(s.history.missingUsage,1);assert.equal(s.next.action,"statement");
 }
});
test("unknown reading type asks for that evidence once history exists",()=>{
 const s=story([{...current,reviewedEvidence:{...current.reviewedEvidence!,reading:"unknown"}},old]);
 assert.equal(s.next.action,"details");assert.equal(s.next.billId,current.id);assert.equal(s.change?.usage,null);
});
test("gas GJ and cubic metres are never pooled or converted with an invented factor",()=>{
 const gas=(b:HistoryBill,unit:string)=>({...b,category:"Gas",categoryId:"gas",reviewedEvidence:{...b.reviewedEvidence!,unit}});
 const s=story([gas(current,"m³"),gas(old,"GJ")]);
 assert.equal(s.kind,"gas");assert.equal(s.history.unit,"m³");assert.equal(s.history.missingUsage,1);
 assert.equal(s.change?.usage,null);assert.equal(s.next.billId,old.id);
});
test("incompatible category units cannot become electricity consumption evidence",()=>{
 const s=story([{...current,reviewedEvidence:{...current.reviewedEvidence!,unit:"m³"}},{...old,reviewedEvidence:{...old.reviewedEvidence!,unit:"m³"}}]);
 assert.equal(s.usage,null);assert.equal(s.history.missingUsage,2);assert.equal(s.change?.usage,null);
});
test("partial or failed history keeps saved facts but withholds conclusions",()=>{
 const s=story([current,old],false);
 assert.equal(s.minor,10000);assert.equal(s.history.points.length,2);assert.equal(s.change,null);
 assert.equal(s.next.action,null);assert.match(s.next.title,/saved information/);
});
test("duplicates and overlapping revisions cannot distort charts or comparisons, even beyond 12 periods",()=>{
 const rows=Array.from({length:14},(_,i)=>{const month=i%12+1,year=2025+Math.floor(i/12);const start=year+"-"+String(month).padStart(2,"0")+"-01",end=year+"-"+String(month).padStart(2,"0")+"-20";return energyFixture(String(i),start,end,100);});
 const a=story(rows,true,"2026-03-01");assert.equal(a.history.points.length,12);assert.equal(a.history.older,2);
 const replay=story([...rows,rows[0]],true,"2026-03-01");assert.equal(replay.history.older,2);
 const overlap={...rows[0],id:"revision",billingPeriodStart:"2025-01-01",billingPeriodEnd:"2026-02-02"};
 const b=story([...rows,overlap],true,"2026-03-01");assert.equal(b.history.points.length,0);assert.equal(b.change,null);assert.equal(b.next.action,"statement");
});
test("missing periods are explicit gaps, not zero consumption or continuous months",()=>{
 const s=story([current,energyFixture("early","2026-05-01","2026-05-31",90)]);
 assert.equal(s.history.points.length,2);assert.equal(s.history.gapDays,61);assert.equal(s.change?.gapDays,61);
});
test("future periods, net credits and invalid amounts are retained as bills but not ordinary chart values",()=>{
 for(const edits of [{billingPeriodEnd:"2026-09-30"},{amount:-50},{amount:100.001},{billingPeriodEnd:"2026-02-30"}]){
  const s=story([{...current,...edits},old]);assert.equal(s.history.points.length,1);assert.equal(s.change,null);
 }
});
test("true zero usage and zero charge are facts, never infinite percentages",()=>{
 const s=story([{...current,amount:0,reviewedEvidence:{...current.reviewedEvidence!,usage:"0"}},old]);
 assert.equal(s.minor,0);assert.equal(s.usage?.amount,0);assert.equal(s.history.points.at(-1)?.usage?.daily,0);
 assert.equal(s.change?.usage?.dailyPercent,-100);assert.equal(s.chargeDailyPercent,-100);
 const zeroBase=story([current,{...old,amount:0}]);assert.equal(zeroBase.chargeDailyPercent,null);
});
test("corrected evidence recalculates and stale evidence removal invalidates usage only",()=>{
 const before=story([current,old]), corrected=story([{...current,reviewedEvidence:{...current.reviewedEvidence!,usage:"400"}},old]);
 assert.equal(before.usage?.daily,12);assert.equal(corrected.usage?.daily,20);assert.equal(corrected.minor,before.minor);
 const stale=story([{...current,reviewedEvidence:null},old]);assert.equal(stale.change?.usage,null);assert.equal(stale.change?.changeMinor,-2000);
});
test("old data asks for a newer bill without promising automatic monitoring",()=>{
 const s=story([current,old],true,"2027-01-01");assert.equal(s.next.action,"add");assert.match(s.next.label!,/newer/);
});
test("different homes/accounts/providers and currencies remain separate before analysis",()=>{
 const accounts=manualHistoryAccounts([current,old,{...current,id:"cottage",accountNumber:"Cottage"},{...current,id:"provider",providerName:"Other utility"},{...current,id:"currency",currency:"USD"}]);
 assert.equal(accounts.length,4);
 for(const a of accounts){assert.equal(new Set(a.bills.map(b=>b.accountNumber)).size,1);assert.equal(new Set(a.bills.map(b=>b.currency)).size,1);}
 assert.equal(energyAccountKind({...accounts[0],bills:[{...current,categoryId:"internet_phone"}]}),null);
});
test("calendar-day normalization respects leap days and daylight-saving dates",()=>{
 for(const [start,end,days] of [["2024-02-01","2024-02-29",29],["2026-03-01","2026-03-31",31]] as const){
  const s=story([energyFixture("calendar",start,end,days,String(days))],true,"2026-09-01");
  assert.equal(s.analysis.latest?.days,days);assert.equal(s.usage?.daily,1);
 }
});

test("recovery opens the problematic older statement instead of an unrelated latest bill",()=>{
 const duplicate={...old,id:"old-revision"};
 const s=story([current,old,duplicate]);
 assert.equal(s.next.action,"statement");assert.ok([old.id,duplicate.id].includes(s.next.billId!));
 const credit=story([current,{...old,amount:-10}]);assert.equal(credit.next.billId,old.id);
});

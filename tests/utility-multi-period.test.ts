import test from "node:test";
import assert from "node:assert/strict";
import { buildMultiPeriodComparison, supportedPeriod, type SavedStatement } from "../src/lib/utility/multi-period";
import { compareOntarioPlans, type UsageReading } from "../src/lib/utility/ontario-rpp";
function period(start:string,end:string,id:string) {
 const readings:UsageReading[]=[];
 for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000) for(let h=0;h<24;h++) readings.push({intervalStartLocal:new Date(t).toISOString().slice(0,10)+" "+String(h).padStart(2,"0")+":00:00",intervalMinutes:60,valueKwh:1});
 const cost=compareOntarioPlans(readings,undefined,{start,end}).tou.cost;
 const bill:SavedStatement={id,billing_period_start:start,billing_period_end:end,raw_data:{ezgb_export:{charge_totals:{"Off-Peak":cost,"On-Peak":0}}}};
 return {bill,readings};
}
test("aggregate replays each fixed plan, without summing monthly winners",()=>{
 const periods=[period("2026-06-01","2026-06-30","a"),period("2026-07-01","2026-07-31","b"),period("2026-08-01","2026-08-31","c")];
 const result=buildMultiPeriodComparison(periods.map(p=>p.bill),periods.flatMap(p=>p.readings));
 assert.equal(result.days,92);assert.equal(result.confidence,"historical_comparison");
 for(const plan of result.plans) assert.ok(Math.abs(plan.cost-result.included.reduce((sum,p)=>sum+p.costs[plan.plan],0))<0.000001);
 assert.equal(result.savings,Math.max(0,result.baseline!-result.plans[0].cost));
});
test("missing readings and overlapping statements are excluded, not counted twice",()=>{
 const p=period("2026-06-01","2026-06-30","a");
 const overlap={...p.bill,id:"b"};
 const result=buildMultiPeriodComparison([p.bill,overlap],p.readings);
 assert.equal(result.included.length,1);assert.equal(result.excluded.length,1);assert.equal(result.savings,null);
 assert.equal(buildMultiPeriodComparison([p.bill],p.readings.slice(1)).included.length,0);
});
test("unknown plans and unreconciled bills withhold savings",()=>{
 const p=period("2026-06-01","2026-06-30","a");
 assert.equal(buildMultiPeriodComparison([{...p.bill,raw_data:{}}],p.readings).baseline,null);
 const bad={...p.bill,raw_data:{ezgb_export:{charge_totals:{"Off-Peak":999,"On-Peak":0}}}};
 assert.equal(buildMultiPeriodComparison([bad],p.readings).baseline,null);
});
test("gaps and unsupported future rates do not become confident recommendations",()=>{
 const a=period("2026-06-01","2026-06-30","a"),b=period("2026-08-01","2026-08-31","b");
 const result=buildMultiPeriodComparison([a.bill,b.bill],[...a.readings,...b.readings]);
 assert.equal(result.gapDays,31);assert.equal(result.savings,null);
 assert.equal(supportedPeriod({...a.bill,billing_period_end:"2026-11-01"}),false);
 assert.equal(supportedPeriod({...a.bill,billing_period_start:"2026-02-30"}),false);
});

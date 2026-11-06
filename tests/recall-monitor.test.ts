import test from "node:test";
import assert from "node:assert/strict";
import { unreviewedMatches, pendingIsCurrent, pushOutcome } from "../src/lib/recalls/monitor-policy";
import { recallKey, type Recall } from "../src/lib/recalls/matching";
const recall:Recall={id:"42",title:"Acme washer recalled",product:"Acme washer AB1234",url:"https://recalls-rappels.canada.ca/en/x",issue:"Fire",action:"Stop use",updated:"2026-09-21"};
const item={id:"i",name:"Washer",brand:"Acme",model_number:"AB1234"};
test("reviewed recall versions stay quiet; updated notices resurface",()=>{
 const reviews=[{attention_key:recallKey(item.id,recall),resolution_status:"handled"}];
 assert.equal(unreviewedMatches([item],[recall],reviews).length,0);
 assert.equal(unreviewedMatches([item],[{...recall,updated:"2026-09-22"}],reviews).length,1);
 assert.equal(unreviewedMatches([{...item,brand:"Other"}],[recall],[]).length,0);
});
test("removed matches and week-old queued alerts cannot be delivered",()=>{
 const now=Date.parse("2026-09-23");
 assert.equal(pendingIsCurrent("2026-09-22","k",new Set(["k"]),now),true);
 assert.equal(pendingIsCurrent("2026-09-22","k",new Set(),now),false);
 assert.equal(pendingIsCurrent("2026-09-01","k",new Set(["k"]),now),false);
});
test("push acceptance is not delivery; ambiguous responses are not retryable sends",()=>{
 assert.deepEqual(pushOutcome({data:{status:"ok",id:"ticket"}}),{status:"accepted",ticket:"ticket",unregistered:false});
 assert.equal(pushOutcome({data:{status:"error",details:{error:"DeviceNotRegistered"}}}).unregistered,true);
 assert.equal(pushOutcome({}).status,"uncertain");
});

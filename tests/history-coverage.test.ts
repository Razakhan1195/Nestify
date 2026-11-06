
import test from "node:test";
import assert from "node:assert/strict";
import { publicHistoryCoverage } from "../src/lib/deck/history-coverage";
const range={since_date:"2026-04-20",until_date:"2026-10-20"};
const row={...range,account_id:"private-account",status:"partial",listed_bill_count:2,missing_bill_dates:["2026-09-15"]};
test("six-month quarterly Durham case reports two listed and the actual missing date",()=>{
 const result=publicHistoryCoverage([row],range);
 assert.deepEqual(result,{listedStatements:2,missingBillDates:["2026-09-15"]});
 assert.equal(JSON.stringify(result).includes("private-account"),false);
});
test("unknown coverage never becomes six expected monthly statements",()=>{
 assert.deepEqual(publicHistoryCoverage([],range),{listedStatements:null,missingBillDates:[]});
 assert.equal(publicHistoryCoverage([{...row,listed_bill_count:null}],range).listedStatements,null);
 assert.equal(publicHistoryCoverage([{...row,since_date:"2026-07-20"}],range).listedStatements,null);
});
test("duplicate account observations use the latest evidence and invalid or out-of-range dates are excluded",()=>{
 assert.deepEqual(publicHistoryCoverage([row,{...row,status:"complete",missing_bill_dates:[]}],range),{listedStatements:2,missingBillDates:[]});
 const result=publicHistoryCoverage([{...row,missing_bill_dates:["2026-09-15","2026-09-15","2026-02-30","2026-11-01","bad"]},{...row,account_id:"second",listed_bill_count:3}],range);
 assert.equal(result.listedStatements,5);assert.deepEqual(result.missingBillDates,["2026-09-15"]);
});

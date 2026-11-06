import test from "node:test";
import assert from "node:assert/strict";
import {safeJob} from "../src/lib/ops/policy";
import {attentionFilter} from "../src/lib/ops/attention";
test("cancelled checks are retained for support but never presented as actionable failures",()=>{
 const row={id:"11111111-1111-4111-8111-111111111111",status:"waiting",cancelled_at:"2026-10-18T12:00:00Z",created_at:"2026-10-18T11:00:00Z"};
 assert.equal(safeJob("ezgb",row).state,"cancelled");assert.equal(safeJob("ezgb",row).attention,false);
 assert.match(attentionFilter("ezgb",Date.now()),/^and\(stats->>cancelledAt.is.null,or\(/);
 assert.equal(safeJob("ezgb",{...row,cancelled_at:null}).attention,true);
});

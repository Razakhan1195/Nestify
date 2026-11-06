import test from "node:test";
import assert from "node:assert/strict";
import { attentionFilter, operationsPage } from "../src/lib/ops/attention";
import { safeJob } from "../src/lib/ops/policy";
test("operations pagination rejects malformed and unbounded offsets", () => {
  for (const value of [null,"-1","1.1","abc","1 or true","100001"]) assert.equal(operationsPage(value),0);
  assert.equal(operationsPage("99999"),10000);
  assert.equal(operationsPage("2"),2);
});
test("archive attention query filters before paging and includes expired work", () => {
  const now=Date.parse("2026-09-30T12:00:00Z");
  assert.match(attentionFilter("ezgb",now),/expires_at.lt.2026-09-30T12:00:00.000Z/);
  assert.match(attentionFilter("ezgb",now),/expires_at.is.null,created_at.lt.2026-09-30T11:40:00.000Z/);
  assert.match(attentionFilter("statements",now),/created_at.lt.2026-09-30T11:58:00.000Z/);
  assert.doesNotMatch(attentionFilter("deck",now),/expires_at/);
  for (const queue of ["ezgb","deck","statements","deletions","ai"] as const) {
    assert.match(attentionFilter(queue,now),/status.is.null,status.not.in/);
    for(const status of ["blocked","aborted","failed","needs_attention","unexpected"]) assert.equal(safeJob(queue,{status}).attention,true);
  }
});


test("Gmail attention excludes intentional pauses and completed searches before pagination",()=>{
 const q=attentionFilter("gmail",Date.parse("2026-10-02T05:00:00Z"));
 assert.match(q,/and\(status.eq.paused,error_code.not.is.null\)/);
 assert.match(q,/work->>phase.neq.complete/);assert.match(q,/updated_at.lt.2026-10-02T04:55:00.000Z/);
 assert.match(q,/lease_until.lte/);assert.ok(!q.includes("token_cipher"));
});

test("deletion expiry waits do not alarm operators, while failed and overdue retries remain visible",()=>{
 const now=Date.parse("2026-10-12T04:00:00Z");
 const base={status:"retry",created_at:"2026-10-12T03:00:00Z",next_attempt_at:"2026-10-12T04:30:00Z",error_code:null,attempts:0};
 const wait=safeJob("deletions",base,now);
 assert.equal(wait.state,"scheduled_wait");assert.equal(wait.attention,false);assert.match(wait.nextStep,/no manual restart/);
 for(const row of [{...base,error_code:"provider_unavailable"},{...base,next_attempt_at:"2026-10-12T03:59:59Z"},{...base,next_attempt_at:null},{...base,next_attempt_at:"bad"}])assert.equal(safeJob("deletions",row,now).attention,true);
 assert.equal(safeJob("deck",base,now).attention,true);
 assert.match(attentionFilter("deletions",now),/error_code.not.is.null,next_attempt_at.is.null,next_attempt_at.lte.2026-10-12T04:00:00.000Z/);
 assert.ok(!JSON.stringify(wait).includes("next_attempt_at"));
});

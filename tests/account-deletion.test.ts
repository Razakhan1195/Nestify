import test from "node:test";
import assert from "node:assert/strict";
import { deletionStep, type DeletionDependencies } from "../src/lib/account/deletion-engine";
import { DeletionProblem, deletionAuthenticationAllowed, deletionFailure, publicDeletion, receiptHash, receiptMatches, recentPasswordAuthentication, type DeletionJob } from "../src/lib/account/deletion-policy";

const userId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const job: DeletionJob = { id: "request", user_id: userId, receipt_hash: receiptHash("a".repeat(64)), status: "queued", phase: "connections", attempts: 0, next_attempt_at: "", completed_at: null };
  let resource = true, file = true, leased = false;
  const calls: string[] = [];
  const deps: DeletionDependencies = {
    claim: async () => { if (leased || job.status === "completed") return null; leased = true; job.attempts++; return { ...job }; },
    revokeEmail: async () => true,
    revokeBilling: async () => true,
    revokeApple: async () => true,
    nextResource: async () => resource ? { id: "provider", kind: "ezgb", external_id: "grant", provider_id: null } : null,
    revoke: async () => { calls.push("revoke"); return true; },
    resourceDone: async () => { resource = false; },
    files: async () => file ? [{ name: `${userId}/home/file.pdf` }] : [],
    removeFiles: async () => { calls.push("storage"); file = false; },
    removeMembershipsAndEvents: async () => { calls.push("membership"); },
    deleteIdentity: async () => { calls.push("auth"); },
    finish: async (_id, patch) => { Object.assign(job, patch); leased = false; },
    now: () => 1000,
  };
  return { job, deps, calls, clearLease: () => { leased = false; } };
}
test("deletion revokes before Storage and Auth; repeat completion cannot delete twice", async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) await deletionStep("request", f.deps);
  assert.deepEqual(f.calls, ["revoke", "storage", "membership", "auth"]);
  assert.equal(f.job.user_id, null); assert.equal(f.job.status, "completed");
});
test("provider failure retains documents/account and persists a bounded retry", async () => {
  const f = fixture(); f.deps.revoke = async () => { throw new DeletionProblem("provider_unavailable"); };
  for (let i = 0; i < 5; i++) await deletionStep("request", f.deps);
  assert.equal(f.job.status, "needs_attention"); assert.equal(f.job.user_id, userId); assert.deepEqual(f.calls, []);
});
test("ambiguous authorization requires review, never silently deletes account", async () => {
  const f = fixture(); f.deps.revoke = async () => { throw new DeletionProblem("provider_review", false); };
  await deletionStep("request", f.deps); assert.equal(f.job.status, "needs_attention"); assert.deepEqual(f.calls, []);
});
test("partial provider cleanup keeps connection phase until all resources are gone", async () => {
  const f = fixture(); f.deps.revoke = async () => false;
  await deletionStep("request", f.deps); assert.equal(f.job.phase, "connections"); assert.deepEqual(f.calls, []);
});
test("Storage failure keeps Auth and can resume after an app/worker restart", async () => {
  const f = fixture(); f.job.phase = "files";
  const working = f.deps.removeFiles;
  f.deps.removeFiles = async () => { throw new DeletionProblem("storage_unavailable"); };
  await deletionStep("request", f.deps); assert.equal(f.job.phase, "files"); assert.equal(f.job.status, "retry"); assert.deepEqual(f.calls, []);
  f.deps.removeFiles = working;
  for (let i = 0; i < 3; i++) await deletionStep("request", f.deps);
  assert.deepEqual(f.calls, ["storage", "membership", "auth"]);
});
test("a returned path belonging to another account is never passed to Storage", async () => {
  const f = fixture(); f.job.phase = "files"; f.deps.files = async () => [{ name: "other-user/home/private.pdf" }];
  await deletionStep("request", f.deps); assert.equal(f.job.status, "needs_attention"); assert.deepEqual(f.calls, []);
});
test("account phase rechecks late files and returns to cleanup before deleting Auth", async () => {
  const f = fixture(); f.job.phase = "account";
  await deletionStep("request", f.deps); assert.equal(f.job.phase, "files"); assert.deepEqual(f.calls, []);
});
test("failure to persist a successful revocation leaves lease; retry repeats only idempotent cleanup", async () => {
  const f = fixture(), finish = f.deps.finish;
  f.deps.finish = async () => { throw new Error("database offline"); };
  await assert.rejects(deletionStep("request", f.deps));
  assert.equal(await deletionStep("request", f.deps), false);
  f.clearLease(); f.deps.finish = finish;
  await deletionStep("request", f.deps); assert.equal(f.job.phase, "files"); assert.deepEqual(f.calls, ["revoke"]);
});
test("error persistence never contains upstream secrets or raw messages", () => {
  const result = deletionFailure(new Error("secret credential and account data"), 1, 0);
  assert.equal(result.error_code, "account_unavailable"); assert.ok(!JSON.stringify(result).includes("secret"));
  assert.equal(deletionFailure(new DeletionProblem("provider_unavailable"), 5).status, "needs_attention");
});
test("receipt authorization and response disclose only coarse deletion status", () => {
  const token = "c".repeat(64), f = fixture();
  assert.ok(receiptMatches(token, receiptHash(token)));
  assert.equal(receiptMatches("b".repeat(64), receiptHash(token)), false);
  assert.equal(receiptMatches("c", receiptHash(token)), false);
  assert.deepEqual(Object.keys(publicDeletion(f.job)).sort(), ["completedAt", "phase", "requestId", "status"]);
});
test("deletion requires recent password AMR, not a newly refreshed JWT iat", () => {
  const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  const now = 1000000;
  assert.equal(recentPasswordAuthentication(token({ amr: [{ method: "password", timestamp: 999 }] }), now), true);
  for (const claims of [{ iat: 1000 }, { amr: [{ method: "password", timestamp: 500 }] }, { amr: [{ method: "recovery", timestamp: 999 }] }, { amr: [{ method: "password", timestamp: 2000 }] }]) assert.equal(recentPasswordAuthentication(token(claims), now), false);
});

test("OTP deletion requires enabled capability, exact account and fresh verified AMR", () => {
 const now=1000000;
 const token=(sub:string,method:string,timestamp:number)=>`header.${Buffer.from(JSON.stringify({sub,iat:1000,amr:[{method,timestamp}]})).toString("base64url")}.signature`;
 const valid=token(userId,"otp",999);
 assert.equal(deletionAuthenticationAllowed(valid,userId,userId,true,now),true);
 assert.equal(deletionAuthenticationAllowed(valid,userId,userId,false,now),false);
 assert.equal(deletionAuthenticationAllowed(valid,userId,undefined,true,now),false);
 assert.equal(deletionAuthenticationAllowed(valid,userId,"other",true,now),false);
 assert.equal(deletionAuthenticationAllowed(token("other","otp",999),userId,userId,true,now),false);
 for(const method of ["oauth","token_refresh","recovery","magiclink"]) assert.equal(deletionAuthenticationAllowed(token(userId,method,999),userId,userId,true,now),false);
 for(const timestamp of [500,2000]) assert.equal(deletionAuthenticationAllowed(token(userId,"otp",timestamp),userId,userId,true,now),false);
 assert.equal(deletionAuthenticationAllowed("malformed",userId,userId,true,now),false);
});
test("old password clients remain supported but cannot select another account",()=>{
 const jwt=`header.${Buffer.from(JSON.stringify({sub:userId,amr:[{method:"password",timestamp:999}]})).toString("base64url")}.signature`;
 assert.equal(deletionAuthenticationAllowed(jwt,userId,undefined,false,1000000),true);
 assert.equal(deletionAuthenticationAllowed(jwt,userId,"other",false,1000000),false);
});


test("Gmail failure prevents file and identity deletion even for resumed account-phase jobs",async()=>{
 const f=fixture();f.job.phase="account";f.deps.revokeEmail=async()=>{throw new DeletionProblem("provider_unavailable");};
 await deletionStep("request",f.deps);assert.equal(f.job.status,"retry");assert.deepEqual(f.calls,[]);
 f.deps.revokeEmail=async()=>false;await deletionStep("request",f.deps);
 assert.equal(f.job.phase,"connections");assert.deepEqual(f.calls,[]);
});

test("Apple grants are drained before files and identity, including resumed account-phase jobs",async()=>{
 const f=fixture();f.job.phase="account";f.deps.revokeApple=async()=>false;
 await deletionStep("request",f.deps);assert.equal(f.job.phase,"connections");assert.deepEqual(f.calls,[]);
 f.deps.revokeApple=async()=>{throw new DeletionProblem("provider_unavailable");};
 await deletionStep("request",f.deps);assert.equal(f.job.status,"retry");assert.deepEqual(f.calls,[]);
 f.deps.revokeApple=async()=>true;
 for(let i=0;i<8;i++)await deletionStep("request",f.deps);
 assert.equal(f.job.status,"completed");assert.deepEqual(f.calls,["revoke","storage","membership","auth"]);
});

test("billing erasure failure prevents deletion even after the connections phase",async()=>{
 const f=fixture();f.job.phase="account";f.deps.revokeBilling=async()=>{throw new DeletionProblem("provider_unavailable")};
 await deletionStep("request",f.deps);assert.equal(f.job.status,"retry");assert.deepEqual(f.calls,[]);
});

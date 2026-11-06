import test from "node:test";
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
import {mobileReadBudgetFetch} from "../src/lib/supabase/mobile-read-budget";

const pending: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
  const signal = init?.signal;
  if (signal?.aborted) return reject(signal.reason);
  signal?.addEventListener("abort", () => reject(signal.reason), {once: true});
});

test("read deadline is shared across downstream calls and prevents subsequent work", async () => {
  let calls = 0;
  const upstream: typeof fetch = async (input, init) => {
    calls++;
    if (calls === 1) return new Response("{}");
    return pending(input, init);
  };
  const read = mobileReadBudgetFetch(new Request("https://app.invalid/read"), upstream, 30);
  await read("https://db.invalid/first");
  // Keep a referenced timer so AbortSignal.timeout also fires in Node test runs.
  const keepAlive = delay(70);
  await assert.rejects(read("https://db.invalid/second"), {name: "TimeoutError"});
  await assert.rejects(read("https://db.invalid/third"), {name: "TimeoutError"});
  assert.equal(calls, 2);
  await keepAlive;
});

test("inbound cancellation stops an in-flight read", async () => {
  const controller = new AbortController();
  const read = mobileReadBudgetFetch(new Request("https://app.invalid/read", {signal: controller.signal}), pending);
  const result = read("https://db.invalid/read");
  controller.abort();
  await assert.rejects(result, {name: "AbortError"});
});

test("downstream cancellation remains effective", async () => {
  const controller = new AbortController();
  const read = mobileReadBudgetFetch(new Request("https://app.invalid/read"), pending);
  const result = read("https://db.invalid/read", {signal: controller.signal});
  controller.abort();
  await assert.rejects(result, {name: "AbortError"});
});

test("write fetch is unchanged, including accepted-write recovery semantics", () => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.equal(mobileReadBudgetFetch(new Request("https://app.invalid/write", {method}), pending), pending);
  }
});


test("one gateway retry recovers an allowlisted read RPC and preserves its body", async () => {
  const bodies: unknown[]=[];
  const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async (_input,init)=>{
    bodies.push(init?.body);return new Response(bodies.length===1?"gateway":"{\"ok\":true}",{status:bodies.length===1?502:200});
  });
  const response=await read("https://db.invalid/rest/v1/rpc/rezlee_mobile_screen_bootstrap",{method:"POST",body:'{"p_screen":"care"}'});
  assert.equal(response.status,200);assert.deepEqual(bodies,['{"p_screen":"care"}','{"p_screen":"care"}']);
});

test("a read retry never repeats a mutation, unknown RPC, pool exhaustion, auth failure or SQL error", async () => {
  for(const [method,path,status] of [
    ["POST","rezlee_mutate_shared_expense",502],["PATCH","homes",502],
    ["POST","unknown_rpc",504],["GET","homes",503],["GET","homes",401],
    ["GET","homes",429],["GET","homes",500],
  ] as const){
    let calls=0;const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{calls++;return new Response(null,{status});});
    assert.equal((await read("https://db.invalid/rest/v1/rpc/"+path,{method,...(method==="GET"?{}:{body:"{}"})})).status,status);
    assert.equal(calls,1);
  }
});

test("a screen has only one retry allowance across parallel dependencies", async () => {
  let calls=0;const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{calls++;return new Response(null,{status:502});});
  const responses=await Promise.all([read("https://db.invalid/a"),read("https://db.invalid/b")]);
  assert.equal(calls,3);assert.ok(responses.every(r=>r.status===502));
});

test("transient network failure recovers once without changing the total budget", async () => {
  let calls=0;const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{if(++calls===1)throw new TypeError("fetch failed");return new Response("{}");});
  assert.equal((await read("https://db.invalid/read")).status,200);assert.equal(calls,2);
});

test("deadline expiry during retry backoff prevents the second attempt", async () => {
  let calls=0;const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{calls++;return new Response(null,{status:502});},30);
  await assert.rejects(read("https://db.invalid/read"),{name:"TimeoutError"});assert.equal(calls,1);
});

test("request-body streams and non-network TypeErrors are never replayed", async () => {
  let calls=0;const read=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{calls++;return new Response(null,{status:502});});
  await read(new Request("https://db.invalid/rest/v1/rpc/rezlee_mobile_screen_bootstrap",{method:"POST",body:"{}"}));assert.equal(calls,1);
  const broken=mobileReadBudgetFetch(new Request("https://app.invalid/read"),async()=>{throw new TypeError("Invalid input");});
  await assert.rejects(broken("https://db.invalid/read"),/Invalid input/);
});

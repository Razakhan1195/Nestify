import test from "node:test";
import assert from "node:assert/strict";
import { createReadCoalescer } from "../apps/mobile/src/lib/inflight-reads";
test("Home and Bills share an in-flight read without retaining finished results", async () => {
  const reads = createReadCoalescer(); let resolve!: (v: number) => void; let calls = 0;
  const load = () => { calls++; return new Promise<number>(r => { resolve = r; }); };
  const home = reads.run("account-a:bills", load), bills = reads.run("account-a:bills", load);
  await Promise.resolve(); assert.equal(calls, 1); resolve(4);
  assert.deepEqual(await Promise.all([home, bills]), [4, 4]);
  const next = reads.run("account-a:bills", async () => { calls++; return 5; });
  assert.equal(await next, 5); assert.equal(calls, 2);
});
test("different account sessions never share private reads", async () => {
  const reads = createReadCoalescer();
  assert.deepEqual(await Promise.all([reads.run("a:vault", async () => "A"), reads.run("b:vault", async () => "B")]), ["A", "B"]);
});
test("failed reads can retry and writes invalidate pending reads", async () => {
  const reads = createReadCoalescer();
  await assert.rejects(reads.run("a:home", async () => { throw Error("offline"); }));
  assert.equal(await reads.run("a:home", async () => "retry"), "retry");
  let resolve!: (v: string) => void;
  const old = reads.run("a:care", () => new Promise<string>(r => { resolve = r; }));
  await Promise.resolve(); reads.invalidate();
  const current = reads.run("a:care", async () => "saved");
  resolve("before save");
  assert.equal(await current, "saved"); assert.equal(await old, "before save");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { observeConnectionTiming, type ConnectionTiming } from "../src/lib/supabase/connection-diagnostics";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

test("real fetch observation separates request transmission from response waiting without retaining private values", async () => {
  const received = deferred<ServerResponse>();
  const server = createServer((_request, response) => received.resolve(response));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port, timing: ConnectionTiming = { attempts: [] };
  try {
    const pending = observeConnectionTiming(origin, timing, () => fetch(origin + "/PRIVATE_ACCOUNT?q=PRIVATE_QUERY", {
      method: "POST", headers: { authorization: "Bearer PRIVATE_TOKEN" }, body: "PRIVATE_BODY", signal: AbortSignal.timeout(3000),
    }));
    const response = await received.promise;
    assert.equal(timing.attempts.length, 1);
    assert.equal(typeof timing.attempts[0].sentMs, "number");
    assert.equal(timing.attempts[0].receivedMs, undefined);
    response.end("PRIVATE_RESULT");
    assert.equal(await (await pending).text(), "PRIVATE_RESULT");
    assert.ok(timing.attempts[0].receivedMs! >= timing.attempts[0].sentMs!);
    assert.doesNotMatch(JSON.stringify(timing), /PRIVATE|127\.0\.0\.1|authorization|http:/);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("concurrent response timing remains scoped to the correct request", async () => {
  const one = deferred<ServerResponse>(), two = deferred<ServerResponse>();
  const server = createServer((request, response) => (request.url === "/one" ? one : two).resolve(response));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  const first: ConnectionTiming = { attempts: [] }, second: ConnectionTiming = { attempts: [] };
  try {
    const a = observeConnectionTiming(origin, first, () => fetch(origin + "/one", { signal: AbortSignal.timeout(3000) }));
    const b = observeConnectionTiming(origin, second, () => fetch(origin + "/two", { signal: AbortSignal.timeout(3000) }));
    const [ra, rb] = await Promise.all([one.promise, two.promise]);
    assert.equal(first.attempts.length, 1); assert.equal(second.attempts.length, 1);
    ra.end("one"); assert.equal(await (await a).text(), "one");
    assert.equal(typeof first.attempts[0].receivedMs, "number");
    assert.equal(second.attempts[0].receivedMs, undefined);
    rb.end("two"); assert.equal(await (await b).text(), "two");
    assert.equal(typeof second.attempts[0].receivedMs, "number");
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("an unobserved transport stays explicitly unobserved and preserves failures", async () => {
  const timing: ConnectionTiming = { attempts: [] }, original = Error("PRIVATE_FAILURE");
  await assert.rejects(observeConnectionTiming("https://staging.invalid", timing, async () => { throw original; }), error => error === original);
  assert.deepEqual(timing, { attempts: [] });
});

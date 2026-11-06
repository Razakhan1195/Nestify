import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
test("monitor sends incident and recovery over real HTTP and retries a rejected delivery without leaking health details", async () => {
  const { checkRelease } = await import("../scripts/monitor-release.mjs");
  let healthy = false, reject = false;
  const received: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.url === "/health") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ healthy, signals: [{ state: healthy ? "ok" : "blocked", privateDetail: "DO-NOT-FORWARD" }] })); return; }
    let body = ""; for await (const chunk of req) body += chunk;
    received.push(body); res.statusCode = reject ? 503 : 200; res.end("received");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const local = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    const config = { url: "https://fixture.invalid/api/ops/health", token: "a".repeat(32), webhook: "https://fixture.invalid/alerts", fetchImpl: (url: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => fetch(local + (String(url).endsWith("health") ? "/health" : "/alerts"), options) };
    let state = await checkRelease(config); state = await checkRelease({ ...config, previous: state });
    assert.equal(received.length, 0);
    reject = true; await assert.rejects(checkRelease({ ...config, previous: state }), /did not accept/);
    assert.equal(state.failures, 2); reject = false;
    state = await checkRelease({ ...config, previous: state }); assert.equal(state.incident, true);
    healthy = true; state = await checkRelease({ ...config, previous: state }); assert.equal(state.incident, false);
    assert.equal(received.length, 3); assert.equal(received[0], received[1]);
    assert.match(received[2], /recovered/); assert.ok(received.every(body => !body.includes("DO-NOT-FORWARD") && !body.includes(config.token)));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

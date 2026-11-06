import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createMobileHttpTransport, mobileHttpTransport } from "../src/lib/supabase/mobile-http-transport";

test("authenticated RPC transport reuses active connections, retires idle sockets and preserves body and headers", async () => {
  let connectionCount = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.setHeader("Keep-Alive", "timeout=300");
    res.end(JSON.stringify({ authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() }));
  });
  server.on("connection", () => connectionCount++);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const transport = createMobileHttpTransport(origin, globalThis.fetch, {
    connections: 1, keepAliveTimeout: 100, keepAliveMaxTimeout: 100, keepAliveTimeoutThreshold: 10,
  });
  const read = async () => {
    const response = await transport.fetch(origin + "/rest/v1/rpc/rezlee_mobile_screen_bootstrap", {
      method: "POST", headers: { Authorization: "Bearer synthetic-only" }, body: '{"p_screen":"care"}',
    });
    assert.deepEqual(await response.json(), { authorization: "Bearer synthetic-only", body: '{"p_screen":"care"}' });
  };
  try {
    await read(); await read();
    assert.equal(connectionCount, 1);
    assert.equal(transport.stats().connected, 1);
    // Undici uses a coarse idle timer. Poll for actual retirement rather than assuming exact timing.
    for (let i = 0; i < 20 && transport.stats().connected; i++) await delay(100);
    assert.equal(transport.stats().connected, 0);
    await read(); assert.equal(connectionCount, 2);
  } finally { await transport.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("pool preserves cancellation and does not route other origins through the database pool", async () => {
  let received: RequestInit | undefined;
  const transport = createMobileHttpTransport("https://database.invalid", async (_input, init) => {
    received = init; init?.signal?.throwIfAborted(); return new Response("ok");
  });
  try {
    const init = { headers: { test: "value" } };
    await transport.fetch("https://unrelated.invalid", init);
    assert.equal(received, init);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(transport.fetch("https://database.invalid/read", { signal: controller.signal }), { name: "AbortError" });
  } finally { await transport.destroy(); }
});

test("HTTP pool candidate cannot alter production even with its flag enabled", () => {
  const before = process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED;
  process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED = "true";
  try { assert.equal(mobileHttpTransport("https://production.invalid"), undefined); }
  finally {
    if (before === undefined) delete process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED;
    else process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED = before;
  }
});

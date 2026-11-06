import test from "node:test";
import assert from "node:assert/strict";
import { createEzgbClient, resetEzgbTokenCacheForTests } from "../src/lib/ezgb/client";

test("EZGB requests explicit bills or intervals for the child account, never meter or default bills", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["EZGB_CLIENT_ID", "EZGB_CLIENT_SECRET", "EZGB_BASE_URL"] as const;
  const previous = names.map(name => process.env[name]);
  process.env.EZGB_CLIENT_ID = "fixture-only";
  process.env.EZGB_CLIENT_SECRET = "fixture-only";
  process.env.EZGB_BASE_URL = "https://ezgb.example.invalid";
  resetEzgbTokenCacheForTests();
  const calls: string[] = [];
  let failIntervals = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://ezgb.example.invalid");
    calls.push(url.pathname);
    if (url.pathname === "/oauth/token") {
      return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    }
    assert.equal(init?.method ?? "GET", "GET");
    if (failIntervals) return new Response("Unavailable", { status: 404 });
    return Response.json(url.pathname.endsWith("/bills/json") ? { bills: [] } : { fixture: "interval-response" });
  };
  try {
    const client = createEzgbClient();
    await client.getBills("child/id");
    assert.deepEqual(await client.getIntervals("child/id"), { fixture: "interval-response" });
    await client.getMeterData("child/id");
    assert.deepEqual(calls, [
      "/oauth/token",
      "/api/accountData/child%2Fid/bills/json",
      "/api/accountData/child%2Fid/intervals/json",
      "/api/accountData/child%2Fid/intervals/json",
    ]);
    failIntervals = true;
    const before = calls.length;
    await assert.rejects(client.getIntervals("child/id"));
    assert.deepEqual(calls.slice(before), ["/api/accountData/child%2Fid/intervals/json"]);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    resetEzgbTokenCacheForTests();
  }
});

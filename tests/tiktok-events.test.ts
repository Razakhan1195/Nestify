import test from "node:test";
import assert from "node:assert/strict";
import { prepareTikTokRegistration, sendTikTokRegistration } from "../src/lib/tiktok-events";

function request(url = "https://rezlee.com/api/waitlist") {
  return new Request(url, { headers: {
    "x-vercel-forwarded-for": "203.0.113.9", "user-agent": "test-browser",
    referer: "https://rezlee.com/?email=private@example.com&token=secret",
    cookie: "session=private-session; _ttp=browser-cookie",
  } });
}

test("server conversion needs explicit consent and only carries allowed attribution data", () => {
  assert.equal(prepareTikTokRegistration(request(), undefined), null);
  assert.equal(prepareTikTokRegistration(request(), { consent: false }), null);
  assert.equal(prepareTikTokRegistration(request(), { consent: "true" }), null);
  assert.equal(prepareTikTokRegistration(request("https://staging.rezlee.com/api/waitlist"), { consent: true }), null);
  assert.equal(prepareTikTokRegistration(request("https://rezlee.com/admin"), { consent: true }), null);
  const payload = prepareTikTokRegistration(request(), {
    consent: true, ttp: "pixel-cookie", ttclid: "click-123",
    email: "private@example.com", phone: "15551234567", url: "https://evil.example",
  })!;
  assert.equal(payload.event_source_id, "DB1FAO3C77U1PLPL6HHG");
  assert.equal(payload.data[0].event, "CompleteRegistration");
  assert.match(payload.data[0].event_id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(payload.data[0].user, {
    ttp: "pixel-cookie", ttclid: "click-123", ip: "203.0.113.9", user_agent: "test-browser",
  });
  assert.deepEqual(payload.data[0].page, { url: "https://rezlee.com/" });
  const serialized = JSON.stringify(payload);
  for (const excluded of ["private@example.com", "15551234567", "secret", "private-session", "evil.example"])
    assert.equal(serialized.includes(excluded), false);
  const noMatch = new Request("https://rezlee.com/api/waitlist", { headers: { "x-vercel-forwarded-for": "invalid" } });
  assert.equal(prepareTikTokRegistration(noMatch, { consent: true, ttp: "bad\nvalue", ttclid: "x".repeat(513) }), null);
});

test("missing token makes zero API calls; retries use the identical event ID and payload", async () => {
  const payload = prepareTikTokRegistration(request(), { consent: true })!;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? Response.json({}, { status: 503 }) : Response.json({ code: 0 });
  };
  assert.deepEqual(await sendTikTokRegistration(payload, undefined, fake), { status: "disabled" });
  assert.equal(calls.length, 0);
  assert.deepEqual(await sendTikTokRegistration(payload, "test-token", fake), { status: "sent" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init?.body, calls[1].init?.body);
  assert.equal(JSON.parse(String(calls[0].init?.body)).data[0].event_id, payload.data[0].event_id);
  assert.equal(calls[0].url, "https://business-api.tiktok.com/open_api/v1.3/event/track/");
  assert.equal(new Headers(calls[0].init?.headers).get("Access-Token"), "test-token");
  assert.equal(String(calls[0].init?.body).includes("test-token"), false);
});

test("TikTok application errors and network failures cannot escape to signup", async () => {
  const payload = prepareTikTokRegistration(request(), { consent: true })!;
  let calls = 0;
  const rejected: typeof fetch = async () => { calls++; return Response.json({ code: 40101, message: "invalid" }); };
  assert.deepEqual(await sendTikTokRegistration(payload, "test-token", rejected), { status: "failed", httpStatus: 200, code: 40101 });
  assert.equal(calls, 1);
  const failed: typeof fetch = async () => { throw Error("network"); };
  assert.deepEqual(await sendTikTokRegistration(payload, "test-token", failed), { status: "failed" });
});

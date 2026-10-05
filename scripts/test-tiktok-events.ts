import { prepareTikTokRegistration, sendTikTokRegistration } from "../src/lib/tiktok-events";

// Opt-in CLI diagnostic only. Never invoked by the application or normal builds.
async function main() {
  const testCode = process.env.REZLEE_TIKTOK_TEST_CODE;
  const accessToken = process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
  if (!testCode || !/^TEST[A-Z0-9]{1,32}$/.test(testCode)) {
    throw new Error("An explicit TikTok Test Events code is required.");
  }
  if (!accessToken?.trim()) throw new Error("TikTok access token is not configured.");
  const event = prepareTikTokRegistration(new Request("https://rezlee.com/api/waitlist", {
    headers: {
      // Documentation-only address; no customer or household data is used.
      "x-vercel-forwarded-for": "203.0.113.10",
      "user-agent": "Mozilla/5.0 (compatible; RezleeIntegrationTest/1.0)",
    },
  }), { consent: true });
  if (!event) throw new Error("Could not construct the test event.");
  const payload = { ...event, test_event_code: testCode };
  let receipt: { httpStatus: number; code?: number; requestId?: string } | undefined;
  const observedFetch: typeof fetch = async (url, init) => {
    // Check the final serialized request so a diagnostic can never emit a live event.
    const sent = JSON.parse(String(init?.body));
    if (sent.test_event_code !== testCode) throw new Error("Test code missing from payload.");
    const response = await fetch(url, init);
    const body = await response.clone().json().catch(() => null) as { code?: unknown; request_id?: unknown } | null;
    receipt = {
      httpStatus: response.status,
      ...(typeof body?.code === "number" && { code: body.code }),
      ...(typeof body?.request_id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(body.request_id) && { requestId: body.request_id }),
    };
    return response;
  };
  const result = await sendTikTokRegistration(payload, accessToken, observedFetch);
  console.log("TIKTOK_TEST_RECEIPT", JSON.stringify({
    pixelId: payload.event_source_id, event: payload.data[0].event,
    eventId: payload.data[0].event_id, testCode, result, receipt,
  }));
  if (result.status !== "sent") process.exitCode = 1;
}
main().catch(() => {
  console.error("TikTok test could not run; verify the explicit test code and server configuration.");
  process.exitCode = 1;
});

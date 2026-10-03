import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { customerWebAccessEnabled, isCustomerWebRoute } from "../src/lib/auth/web-access";
import { operatorAllowed } from "../src/lib/ops/policy";

const blocked = ["/app", "/app/bills", "/app/onboarding", "/signup", "/signup/check-email", "/dashboard", "/bills", "/documents", "/appliances", "/assistant", "/maintenance", "/repairs", "/settings", "/warranties"];

test("customer web access fails closed and requires an explicit opt-in", () => {
  const previous = process.env.REZLEE_CUSTOMER_WEB_ENABLED;
  try {
    for (const value of [undefined, "", "false", "1"]) {
      if (value === undefined) delete process.env.REZLEE_CUSTOMER_WEB_ENABLED;
      else process.env.REZLEE_CUSTOMER_WEB_ENABLED = value;
      assert.equal(customerWebAccessEnabled(), false);
    }
    process.env.REZLEE_CUSTOMER_WEB_ENABLED = "true";
    assert.equal(customerWebAccessEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.REZLEE_CUSTOMER_WEB_ENABLED;
    else process.env.REZLEE_CUSTOMER_WEB_ENABLED = previous;
  }
});

test("legacy pages are blocked even with an existing browser session or stale form POST", async () => {
  delete process.env.REZLEE_CUSTOMER_WEB_ENABLED;
  for (const path of blocked) for (const method of ["GET", "POST"]) {
    const request = new NextRequest(`https://rezlee.com${path}?next=https://example.com`, {
      method, headers: { cookie: "sb-test-auth-token=existing-session" },
    });
    const response = await middleware(request);
    assert.equal(response.status, 303, `${method} ${path}`);
    assert.equal(response.headers.get("location"), "https://rezlee.com/login");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("set-cookie"), null, "must not revoke admin/native sessions");
  }
});

test("admin, native APIs, recovery and public routes remain outside the web block", () => {
  for (const path of ["/", "/login", "/admin", "/admin/waitlist", "/admin/access", "/admin/auth/callback", "/api/admin/waitlist", "/api/mobile/v1/home", "/api/deck/webhook", "/auth/mobile-confirmed", "/forgot-password", "/reset-password", "/waitlist/confirm", "/contact", "/privacy", "/application"]) {
    assert.equal(isCustomerWebRoute(path), false, path);
  }
  for (const path of blocked) assert.equal(isCustomerWebRoute(path), true, path);
});

test("operator access still requires the configured UUID allowlist", () => {
  const operator = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  assert.equal(operatorAllowed(operator, {REZLEE_OPS_ENABLED: "true", REZLEE_OPS_USER_IDS: operator}), true);
  assert.equal(operatorAllowed(other, {REZLEE_OPS_ENABLED: "true", REZLEE_OPS_USER_IDS: operator}), false);
  assert.equal(operatorAllowed(operator, {}), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { retiredCustomerPath } from "../src/lib/customer-web";
test("legacy customer screens cannot bypass retirement through saved or encoded URLs", () => {
 for (const path of ["/app", "/app/bills/123", "/app/onboarding", "/login", "/signup/check-email", "/forgot-password", "/reset-password", "/dashboard", "/bills", "/settings", "/auth/callback", "/auth/invite", "/invite/accept", "/%61pp/bills", "/app%2fbills", "/app//bills"]) assert.equal(retiredCustomerPath(path), true, path);
});
test("mobile, provider callbacks, staff controls and required public pages remain available", () => {
 for (const path of ["/api/mobile/v1/home", "/api/mobile/v1/roadmap", "/api/deck/webhook", "/auth/mobile-confirmed", "/admin/access", "/admin/auth/callback", "/api/admin/roadmap", "/gift/123", "/invite/a1b2c3d4e5f6", "/join-household", "/open", "/privacy", "/terms", "/delete-account", "/contact", "/"]) assert.equal(retiredCustomerPath(path), false, path);
});

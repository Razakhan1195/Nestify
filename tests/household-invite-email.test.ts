import test from "node:test";
import assert from "node:assert/strict";

import {
  renderHouseholdInviteEmail,
  renderHouseholdInviteText,
} from "../src/lib/email/household-invite";

const input = {
  inviterName: "Raza <Khan>",
  homeName: "Raza & Family Home",
  recipientEmail: "friend@example.com",
  joinUrl: "https://rezlee.com/auth/invite?token=abc&member=123",
  brandMarkUrl: "https://rezlee.com/rezlee-mark-email.png",
};

test("household invite email uses Rezlee branding, escapes content, and includes onboarding CTA", () => {
  const html = renderHouseholdInviteEmail(input);

  assert.match(html, /rezlee-mark-email\.png/);
  assert.match(html, /Rezlee/);
  assert.match(html, /Join household/);
  assert.match(html, /Your privacy stays separate/);
  assert.match(html, /Raza &lt;Khan&gt;/);
  assert.match(html, /Raza &amp; Family Home/);
  assert.doesNotMatch(html, />⌂</);
});

test("household invite includes a useful plain-text fallback", () => {
  const text = renderHouseholdInviteText(input);

  assert.match(text, /Raza <Khan> invited you to join Raza & Family Home on Rezlee/);
  assert.match(text, /Join household: https:\/\/rezlee\.com\/auth\/invite/);
  assert.match(text, /Private Bills and Vault records are not automatically shared/);
});

import { createAdminClient } from "@/lib/supabase/admin";
import { appleEmailDeliveryAllowed } from "@/lib/auth/apple-events";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

export function renderHouseholdInviteEmail(input: {
  inviterName: string;
  homeName: string;
  recipientEmail: string;
  joinUrl: string;
  brandMarkUrl: string;
}) {
  const inviter = escapeHtml(input.inviterName);
  const home = escapeHtml(input.homeName);
  const email = escapeHtml(input.recipientEmail);
  const joinUrl = escapeHtml(input.joinUrl);
  const brandMarkUrl = escapeHtml(input.brandMarkUrl);

  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:520px){.rz-hero{padding:30px 24px!important}.rz-body-pad{padding-left:20px!important;padding-right:20px!important}.rz-title{font-size:27px!important}.rz-outer{padding:22px 8px!important}}</style></head><body style="margin:0;background:#f7f4ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e352b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${inviter} invited you to share ${home} on Rezlee.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f4ec;"><tr><td class="rz-outer" align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;table-layout:fixed;">
<tr><td style="padding:0 4px 18px;text-align:center;"><img src="${brandMarkUrl}" width="38" height="38" alt="Rezlee" style="display:inline-block;width:38px;height:38px;border:0;vertical-align:middle;"><div style="margin-top:8px;font-size:25px;font-weight:800;letter-spacing:-.7px;color:#244a3a;">Rezlee</div><div style="margin-top:4px;font-size:12px;color:#7b847d;">Your place, under control.</div></td></tr>
<tr><td style="overflow:hidden;border-radius:28px;background:#fff;border:1px solid #d9ded5;box-shadow:0 10px 28px rgba(36,74,58,.08);">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;">
<tr><td class="rz-hero" style="background:#244a3a;padding:38px 36px 34px;color:#fff;"><div style="width:58px;height:58px;border-radius:18px;background:#f7f4ec;text-align:center;line-height:58px;"><img src="${brandMarkUrl}" width="34" height="34" alt="" style="display:inline-block;width:34px;height:34px;margin-top:12px;border:0;"></div><div style="margin-top:22px;font-size:13px;font-weight:700;color:#bdd0c5;text-transform:uppercase;letter-spacing:.08em;">Household invitation</div><h1 class="rz-title" style="margin:9px 0 0;font-size:31px;line-height:1.15;letter-spacing:-.7px;font-weight:750;color:#fff;overflow-wrap:anywhere;word-break:break-word;">${inviter} invited you to ${home}</h1><p style="margin:15px 0 0;max-width:500px;font-size:15px;line-height:1.6;color:#d7e0da;overflow-wrap:anywhere;">Join them on Rezlee so the work of running a home can be shared instead of living in one person’s head.</p></td></tr>
<tr><td class="rz-body-pad" style="padding:30px 30px 6px;"><div style="font-size:18px;font-weight:750;color:#1e352b;">What Rezlee helps you do</div></td></tr>
<tr><td class="rz-body-pad" style="padding:12px 30px 4px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:0 0 10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e0e4dd;border-radius:18px;background:#fbfaf6;"><tr><td width="56" valign="middle" style="padding:16px 0 16px 16px;"><div style="width:40px;height:40px;border-radius:13px;background:#e7efe9;text-align:center;line-height:40px;font-size:19px;color:#244a3a;">✓</div></td><td valign="middle" style="padding:16px 16px 16px 8px;"><div style="font-size:14px;font-weight:750;color:#1e352b;">Know what’s yours</div><div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6e7770;">See the responsibilities and routines you own.</div></td></tr></table></td></tr>
<tr><td style="padding:0 0 10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e0e4dd;border-radius:18px;background:#fbfaf6;"><tr><td width="56" valign="middle" style="padding:16px 0 16px 16px;"><div style="width:40px;height:40px;border-radius:13px;background:#e7efe9;text-align:center;line-height:40px;font-size:19px;color:#244a3a;">↻</div></td><td valign="middle" style="padding:16px 16px 16px 8px;"><div style="font-size:14px;font-weight:750;color:#1e352b;">Share fairly</div><div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6e7770;">Rotate recurring chores without the reminders.</div></td></tr></table></td></tr>
<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e0e4dd;border-radius:18px;background:#fbfaf6;"><tr><td width="56" valign="middle" style="padding:16px 0 16px 16px;"><div style="width:40px;height:40px;border-radius:13px;background:#e7efe9;text-align:center;line-height:40px;font-size:19px;color:#244a3a;">✦</div></td><td valign="middle" style="padding:16px 16px 16px 8px;"><div style="font-size:14px;font-weight:750;color:#1e352b;">Ask Rezlee</div><div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6e7770;">Get practical AI help for the household and what comes next.</div></td></tr></table></td></tr>
</table></td></tr>
<tr><td class="rz-body-pad" style="padding:22px 30px 8px;"><div style="border-radius:17px;background:#eef3ee;padding:16px 18px;font-size:13px;line-height:1.55;color:#59665e;"><strong style="color:#244a3a;">Your privacy stays separate.</strong> Joining shares Household, Care and expenses. Private Bills and Vault records are not automatically shared.</div></td></tr>
<tr><td class="rz-body-pad" style="padding:22px 30px 8px;text-align:center;"><a href="${joinUrl}" style="display:inline-block;background:#244a3a;color:#fff;text-decoration:none;font-size:15px;font-weight:750;padding:15px 28px;border-radius:13px;">Join household</a></td></tr>
<tr><td style="padding:14px 36px 32px;text-align:center;font-size:11px;line-height:1.55;color:#8a918b;">This invitation is tied to ${email}. If you weren’t expecting it, you can ignore this email.</td></tr>
</table></td></tr><tr><td style="padding:18px 12px 0;text-align:center;font-size:11px;color:#929892;">Rezlee · Your place, under control.</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderHouseholdInviteText(input: {
  inviterName: string;
  homeName: string;
  recipientEmail: string;
  joinUrl: string;
}) {
  return [
    `${input.inviterName} invited you to join ${input.homeName} on Rezlee.`,
    "",
    "Rezlee helps households share responsibilities, recurring care, and the things everyone otherwise has to remember.",
    "",
    "Your privacy stays separate: joining shares Household, Care and expenses. Private Bills and Vault records are not automatically shared.",
    "",
    `Join household: ${input.joinUrl}`,
    "",
    `This invitation is tied to ${input.recipientEmail}. If you weren’t expecting it, you can ignore this email.`,
    "",
    "Rezlee · Your place, under control.",
  ].join("\n");
}

export function householdInviteEmailReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendHouseholdInviteEmail(input: {
  memberId: string;
  inviterName: string;
  homeName: string;
  recipientEmail: string;
  joinUrl: string;
  brandMarkUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Transactional email is not configured.");
  }

  if (process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED === "true" && !await appleEmailDeliveryAllowed(createAdminClient(), input.recipientEmail))
    throw new Error("This recipient has paused email delivery. You can share the invitation link instead.");
  const response = await fetch("https://api.resend.com/emails", {
    signal: AbortSignal.timeout(10_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `household-invite-${input.memberId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.recipientEmail],
      subject: `${input.inviterName} invited you to join ${input.homeName} on Rezlee`,
      html: renderHouseholdInviteEmail(input),
      text: renderHouseholdInviteText(input),
      tags: [{ name: "category", value: "household_invite" }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the invitation (${response.status}). Please try again.`);
  }
  return response.json() as Promise<{ id: string }>;
}

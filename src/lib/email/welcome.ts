export type WelcomePayload = { from: string; to: string[]; subject: string; html: string; text: string; tags: { name: string; value: string }[] };
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function welcomePayload(from: string, recipient: string, origin: string): WelcomePayload {
  const url = new URL("/open", origin);
  if (url.protocol !== "https:" || !["rezlee.com", "www.rezlee.com", "staging.rezlee.com"].includes(url.hostname)) throw Error("Welcome destination unavailable");
  const link = escape(url.toString());
  return {
    from, to: [recipient], subject: "Welcome to Rezlee",
    tags: [{ name: "category", value: "welcome" }],
    text: ["Welcome to Rezlee.", "", "A little less to keep in your head.", "Start with one thing you’d like to take care of: a bill to understand, a record to keep, or a reminder for your home.", "", "You don’t need to set everything up today. Rezlee will help you find your next step.", "", "Open Rezlee: " + url, "", "Joining someone’s household? Return to your invitation to finish joining.", "", "You’re receiving this one-time welcome because you created a Rezlee account. Your place, under control."].join("\n"),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Rezlee</title></head>
<body style="margin:0;background:#F8F7F3;color:#202D28;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Start with one thing. You can add the rest when you need it.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 8px 28px;font-size:30px;font-weight:600;letter-spacing:-1px;color:#264D3E;">rezlee</td></tr>
<tr><td style="background:#FFFDF8;border:1px solid #D9DFD8;border-radius:20px;padding:32px 24px;">
<p style="margin:0 0 12px;font-size:14px;color:#58665F;">Welcome to Rezlee</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;letter-spacing:-.5px;font-weight:600;">A little less to keep<br>in your head.</h1>
<p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Start with one thing you’d like to take care of:</p>
<table role="presentation" width="100%" style="background:#EEF2EB;border-radius:12px;" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;font-size:15px;line-height:1.8;">A bill to understand.<br>A record to keep.<br>A reminder for your home.</td></tr></table>
<p style="margin:22px 0;font-size:16px;line-height:1.6;">You don’t need to set everything up today. Rezlee will help you find your next step.</p>
<a href="${link}" style="display:inline-block;padding:15px 24px;background:#264D3E;color:#FAF7EF;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none;">Open Rezlee</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#58665F;">Joining someone’s household? Return to your invitation to finish joining.</p>
</td></tr><tr><td style="padding:20px 8px;font-size:12px;line-height:1.6;color:#58665F;">You’re receiving this one-time welcome because you created a Rezlee account.<br>Rezlee · Your place, under control.</td></tr>
</table></td></tr></table></body></html>`,
  };
}
export type WelcomeClaim = { state: string; id?: string; leaseId?: string; payload?: WelcomePayload };
type DeliveryStatus = "accepted" | "retry" | "failed" | "uncertain";
export async function deliverWelcome(input: {
  claim(): Promise<WelcomeClaim>;
  finish(leaseId: string, status: DeliveryStatus, providerId: string | null): Promise<boolean>;
  send(payload: WelcomePayload, key: string): Promise<Response>;
}): Promise<string> {
  const claim = await input.claim();
  if (claim.state !== "claimed") return claim.state;
  if (!claim.id || !claim.leaseId || !claim.payload) throw Error("Incomplete welcome claim");
  let status: DeliveryStatus = "retry", providerId: string | null = null;
  try {
    const response = await input.send(claim.payload, "rezlee-welcome-" + claim.id);
    if (response.ok) {
      const body = await response.json().catch(() => null);
      if (typeof body?.id === "string" && body.id.length <= 200) { status = "accepted"; providerId = body.id; }
      else status = "uncertain";
    } else status = response.status === 429 || response.status === 409 || response.status >= 500 ? "retry" : "failed";
  } catch { /* Retry the same stored message/key only within the database's bounded window. */ }
  if (!await input.finish(claim.leaseId, status, providerId)) throw Error("Could not record welcome delivery");
  return status;
}

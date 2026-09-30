import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac } from "node:crypto";
import { unsubscribeToken } from "./policy";
export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export function waitlistConfig() {
  const secret = process.env.REZLEE_WAITLIST_SIGNING_KEY ?? "",
    address = process.env.REZLEE_MAILING_ADDRESS ?? "",
    contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
  return {
    secret,
    address,
    contact,
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "https://rezlee.com",
    ready:
      process.env.REZLEE_WAITLIST_ENABLED === "true" &&
      secret.length >= 32 &&
      address.length > 8 &&
      contact.includes("@") &&
      !!process.env.RESEND_API_KEY &&
      !!process.env.RESEND_FROM_EMAIL,
  };
}
export async function admit(request: Request, kind = "join") {
  const { secret } = waitlistConfig();
  const ip =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = createHmac("sha256", secret)
    .update(kind + ":" + ip)
    .digest("hex");
  const { data, error } = await createAdminClient().rpc(
    "rezlee_waitlist_limit",
    { p_key: key, p_max: kind === "join" ? 8 : 30, p_seconds: 3600 },
  );
  if (error) throw Error("limit_unavailable");
  return data === true;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function sendConfirmation(
  id: string,
  email: string,
  token: string,
) {
  const c = waitlistConfig(),
    link = new URL("/waitlist/confirm", c.origin);
  link.searchParams.set("id", id);
  link.searchParams.set("token", token);
  const unsubscribe = new URL("/waitlist/unsubscribe", c.origin);
  unsubscribe.searchParams.set("id", id);
  unsubscribe.searchParams.set("token", unsubscribeToken(id, c.secret));
  const text = `Confirm your Rezlee waitlist signup\n\nYou requested to join Rezlee’s waitlist. Confirm your email to finish joining: ${link}\n\nThis link expires in 24 hours. If you did not request it, ignore this message.\n\nUnsubscribe: ${unsubscribe}\nRezlee\n${c.address}\n${c.contact}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `waitlist-${id}-${token.slice(0, 16)}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      reply_to: c.contact,
      subject: "Confirm your Rezlee waitlist signup",
      text,
      html: `<div style="background:#f7f4ec;padding:32px;font-family:Arial,sans-serif;color:#244c40"><div style="max-width:480px;margin:auto;background:white;border-radius:20px;padding:32px"><h1>One more step.</h1><p>Confirm your email to join the Rezlee waitlist.</p><p><a style="display:inline-block;background:#244c40;color:white;border-radius:12px;padding:14px 20px;text-decoration:none" href="${escape(link.toString())}">Confirm my email</a></p><p>This link expires in 24 hours. If you did not request it, you can ignore this message.</p><p style="font-size:12px"><a href="${escape(unsubscribe.toString())}">Unsubscribe</a><br/>Rezlee<br/>${escape(c.address)}<br/>${escape(c.contact)}</p></div></div>`,
    }),
  });
  if (!response.ok) throw Error("email_unavailable");
}

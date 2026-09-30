import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import {
  normalizedEmail,
  tokenHash,
  sameOrigin,
  validUnsubscribe,
} from "@/lib/waitlist/policy";
import {
  waitlistConfig,
  admit,
  sendConfirmation,
  privateHeaders,
} from "@/lib/waitlist/server";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
export async function GET() {
  try {
    const c = waitlistConfig();
    if (!c.ready) return reply({ available: false });
    const r = await createAdminClient()
      .from("rezlee_waitlist_campaign")
      .select("allocated,held_back")
      .eq("singleton", true)
      .single();
    if (r.error) throw Error();
    return reply({
      available: true,
      remaining: Math.max(0, 10000 - r.data.held_back - r.data.allocated),
      heldBack: r.data.held_back,
    });
  } catch {
    return reply({ available: false }, 503);
  }
}
export async function POST(request: Request) {
  const c = waitlistConfig();
  if (!sameOrigin(request, c.origin))
    return reply({ error: "Please use the signup form on Rezlee." }, 403);
  let b: Record<string, unknown>;
  try {
    const value = await readBoundedJson(request, 4096);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    b = value as Record<string, unknown>;
  } catch {
    return reply({ error: "Check your details and try again." }, 400);
  }
  try {
    const db = createAdminClient();
    if (b.action === "unsubscribe") {
      if (
        typeof b.id !== "string" ||
        typeof b.token !== "string" ||
        c.secret.length < 32 ||
        !validUnsubscribe(b.id, b.token, c.secret)
      )
        return reply({ error: "This unsubscribe link is invalid." }, 400);
      const r = await db
        .from("rezlee_waitlist")
        .update({
          status: "unsubscribed",
          confirmation_hash: null,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      if (r.error) throw Error();
      return reply({ state: "unsubscribed" });
    }
    if (b.action === "confirm") {
      if (c.secret.length < 32 || !(await admit(request, "confirm")))
        return reply({ error: "Please try again later." }, 429);
      if (
        typeof b.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(b.id) ||
        typeof b.token !== "string" ||
        !/^[a-f0-9]{64}$/.test(b.token)
      )
        return reply({ error: "This confirmation link is invalid." }, 400);
      const r = await db.rpc("rezlee_confirm_waitlist", {
        p_id: b.id,
        p_hash: tokenHash(b.token),
      });
      if (r.error) throw Error();
      if (r.data.state !== "confirmed")
        return reply(
          {
            error:
              r.data.state === "expired"
                ? "This link expired. Submit your email again for a fresh link."
                : "This confirmation link is invalid.",
          },
          400,
        );
      return reply(r.data);
    }
    if (!c.ready)
      return reply(
        {
          error:
            "Waitlist signup is not available yet. Please check back shortly.",
        },
        503,
      );
    if (b.website) return reply({ state: "pending" });
    const email = normalizedEmail(b.email);
    if (!email || b.consent !== true)
      return reply(
        {
          error:
            "Enter a valid email and agree to receive waitlist and launch emails.",
        },
        400,
      );
    if (!(await admit(request)))
      return reply(
        { error: "Too many attempts. Please try again later." },
        429,
      );
    const token = randomBytes(32).toString("hex"),
      r = await db.rpc("rezlee_join_waitlist", {
        p_email: email,
        p_hash: tokenHash(token),
      });
    if (r.error) throw Error();
    if (r.data.id) {
      try {
        for (const [key, max, seconds] of [
          ["waitlist-mail-day", 80, 86400],
          ["waitlist-mail-month", 2000, 2592000],
        ] as const) {
          const limit = await db.rpc("rezlee_waitlist_limit", {
            p_key: key,
            p_max: max,
            p_seconds: seconds,
          });
          if (limit.error || limit.data !== true) throw Error("email_budget");
        }
        await sendConfirmation(r.data.id, email, token);
        await db
          .from("rezlee_waitlist")
          .update({ delivery_status: "sent" })
          .eq("id", r.data.id)
          .eq("confirmation_hash", tokenHash(token));
      } catch {
        await db
          .from("rezlee_waitlist")
          .update({ delivery_status: "failed" })
          .eq("id", r.data.id)
          .eq("confirmation_hash", tokenHash(token));
        return reply(
          {
            error:
              "Your signup is saved, but we could not send the confirmation. Please try again later. Your place is reserved only after confirmation.",
          },
          503,
        );
      }
    }
    return reply({ state: "pending" });
  } catch {
    return reply(
      { error: "We could not complete that request. Please try again." },
      503,
    );
  }
}
